import logging
import math
import shutil
import time
from datetime import datetime
from pathlib import Path
from threading import BoundedSemaphore
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..config import Settings
from ..db import get_db, session_scope
from ..deps import get_app_settings, get_current_guest, is_admin_request
from ..errors import api_error
from ..images import (
    ImageTooLargeError,
    ImageValidationError,
    StorageFullError,
    UploadTooLargeError,
    inspect_upload_media,
    save_optimized_image,
    save_preview,
    save_thumbnail,
    save_video_preview,
    stream_upload,
    tmp_upload_path,
)
from ..models import Guest, Photo
from ..routers.guests import photo_out
from ..schemas import PhotoOut
from ..storage import (
    absolute_from_data,
    ensure_guest_dirs,
    legacy_thumbnail_path,
    move_photo_to_trash,
    original_path,
    preview_path,
    relative_to_data,
    thumbnail_path,
)

router = APIRouter()
media_router = APIRouter()
preview_semaphore = BoundedSemaphore(1)
thumbnail_semaphore = BoundedSemaphore(2)
MEDIA_CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}
logger = logging.getLogger("wedding.photos")


def reserve_photo_number(db: Session, guest_id: int) -> int:
    """Атомарно резервирует следующий номер фото, чтобы параллельные загрузки не конфликтовали."""

    number = db.execute(
        text(
            """
            UPDATE guests
            SET next_photo_number = next_photo_number + 1
            WHERE id = :guest_id
            RETURNING next_photo_number - 1
            """
        ),
        {"guest_id": guest_id},
    ).scalar_one_or_none()
    if number is None:
        db.rollback()
        raise api_error(401, "UNAUTHORIZED", "Войдите по ссылке QR еще раз.")
    db.commit()
    return int(number)


def remove_file(path: Optional[Path]) -> None:
    """Удаляет файл после неудачной DB-транзакции, не падая на отсутствующем пути."""

    if path is not None:
        path.unlink(missing_ok=True)


def upload_limit_mb(settings: Settings) -> int:
    """Возвращает лимит загрузки в мегабайтах для понятного сообщения гостю."""

    return max(1, math.ceil(settings.max_upload_bytes / 1024 / 1024))


def ensure_upload_disk_space(settings: Settings, expected_size: int) -> None:
    """Не начинает upload, который съест резерв ОС, PostgreSQL и логов."""

    free_bytes = shutil.disk_usage(settings.data_dir).free
    if free_bytes - max(0, expected_size) >= settings.disk_free_reserve_bytes:
        return
    raise api_error(507, "STORAGE_FULL", "На сервере заканчивается место. Сообщите организатору.")


def optimize_stored_original(settings: Settings, db: Session, photo: Photo, original: Path) -> None:
    """Атомарно оптимизирует большой оригинал в фоне, сохраняя исходник при ошибке."""

    candidate = tmp_upload_path(settings).with_suffix(".optimized.jpg")
    optimized = save_optimized_image(
        original,
        candidate,
        settings.original_image_optimize_min_bytes,
        settings.original_image_max_edge,
        settings.original_image_quality,
    )
    if optimized is None:
        return

    size_bytes, extension, mime = optimized
    final_optimized = original_path(settings, photo.guest, photo.number, extension)
    previous_original = original
    backup_original: Optional[Path] = None
    if final_optimized == previous_original:
        backup_original = previous_original.with_name(f"{previous_original.name}.before-optimization")
        backup_original.unlink(missing_ok=True)
        previous_original.replace(backup_original)
    candidate.replace(final_optimized)
    photo.original_path = relative_to_data(settings, final_optimized)
    photo.size_bytes = size_bytes
    photo.mime = mime
    try:
        db.commit()
    except Exception:
        db.rollback()
        final_optimized.unlink(missing_ok=True)
        if backup_original is not None:
            backup_original.replace(previous_original)
        raise
    if backup_original is not None:
        backup_original.unlink(missing_ok=True)
    elif final_optimized != previous_original:
        previous_original.unlink(missing_ok=True)
    logger.info("original_optimized photo_id=%s size_bytes=%s", photo.id, size_bytes)


