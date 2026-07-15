from typing import Optional

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from .config import Settings
from .db import get_db
from .errors import api_error
from .models import Guest
from .security import ADMIN_COOKIE, verify_admin_cookie


def get_app_settings(request: Request) -> Settings:
    """Достает настройки приложения из FastAPI state."""

    return request.app.state.settings


def bearer_token(request: Request) -> Optional[str]:
    """Извлекает Bearer-токен гостя из заголовка Authorization."""

    header = request.headers.get("authorization", "")
    prefix = "Bearer "
    if not header.startswith(prefix):
        return None
    return header[len(prefix):].strip()


def get_current_guest(
    request: Request,
    db: Session = Depends(get_db),
) -> Guest:
    """Проверяет токен гостя и возвращает его запись из БД."""

    token = bearer_token(request)
    if not token:
        raise api_error(401, "UNAUTHORIZED", "Войдите по ссылке QR еще раз.")
    guest = db.query(Guest).filter(Guest.token == token).one_or_none()
    if guest is None:
        raise api_error(401, "UNAUTHORIZED", "Войдите по ссылке QR еще раз.")
    return guest


def is_admin_request(request: Request, settings: Settings) -> bool:
    """Проверяет подписанную cookie админской сессии."""

    value = request.cookies.get(ADMIN_COOKIE)
    return bool(value and verify_admin_cookie(settings, value))


def require_admin(
    request: Request,
    settings: Settings = Depends(get_app_settings),
) -> None:
    """FastAPI dependency, запрещающая доступ без админской cookie."""

    if not is_admin_request(request, settings):
        raise api_error(401, "ADMIN_REQUIRED", "Нужен вход в админку.")
