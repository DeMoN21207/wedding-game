from sqlalchemy.orm import Session

from .config import Settings, app_url
from .models import Event
from .slug import unique_slug

DEFAULT_ALBUM_SLUG = "wedding-album"


def album_url(settings: Settings) -> str:
    """Возвращает постоянную публичную ссылку на общий свадебный альбом."""

    return app_url(settings, "/")


def camera_url(settings: Settings) -> str:
    """Возвращает публичную ссылку, которая открывает альбом сразу в режиме камеры."""

    return app_url(settings, "/camera")


def get_or_create_album_event(db: Session, settings: Settings) -> Event:
    """Возвращает техническое событие общего альбома или создает его при первом запуске."""

    event = db.query(Event).filter(Event.token == settings.legacy_event_token).one_or_none()
    if event is not None:
        return event

    slug = unique_slug(DEFAULT_ALBUM_SLUG, lambda candidate: bool(db.query(Event).filter(Event.slug == candidate).first()))
    event = Event(
        name=settings.album_name,
        token=settings.legacy_event_token,
        slug=slug,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