def build_media_preview(settings: Settings, photo_id: int) -> None:
    """Создает preview, thumbnail и poster после ответа гостю, не блокируя загрузку."""

    with session_scope() as db:
        photo = (
            db.query(Photo)
            .options(joinedload(Photo.guest))
            .filter(Photo.id == photo_id, Photo.status == "active")
            .one_or_none()
        )
        if photo is None:
            return

        original = absolute_from_data(settings, photo.original_path)
        if not original.exists():
            logger.warning("preview_original_missing photo_id=%s original=%s", photo.id, original)
            return

        final_preview = preview_path(settings, photo.guest, photo.number)
        final_thumbnail = thumbnail_path(settings, photo.guest, photo.number)
        with preview_semaphore:
            try:
                if not photo.preview_path:
                    if photo.mime.startswith("video/"):
                        if not save_video_preview(original, final_preview):
                            logger.warning("video_preview_empty photo_id=%s original=%s", photo.id, original)
                            return
                    else:
                        save_preview(original, final_preview)
                    save_thumbnail(final_preview, final_thumbnail)
                    photo.preview_path = relative_to_data(settings, final_preview)
                    db.commit()
            except Exception:
                db.rollback()
                final_preview.unlink(missing_ok=True)
                final_thumbnail.unlink(missing_ok=True)
                logger.exception("preview_failed photo_id=%s", photo.id)
                return

            if not photo.mime.startswith("video/"):
                try:
                    optimize_stored_original(settings, db, photo, original)
                except Exception:
                    logger.exception("original_optimization_failed photo_id=%s", photo.id)
        logger.info("preview_ready photo_id=%s thumbnail=%s", photo.id, final_thumbnail)


