import base64
import hashlib
import shutil
from datetime import datetime
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from zipfile import ZIP_STORED, ZipFile

import qrcode
from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload
from starlette.background import BackgroundTask

from ..album import album_url, camera_url
from ..config import Settings, app_url
from ..db import get_db
from ..deps import get_app_settings, require_admin
from ..errors import api_error
from ..media_urls import photo_media_type, photo_preview_url, photo_thumbnail_url
from ..models import Event, Guest, Photo
from ..schemas import AdminGuestOut, AdminLogin, AdminPhotoOut, AdminStorageOut, EventCreate, EventOut, EventQrOut
from ..security import ADMIN_COOKIE, admin_password_matches, generate_token, make_admin_cookie
from ..slug import unique_slug
from ..storage import absolute_from_data, delete_photo_files, move_photo_to_trash, restore_photo_from_trash

router = APIRouter(prefix="/admin")

ARCHIVE_FREE_SPACE_RESERVE_BYTES = 5 * 1024 * 1024 * 1024
ARCHIVE_ZIP_OVERHEAD_BYTES = 64 * 1024 * 1024


def human_size(value: int) -> str:
    """Форматирует байты в короткий человекочитаемый размер."""

    if value >= 1024 * 1024 * 1024:
        return f"{value / (1024 * 1024 * 1024):.1f} ГБ"
    return f"{value / (1024 * 1024):.0f} МБ"


def ensure_archive_disk_space(settings: Settings, photos: list[Photo]) -> None:
    """Проверяет, что ZIP-архив не заполнит диск во время сборки."""

    archive_bytes = sum(photo.size_bytes for photo in photos) + ARCHIVE_ZIP_OVERHEAD_BYTES
    required_free = archive_bytes + ARCHIVE_FREE_SPACE_RESERVE_BYTES
    free_bytes = shutil.disk_usage(settings.data_dir).free
    if free_bytes >= required_free:
        return

    raise api_error(
        507,
        "ARCHIVE_NOT_ENOUGH_SPACE",
        (
            "Недостаточно места для сборки архива: нужно примерно "
            f"{human_size(required_free)}, доступно {human_size(free_bytes)}."
        ),
    )


def storage_status(settings: Settings) -> AdminStorageOut:
    """Возвращает свободное место и грубую емкость по максимальным видео."""

    usage = shutil.disk_usage(settings.data_dir)
    available_for_uploads = max(0, usage.free - ARCHIVE_FREE_SPACE_RESERVE_BYTES)
    is_low_space = usage.free < ARCHIVE_FREE_SPACE_RESERVE_BYTES
    return AdminStorageOut(
        total_bytes=usage.total,
        used_bytes=usage.used,
        free_bytes=usage.free,
        reserve_bytes=ARCHIVE_FREE_SPACE_RESERVE_BYTES,
        max_upload_bytes=settings.max_upload_bytes,
        estimated_max_video_uploads=available_for_uploads // max(1, settings.max_upload_bytes),
        is_low_space=is_low_space,
        warning="Свободно меньше 5 ГБ. Лучше почистить корзину или забрать архив перед новым видео."
        if is_low_space
        else None,
    )


def event_out(event: Event, db: Session) -> EventOut:
    """Преобразует событие в админский ответ со счетчиками гостей и фото."""

    guest_count = db.query(func.count(Guest.id)).filter(Guest.event_id == event.id).scalar() or 0
    photo_count = (
        db.query(func.count(Photo.id))
        .join(Guest)
        .filter(Guest.event_id == event.id, Photo.status == "active")
        .scalar()
        or 0
    )
    return EventOut(
        id=event.id,
        name=event.name,
        token=event.token,
        slug=event.slug,
        guest_count=guest_count,
        photo_count=photo_count,
        created_at=event.created_at,
    )


def admin_photo_out(photo: Photo) -> AdminPhotoOut:
    """Преобразует фото в админский ответ с оригиналом и статусом корзины."""

    return AdminPhotoOut(
        id=photo.id,
        guest_id=photo.guest_id,
        guest_nickname=photo.guest.nickname,
        number=photo.number,
        media_type=photo_media_type(photo),
        preview_url=photo_preview_url(photo),
        thumbnail_url=photo_thumbnail_url(photo),
        original_url=f"/media/originals/{photo.id}",
        status=photo.status,
        size_bytes=photo.size_bytes,
        created_at=photo.created_at,
        trashed_at=photo.trashed_at,
    )


def qr_cache_file(cache_dir: Path, url: str) -> Path:
    """Возвращает путь к файловому кешу QR-кода для конкретного URL."""

    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()
    return cache_dir / f"{digest}.png"


def generate_qr_png(url: str) -> bytes:
    """Генерирует PNG QR-код в памяти."""

    image = qrcode.make(url)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def qr_png_bytes(url: str, cache_dir: Path) -> bytes:
    """Читает QR из файлового кеша или создает PNG один раз для всех воркеров."""

    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = qr_cache_file(cache_dir, url)
    if cache_file.exists():
        return cache_file.read_bytes()

    png = generate_qr_png(url)
    with NamedTemporaryFile(prefix=f"{cache_file.stem}-", suffix=".tmp", dir=cache_dir, delete=False) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(png)
    temp_path.replace(cache_file)
    return png


