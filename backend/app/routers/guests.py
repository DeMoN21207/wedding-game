from fastapi import APIRouter, Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..album import get_or_create_album_event
from ..avatars import next_guest_avatar_index
from ..config import Settings
from ..db import get_db
from ..deps import get_app_settings, get_current_guest
from ..errors import api_error
from ..media_urls import photo_media_type, photo_preview_url, photo_thumbnail_url
from ..models import Event, Guest, Photo
from ..schemas import EventPublicOut, GuestCreate, GuestCreated, MeOut, PhotoOut
from ..security import generate_token
from ..slug import clean_nickname, normalize_nickname, unique_slug

router = APIRouter()


def photo_out(photo: Photo) -> PhotoOut:
    """Преобразует модель фото в публичный ответ без внутренних путей файлов."""

    return PhotoOut(
        id=photo.id,
        number=photo.number,
        media_type=photo_media_type(photo),
        preview_url=photo_preview_url(photo),
        thumbnail_url=photo_thumbnail_url(photo),
        created_at=photo.created_at,
        status=photo.status,
    )


def guest_created_out(guest: Guest) -> GuestCreated:
    """Преобразует гостя в ответ регистрации с постоянным аватаром."""

    return GuestCreated(
        guest_token=guest.token,
        nickname=guest.nickname,
        slug=guest.slug,
        avatar_index=guest.avatar_index,
    )


def lock_event_for_guest_registration(db: Session, event: Event) -> Event:
    """Сериализует регистрацию гостей внутри события для честной раздачи аватаров."""

    return db.query(Event).filter(Event.id == event.id).with_for_update().one()


def nickname_taken_error():
    """Сообщает гостю, что нормализованный ник уже используется."""

    return api_error(409, "NICKNAME_TAKEN", "Этот ник уже занят. Придумайте другой.")


@router.post("/guests", response_model=GuestCreated, status_code=201)
def create_guest(
    payload: GuestCreate,
    settings: Settings = Depends(get_app_settings),
    db: Session = Depends(get_db),
) -> GuestCreated:
    """Регистрирует гостя с уникальным внутри события ником."""

    if payload.event_token:
        event = db.query(Event).filter(Event.token == payload.event_token).one_or_none()
        if event is None:
            raise api_error(404, "EVENT_NOT_FOUND", "Ссылка на событие не найдена.")
    else:
        event = get_or_create_album_event(db, settings)

    nickname = clean_nickname(payload.nickname)
    nickname_norm = normalize_nickname(payload.nickname)
    if not nickname_norm or len(nickname) > 30:
        raise api_error(422, "INVALID_NICKNAME", "Введите ник от 1 до 30 символов.")

    event = lock_event_for_guest_registration(db, event)
    existing = db.query(Guest).filter(Guest.event_id == event.id, Guest.nickname_norm == nickname_norm).first()
    if existing:
        raise nickname_taken_error()

    slug = unique_slug(nickname, lambda candidate: bool(db.query(Guest).filter(Guest.slug == candidate).first()))
    guest = Guest(
        event_id=event.id,
        nickname=nickname,
        nickname_norm=nickname_norm,
        slug=slug,
        token=generate_token(),
        avatar_index=next_guest_avatar_index(db, event.id),
    )
    db.add(guest)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(Guest).filter(Guest.event_id == event.id, Guest.nickname_norm == nickname_norm).first()
        if existing:
            raise nickname_taken_error() from None
        raise
    db.refresh(guest)
    return guest_created_out(guest)


@router.get("/events/{event_token}", response_model=EventPublicOut)
def get_public_event(event_token: str, db: Session = Depends(get_db)) -> EventPublicOut:
    """Отдает публичную информацию о событии по QR-токену."""

    event = db.query(Event).filter(Event.token == event_token).one_or_none()
    if event is None:
        raise api_error(404, "EVENT_NOT_FOUND", "Ссылка на событие не найдена.")
    return EventPublicOut(name=event.name, token=event.token)


@router.get("/me", response_model=MeOut)
def get_me(
    guest: Guest = Depends(get_current_guest),
    db: Session = Depends(get_db),
) -> MeOut:
    """Возвращает профиль текущего гостя и количество его активных фото."""

    active_count = db.query(Photo).filter(Photo.guest_id == guest.id, Photo.status == "active").count()
    return MeOut(
        nickname=guest.nickname,
        slug=guest.slug,
        avatar_index=guest.avatar_index,
        active_photo_count=active_count,
    )


@router.get("/me/photos", response_model=list[PhotoOut])
def get_my_photos(
    guest: Guest = Depends(get_current_guest),
    db: Session = Depends(get_db),
) -> list[PhotoOut]:
    """Возвращает активные фото текущего гостя от новых к старым."""

    photos = (
        db.query(Photo)
        .filter(Photo.guest_id == guest.id, Photo.status == "active")
        .order_by(Photo.number.desc())
        .all()
    )
    return [photo_out(photo) for photo in photos]