@router.post("/photos", response_model=PhotoOut)
def upload_photo(
    file: UploadFile,
    response: Response,
    background_tasks: BackgroundTasks,
    guest: Guest = Depends(get_current_guest),
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
):
    """Принимает фото или видео гостя и сохраняет запись без чтения файла целиком в память."""

    started = time.monotonic()
    tmp_path = tmp_upload_path(settings)
    filename = file.filename or "unnamed"
    logger.info("upload_start guest_id=%s guest_slug=%s filename=%r", guest.id, guest.slug, filename)
    ensure_upload_disk_space(settings, int(file.size or 0))
    try:
        size_bytes, sha256 = stream_upload(
            file,
            tmp_path,
            settings.max_upload_bytes,
            settings.disk_free_reserve_bytes,
        )
    except UploadTooLargeError:
        logger.warning("upload_rejected_too_large guest_id=%s guest_slug=%s filename=%r", guest.id, guest.slug, filename)
        raise api_error(413, "FILE_TOO_LARGE", f"Файл больше {upload_limit_mb(settings)} МБ.") from None
    except StorageFullError:
        logger.error("upload_rejected_storage_full guest_id=%s guest_slug=%s filename=%r", guest.id, guest.slug, filename)
        raise api_error(507, "STORAGE_FULL", "На сервере заканчивается место. Сообщите организатору.") from None

    active_duplicate = (
        db.query(Photo)
        .filter(Photo.guest_id == guest.id, Photo.sha256 == sha256, Photo.status == "active")
        .one_or_none()
    )
    if active_duplicate:
        tmp_path.unlink(missing_ok=True)
        logger.info(
            "upload_duplicate guest_id=%s guest_slug=%s photo_id=%s number=%s size_bytes=%s duration_ms=%s",
            guest.id,
            guest.slug,
            active_duplicate.id,
            active_duplicate.number,
            size_bytes,
            round((time.monotonic() - started) * 1000, 1),
        )
        return photo_out(active_duplicate)

    try:
        media_type, extension, mime = inspect_upload_media(
            tmp_path,
            settings.max_image_pixels,
            filename,
            file.content_type,
        )
    except ImageTooLargeError:
        tmp_path.unlink(missing_ok=True)
        logger.warning(
            "upload_rejected_pixels guest_id=%s guest_slug=%s filename=%r size_bytes=%s max_pixels=%s",
            guest.id,
            guest.slug,
            filename,
            size_bytes,
            settings.max_image_pixels,
        )
        raise api_error(413, "IMAGE_TOO_LARGE", "Фото слишком большое по размеру. Выберите снимок поменьше.") from None
    except ImageValidationError:
        tmp_path.unlink(missing_ok=True)
        logger.warning(
            "upload_rejected_media guest_id=%s guest_slug=%s filename=%r size_bytes=%s",
            guest.id,
            guest.slug,
            filename,
            size_bytes,
        )
        raise api_error(
            415,
            "UNSUPPORTED_MEDIA_TYPE",
            "Выберите фото или видео: JPEG, PNG, WebP, HEIC, MP4, MOV или WebM.",
        ) from None

    number = reserve_photo_number(db, guest.id)
    ensure_guest_dirs(settings, guest)
    final_original = original_path(settings, guest, number, extension)
    shutil.move(str(tmp_path), str(final_original))

    photo = Photo(
        guest_id=guest.id,
        number=number,
        original_path=relative_to_data(settings, final_original),
        preview_path=None,
        original_name=file.filename,
        mime=mime,
        size_bytes=size_bytes,
        sha256=sha256,
        status="active",
    )
    db.add(photo)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        remove_file(final_original)
        active_duplicate = (
            db.query(Photo)
            .filter(Photo.guest_id == guest.id, Photo.sha256 == sha256, Photo.status == "active")
            .one_or_none()
        )
        if active_duplicate:
            logger.info(
                "upload_duplicate_after_race guest_id=%s guest_slug=%s photo_id=%s number=%s size_bytes=%s duration_ms=%s",
                guest.id,
                guest.slug,
                active_duplicate.id,
                active_duplicate.number,
                size_bytes,
                round((time.monotonic() - started) * 1000, 1),
            )
            return photo_out(active_duplicate)
        logger.warning("upload_conflict guest_id=%s guest_slug=%s number=%s", guest.id, guest.slug, number)
        raise api_error(409, "UPLOAD_CONFLICT", "Фото уже загружается. Попробуйте еще раз.") from None
    except Exception:
        db.rollback()
        remove_file(final_original)
        logger.exception("upload_commit_failed guest_id=%s guest_slug=%s number=%s", guest.id, guest.slug, number)
        raise
    db.refresh(photo)
    background_tasks.add_task(build_media_preview, settings, photo.id)
    logger.info(
        "upload_saved guest_id=%s guest_slug=%s photo_id=%s number=%s size_bytes=%s mime=%s preview=%s duration_ms=%s",
        guest.id,
        guest.slug,
        photo.id,
        photo.number,
        photo.size_bytes,
        photo.mime,
        bool(photo.preview_path),
        round((time.monotonic() - started) * 1000, 1),
    )
    response.status_code = 201
    return photo_out(photo)