@lru_cache(maxsize=32)
def qr_data_url(url: str, cache_dir: str) -> str:
    """Возвращает data URL QR-кода из памяти, файлового кеша или разовой генерации."""

    encoded = base64.b64encode(qr_png_bytes(url, Path(cache_dir))).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def archive_entry_name(photo: Photo) -> str:
    """Возвращает стабильное имя файла внутри общего архива."""

    extension = Path(photo.original_path).suffix or ".bin"
    return f"{photo.guest.slug}/{photo.id:06d}_{photo.guest.slug}_{photo.number:03d}{extension}"


def remove_temp_file(path: Path) -> None:
    """Удаляет временный архив после отправки ответа."""

    path.unlink(missing_ok=True)


@router.post("/login", status_code=204)
def login_admin(
    payload: AdminLogin,
    response: Response,
    settings: Settings = Depends(get_app_settings),
) -> None:
    """Проверяет пароль админа и ставит подписанную cookie-сессию."""

    if not admin_password_matches(settings, payload.password):
        raise api_error(401, "BAD_PASSWORD", "Неверный пароль.")
    response.set_cookie(
        ADMIN_COOKIE,
        make_admin_cookie(settings),
        httponly=True,
        samesite="lax",
        secure=settings.base_url.startswith("https://"),
        max_age=7 * 24 * 60 * 60,
    )


@router.post("/logout", status_code=204)
def logout_admin(response: Response) -> None:
    """Удаляет cookie-сессию админа."""

    response.delete_cookie(ADMIN_COOKIE)


@router.get("/events", response_model=list[EventOut], dependencies=[Depends(require_admin)])
def list_events(db: Session = Depends(get_db)) -> list[EventOut]:
    """Возвращает события для старой модели QR по событиям."""

    events = db.query(Event).order_by(Event.created_at.desc()).all()
    return [event_out(e, db) for e in events]


