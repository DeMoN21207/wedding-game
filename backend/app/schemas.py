from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, field_serializer


class ApiModel(BaseModel):
    """Базовая API-схема с безопасной JSON-сериализацией UTC-времени."""

    @field_serializer("*", when_used="json")
    def serialize_datetime_fields(self, value: Any) -> Any:
        """Добавляет UTC-зону к naive datetime, чтобы браузер не считал его локальным."""

        if not isinstance(value, datetime):
            return value
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc).isoformat()
        return value.astimezone(timezone.utc).isoformat()


class EventCreate(ApiModel):
    """Запрос на создание события в админке."""

    name: str


class EventOut(ApiModel):
    """Событие в админке со счетчиками гостей и фото."""

    id: int
    name: str
    token: str
    slug: str
    guest_count: int
    photo_count: int
    created_at: datetime


class EventQrOut(ApiModel):
    """QR-ссылка и PNG-картинка в формате data URL."""

    url: str
    qr_png_base64: str


class EventPublicOut(ApiModel):
    """Публичные данные события по токену QR."""

    name: str
    token: str


class GuestCreate(ApiModel):
    """Запрос гостя на вход по нику."""

    nickname: str
    event_token: Optional[str] = None


class GuestCreated(ApiModel):
    """Ответ после входа гостя с токеном для localStorage."""

    guest_token: str
    nickname: str
    slug: str
    avatar_index: int


class MeOut(ApiModel):
    """Профиль текущего гостя."""

    nickname: str
    slug: str
    avatar_index: int
    active_photo_count: int


class AdminLogin(ApiModel):
    """Запрос входа в админку."""

    password: str


class PhotoOut(ApiModel):
    """Фото в персональной галерее гостя."""

    id: int
    number: int
    media_type: str
    preview_url: Optional[str]
    thumbnail_url: Optional[str]
    created_at: datetime
    status: str = "active"


class AlbumPhotoOut(ApiModel):
    """Фото на главном дашборде и в последних моментах."""

    id: int
    number: int
    media_type: str
    preview_url: Optional[str]
    thumbnail_url: Optional[str]
    guest_nickname: str
    guest_slug: str
    created_at: datetime


class AlbumContributorOut(ApiModel):
    """Гость в кратком рейтинге альбома."""

    nickname: str
    slug: str
    avatar_index: int
    active_photo_count: int
    created_at: datetime


class AlbumOut(ApiModel):
    """Публичный дашборд общего альбома."""

    name: str
    qr_url: str
    total_photos: int
    total_guests: int
    total_images: int
    total_videos: int
    total_size_bytes: int
    recent_photos: list[AlbumPhotoOut]
    top_guests: list[AlbumContributorOut]


class RatingGuestOut(ApiModel):
    """Строка отдельной страницы рейтинга."""

    rank: int
    nickname: str
    slug: str
    avatar_index: int
    active_photo_count: int
    contribution_percent: float
    created_at: datetime


class RatingOut(ApiModel):
    """Полный публичный рейтинг гостей."""

    total_photos: int
    total_guests: int
    guests: list[RatingGuestOut]


class GalleryPhotoOut(ApiModel):
    """Фото в общей галерее со ссылкой скачивания."""

    id: int
    number: int
    media_type: str
    preview_url: Optional[str]
    thumbnail_url: Optional[str]
    download_url: str
    guest_nickname: str
    guest_slug: str
    created_at: datetime


class GalleryOut(ApiModel):
    """Страница общей галереи с пагинацией."""

    photos: list[GalleryPhotoOut]
    total: int
    limit: int
    offset: int
    has_more: bool


class AdminGuestOut(ApiModel):
    """Гость в админской таблице."""

    id: int
    nickname: str
    slug: str
    avatar_index: int
    active_photo_count: int
    trashed_photo_count: int
    created_at: datetime


class AdminPhotoOut(ApiModel):
    """Фото в админке, включая ссылку на оригинал."""

    id: int
    guest_id: int
    guest_nickname: str
    number: int
    media_type: str
    preview_url: Optional[str]
    thumbnail_url: Optional[str]
    original_url: str
    status: str
    size_bytes: int
    created_at: datetime
    trashed_at: Optional[datetime]