@router.delete("/photos/{photo_id}", status_code=204)
def delete_my_photo(
    photo_id: int,
    guest: Guest = Depends(get_current_guest),
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> None:
    """Переносит активное фото текущего гостя в корзину."""

    photo = (
        db.query(Photo)
        .filter(Photo.id == photo_id, Photo.guest_id == guest.id, Photo.status == "active")
        .one_or_none()
    )
    if photo is None:
        raise api_error(404, "PHOTO_NOT_FOUND", "Фото не найдено.")
    move_photo_to_trash(settings, photo)
    photo.status = "trashed"
    photo.trashed_at = datetime.utcnow()
    db.commit()


def visible_photo_for_request(
    request: Request,
    db: Session,
    settings: Settings,
    photo_id: int,
    originals_admin_only: bool,
) -> Photo:
    """Проверяет, можно ли текущему запросу отдать превью или оригинал медиа."""

    photo = db.query(Photo).filter(Photo.id == photo_id).one_or_none()
    if photo is None:
        raise api_error(404, "PHOTO_NOT_FOUND", "Фото не найдено.")
    if is_admin_request(request, settings):
        return photo
    if originals_admin_only:
        raise api_error(404, "PHOTO_NOT_FOUND", "Фото не найдено.")
    if photo.status == "active":
        return photo
    raise api_error(404, "PHOTO_NOT_FOUND", "Фото не найдено.")


def active_photo_or_404(photo_id: int, db: Session) -> Photo:
    """Возвращает только активное медиа для публичного скачивания."""

    photo = db.query(Photo).filter(Photo.id == photo_id, Photo.status == "active").one_or_none()
    if photo is None:
        raise api_error(404, "PHOTO_NOT_FOUND", "Фото не найдено.")
    return photo


def ensure_thumbnail(settings: Settings, photo: Photo) -> Path:
    """Возвращает WebP-thumbnail, создавая его из превью для старых фото без отдельной миграции."""

    if not photo.preview_path:
        original = absolute_from_data(settings, photo.original_path)
        if not original.exists():
            raise api_error(404, "ORIGINAL_NOT_FOUND", "Оригинал видео не найден.")
        final_preview = preview_path(settings, photo.guest, photo.number)
        final_thumbnail = thumbnail_path(settings, photo.guest, photo.number)
        with preview_semaphore:
            if not final_preview.exists():
                if photo.mime.startswith("video/"):
                    if not save_video_preview(original, final_preview):
                        raise api_error(404, "THUMBNAIL_NOT_READY", "Постер видео еще не готов.")
                else:
                    save_preview(original, final_preview)
            if not final_thumbnail.exists():
                save_thumbnail(final_preview, final_thumbnail)
        photo.preview_path = relative_to_data(settings, final_preview)
        return final_thumbnail
    thumbnail = thumbnail_path(settings, photo.guest, photo.number)
    legacy_thumbnail = legacy_thumbnail_path(settings, photo.guest, photo.number)
    if thumbnail.exists():
        legacy_thumbnail.unlink(missing_ok=True)
        return thumbnail
    preview = absolute_from_data(settings, photo.preview_path)
    if not preview.exists():
        raise api_error(404, "PREVIEW_NOT_FOUND", "Превью еще не готово.")
    with thumbnail_semaphore:
        if not thumbnail.exists():
            save_thumbnail(preview, thumbnail)
            legacy_thumbnail.unlink(missing_ok=True)
    return thumbnail


@media_router.get("/media/previews/{photo_id}")
def get_preview(
    photo_id: int,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Отдает публичное превью активного фото или оригинал видео для просмотра."""

    photo = visible_photo_for_request(request, db, settings, photo_id, originals_admin_only=False)
    if photo.mime.startswith("video/"):
        return FileResponse(
            absolute_from_data(settings, photo.original_path),
            media_type=photo.mime,
            headers=MEDIA_CACHE_HEADERS,
        )
    if not photo.preview_path:
        ensure_thumbnail(settings, photo)
        db.commit()
    return FileResponse(absolute_from_data(settings, photo.preview_path), headers=MEDIA_CACHE_HEADERS)


@media_router.get("/media/thumbs/{photo_id}")
def get_thumbnail(
    photo_id: int,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Отдает маленький thumbnail для сеток, слайдеров и слабых устройств."""

    photo = visible_photo_for_request(request, db, settings, photo_id, originals_admin_only=False)
    preview_was_missing = not photo.preview_path
    thumbnail = ensure_thumbnail(settings, photo)
    if preview_was_missing and photo.preview_path:
        db.commit()
    return FileResponse(thumbnail, headers=MEDIA_CACHE_HEADERS)


@media_router.get("/media/downloads/{photo_id}")
def download_original(
    photo_id: int,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Отдает оригинал активного фото как скачиваемый файл общей галереи."""

    photo = active_photo_or_404(photo_id, db)
    filename = Path(photo.original_name or f"wedding-photo-{photo.id}").name
    return FileResponse(
        absolute_from_data(settings, photo.original_path),
        media_type=photo.mime,
        filename=filename,
    )


@media_router.get("/media/originals/{photo_id}")
def get_original(
    photo_id: int,
    request: Request,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Отдает оригинал фото только админскому запросу."""

    photo = visible_photo_for_request(request, db, settings, photo_id, originals_admin_only=True)
    return FileResponse(absolute_from_data(settings, photo.original_path), media_type=photo.mime)
