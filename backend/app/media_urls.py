from .models import Photo


def photo_media_type(photo: Photo) -> str:
    """Возвращает публичный тип медиа для фронтенда без отдельной колонки в БД."""

    return "video" if photo.mime.startswith("video/") else "image"


def photo_preview_url(photo: Photo) -> str:
    """Возвращает публичный URL просмотра фото или видео."""

    return f"/media/previews/{photo.id}"


def photo_thumbnail_url(photo: Photo) -> str:
    """Возвращает публичный URL маленького thumbnail для сеток и слайдеров."""

    return f"/media/thumbs/{photo.id}"