@router.post("/events", response_model=EventOut, status_code=201, dependencies=[Depends(require_admin)])
def create_event(
    payload: EventCreate,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> EventOut:
    """Создает событие для совместимости со старой админской моделью."""

    name = payload.name.strip()
    if not name or len(name) > 100:
        raise api_error(422, "INVALID_NAME", "Введите название от 1 до 100 символов.")

    slug = unique_slug(name, lambda candidate: bool(db.query(Event).filter(Event.slug == candidate).first()))
    event = Event(
        name=name,
        token=generate_token(),
        slug=slug,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event_out(event, db)


@router.get("/events/{event_id}", response_model=EventOut, dependencies=[Depends(require_admin)])
def get_event(event_id: int, db: Session = Depends(get_db)) -> EventOut:
    """Возвращает одно событие в админке."""

    event = db.query(Event).filter(Event.id == event_id).one_or_none()
    if event is None:
        raise api_error(404, "EVENT_NOT_FOUND", "Событие не найдено.")
    return event_out(event, db)


@router.delete("/events/{event_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_event(event_id: int, db: Session = Depends(get_db)) -> None:
    """Удаляет событие вместе с гостями и фото через cascade."""

    event = db.query(Event).filter(Event.id == event_id).one_or_none()
    if event is None:
        raise api_error(404, "EVENT_NOT_FOUND", "Событие не найдено.")
    db.delete(event)
    db.commit()


@router.get("/events/{event_id}/qr", response_model=EventQrOut, dependencies=[Depends(require_admin)])
def event_qr(
    event_id: int,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> EventQrOut:
    """Возвращает QR для конкретного события старой модели."""

    event = db.query(Event).filter(Event.id == event_id).one_or_none()
    if event is None:
        raise api_error(404, "EVENT_NOT_FOUND", "Событие не найдено.")
    url = app_url(settings, f"/e/{event.token}")
    return EventQrOut(url=url, qr_png_base64=qr_data_url(url, str(settings.data_dir / "qr-cache")))


@router.get("/album/qr", response_model=EventQrOut, dependencies=[Depends(require_admin)])
def album_qr(settings: Settings = Depends(get_app_settings)) -> EventQrOut:
    """Возвращает постоянный QR общего альбома."""

    url = album_url(settings)
    return EventQrOut(url=url, qr_png_base64=qr_data_url(url, str(settings.data_dir / "qr-cache")))


@router.get("/album/camera-qr", response_model=EventQrOut, dependencies=[Depends(require_admin)])
def album_camera_qr(settings: Settings = Depends(get_app_settings)) -> EventQrOut:
    """Возвращает QR, который ведет гостя сразу к съемке фото или видео."""

    url = camera_url(settings)
    return EventQrOut(url=url, qr_png_base64=qr_data_url(url, str(settings.data_dir / "qr-cache")))


@router.get("/storage", response_model=AdminStorageOut, dependencies=[Depends(require_admin)])
def admin_storage(settings: Settings = Depends(get_app_settings)) -> AdminStorageOut:
    """Возвращает статус диска для предупреждения о переполнении на празднике."""

    return storage_status(settings)


@router.get("/guests", response_model=list[AdminGuestOut], dependencies=[Depends(require_admin)])
def list_guests(
    event_id: int = None,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[AdminGuestOut]:
    """Возвращает гостей с агрегированными счетчиками активных и удаленных фото."""

    active_count = func.coalesce(func.sum(case((Photo.status == "active", 1), else_=0)), 0)
    trashed_count = func.coalesce(func.sum(case((Photo.status == "trashed", 1), else_=0)), 0)
    query = (
        db.query(Guest, active_count.label("active_count"), trashed_count.label("trashed_count"))
        .outerjoin(Photo)
    )
    if event_id is not None:
        query = query.filter(Guest.event_id == event_id)
    rows = (
        query
        .group_by(Guest.id, Guest.nickname, Guest.slug, Guest.created_at)
        .order_by(Guest.created_at.asc(), Guest.id.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        AdminGuestOut(
            id=guest.id,
            nickname=guest.nickname,
            slug=guest.slug,
            avatar_index=guest.avatar_index,
            active_photo_count=active,
            trashed_photo_count=trashed,
            created_at=guest.created_at,
        )
        for guest, active, trashed in rows
    ]


@router.get("/photos", response_model=list[AdminPhotoOut], dependencies=[Depends(require_admin)])
def list_photos(
    status: str = "active",
    guest_id: int = None,
    event_id: int = None,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> list[AdminPhotoOut]:
    """Возвращает админский список фото с фильтром статуса и пагинацией."""

    if status not in ("active", "trashed"):
        raise api_error(422, "INVALID_STATUS", "Статус должен быть active или trashed.")
    query = db.query(Photo).options(joinedload(Photo.guest)).join(Guest).filter(Photo.status == status)
    if guest_id is not None:
        query = query.filter(Photo.guest_id == guest_id)
    if event_id is not None:
        query = query.filter(Guest.event_id == event_id)
    photos = query.order_by(Photo.created_at.desc(), Photo.id.desc()).offset(offset).limit(limit).all()
    return [admin_photo_out(photo) for photo in photos]


@router.get("/photos/archive.zip", dependencies=[Depends(require_admin)])
def download_photos_archive(
    status: str = "active",
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> FileResponse:
    """Собирает ZIP-архив оригиналов для скачивания из админки."""

    if status not in ("active", "trashed", "all"):
        raise api_error(422, "INVALID_STATUS", "Статус должен быть active, trashed или all.")

    query = db.query(Photo).options(joinedload(Photo.guest)).join(Guest)
    if status != "all":
        query = query.filter(Photo.status == status)
    photos = query.order_by(Guest.created_at.asc(), Photo.number.asc(), Photo.id.asc()).all()
    ensure_archive_disk_space(settings, photos)

    tmp_dir = settings.data_dir / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(prefix="wedding-media-", suffix=".zip", dir=tmp_dir, delete=False) as temp_file:
        archive_path = Path(temp_file.name)

    with ZipFile(archive_path, mode="w", compression=ZIP_STORED, allowZip64=True) as archive:
        for photo in photos:
            original = absolute_from_data(settings, photo.original_path)
            if original.exists():
                archive.write(original, archive_entry_name(photo))

    return FileResponse(
        archive_path,
        media_type="application/zip",
        filename=f"wedding-media-{status}.zip",
        background=BackgroundTask(remove_temp_file, archive_path),
    )


@router.delete("/photos/{photo_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_admin_photo(
    photo_id: int,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> None:
    """Перемещает фото в корзину из админки."""

    photo = db.query(Photo).filter(Photo.id == photo_id).one_or_none()
    if photo is None:
        raise api_error(404, "PHOTO_NOT_FOUND", "Фото не найдено.")
    if photo.status != "trashed":
        move_photo_to_trash(settings, photo)
        photo.status = "trashed"
        photo.trashed_at = datetime.utcnow()
        db.commit()


@router.delete("/photos/{photo_id}/permanent", status_code=204, dependencies=[Depends(require_admin)])
def permanently_delete_admin_photo(
    photo_id: int,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> None:
    """Физически удаляет медиафайлы и запись фото из админки."""

    photo = db.query(Photo).options(joinedload(Photo.guest)).filter(Photo.id == photo_id).one_or_none()
    if photo is None:
        raise api_error(404, "PHOTO_NOT_FOUND", "Фото не найдено.")
    delete_photo_files(settings, photo)
    db.delete(photo)
    db.commit()


@router.post("/photos/{photo_id}/restore", response_model=AdminPhotoOut, dependencies=[Depends(require_admin)])
def restore_admin_photo(
    photo_id: int,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> AdminPhotoOut:
    """Восстанавливает фото из корзины через админку."""

    photo = db.query(Photo).filter(Photo.id == photo_id).one_or_none()
    if photo is None:
        raise api_error(404, "PHOTO_NOT_FOUND", "Фото не найдено.")
    if photo.status == "trashed":
        restore_photo_from_trash(settings, photo)
        photo.status = "active"
        photo.trashed_at = None
        db.commit()
        db.refresh(photo)
    return admin_photo_out(photo)
