from typing import Optional

from .models import Photo


def photo_media_type(photo: Photo) -> str:
    """Возвращает публичный тип медиа для фронтенда без отдельной колонки в БД."""

    return "video" if photo.mime.startswith("video/") else "image"


def photo_preview_url(photo: Photo) -> Optional[str]:
    """Возвращает публичный URL просмотра фото или видео."""

    if photo_media_type(photo) == "video":
        return f"/media/previews/{photo.id}"
    return f"/media/previews/{photo.id}" if photo.preview_path else None


def photo_thumbnail_url(photo: Photo) -> Optional[str]:
    """Возвращает публичный URL маленького thumbnail для сеток и слайдеров."""

    if photo_media_type(photo) == "video":
        return f"/media/thumbs/{photo.id}"
    return f"/media/thumbs/{photo.id}" if photo.preview_path else None
