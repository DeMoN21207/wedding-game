import logging
import math
import shutil
import time
from datetime import datetime
from pathlib import Path
from threading import BoundedSemaphore
from typing import Optional

from fastapi import APIRouter, Depends, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import Settings
from ..db import get_db
from ..deps import get_app_settings, get_current_guest, is_admin_request
from ..errors import api_error
from ..images import (
    ImageTooLargeError,
    ImageValidationError,
    UploadTooLargeError,
    inspect_upload_media,
    optimize_original_image,
    save_preview,
    save_thumbnail,
    stream_upload,
    tmp_upload_path,
)
from ..models import Guest, Photo
from ..routers.guests import photo_out
from ..schemas import PhotoOut
from ..storage import (
    absolute_from_data,
    ensure_guest_dirs,
    move_photo_to_trash,
    original_path,
    preview_path,
    relative_to_data,
    thumbnail_path,
)

router = APIRouter()
media_router = APIRouter()
preview_semaphore = BoundedSemaphore(2)
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


@router.post("/photos", response_model=PhotoOut)
def upload_photo(
    file: UploadFile,
    response: Response,
    guest: Guest = Depends(get_current_guest),
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
):
    """Принимает фото или видео гостя и сохраняет запись без чтения файла целиком в память."""

    started = time.monotonic()
    tmp_path = tmp_upload_path(settings)
    filename = file.filename or "unnamed"
    logger.info("upload_start guest_id=%s guest_slug=%s filename=%r", guest.id, guest.slug, filename)
    try:
        size_bytes, sha256 = stream_upload(file, tmp_path, settings.max_upload_bytes)
    except UploadTooLargeError:
        logger.warning("upload_rejected_too_large guest_id=%s guest_slug=%s filename=%r", guest.id, guest.slug, filename)
        raise api_error(413, "FILE_TOO_LARGE", f"Файл больше {upload_limit_mb(settings)} МБ.") from None

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

    if media_type == "image":
        optimized = optimize_original_image(
            tmp_path,
            settings.original_image_optimize_min_bytes,
            settings.original_image_max_edge,
            settings.original_image_quality,
        )
        if optimized is not None:
            size_bytes, extension, mime = optimized
            logger.info(
                "upload_optimized_original guest_id=%s guest_slug=%s filename=%r size_bytes=%s extension=%s",
                guest.id,
                guest.slug,
                filename,
                size_bytes,
                extension,
            )

    number = reserve_photo_number(db, guest.id)
    ensure_guest_dirs(settings, guest)
    final_original = original_path(settings, guest, number, extension)
    final_preview = preview_path(settings, guest, number)
    final_thumbnail = thumbnail_path(settings, guest, number)
    shutil.move(str(tmp_path), str(final_original))

    preview_relative = None
    if media_type == "image":
        try:
            with preview_semaphore:
                save_preview(final_original, final_preview)
                save_thumbnail(final_preview, final_thumbnail)
            preview_relative = relative_to_data(settings, final_preview)
        except Exception:
            logger.exception("preview_failed guest_id=%s guest_slug=%s number=%s", guest.id, guest.slug, number)
            preview_relative = None

    photo = Photo(
        guest_id=guest.id,
        number=number,
        original_path=relative_to_data(settings, final_original),
        preview_path=preview_relative,
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
        remove_file(final_preview if preview_relative else None)
        remove_file(final_thumbnail if preview_relative else None)
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
        remove_file(final_preview if preview_relative else None)
        remove_file(final_thumbnail if preview_relative else None)
        logger.exception("upload_commit_failed guest_id=%s guest_slug=%s number=%s", guest.id, guest.slug, number)
        raise
    db.refresh(photo)
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
    """Возвращает thumbnail, создавая его из превью для старых фото без отдельной миграции."""

    if not photo.preview_path:
        raise api_error(404, "THUMBNAIL_NOT_FOUND", "Thumbnail еще не готов.")
    thumbnail = thumbnail_path(settings, photo.guest, photo.number)
    if thumbnail.exists():
        return thumbnail
    preview = absolute_from_data(settings, photo.preview_path)
    if not preview.exists():
        raise api_error(404, "PREVIEW_NOT_FOUND", "Превью еще не готово.")
    with thumbnail_semaphore:
        if not thumbnail.exists():
            save_thumbnail(preview, thumbnail)
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
        raise api_error(404, "PREVIEW_NOT_FOUND", "Превью еще не готово.")
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
    return FileResponse(ensure_thumbnail(settings, photo), headers=MEDIA_CACHE_HEADERS)


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
