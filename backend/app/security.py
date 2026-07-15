import secrets
from hmac import compare_digest

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import Settings

ADMIN_COOKIE = "admin_session"


def generate_token() -> str:
    """Генерирует непредсказуемый URL-safe токен для гостя или события."""

    return secrets.token_urlsafe(32)


def admin_password_matches(settings: Settings, password: str) -> bool:
    """Сравнивает пароль админа без раннего выхода по первому отличию."""

    return compare_digest(settings.admin_password, password)


def serializer(settings: Settings) -> URLSafeTimedSerializer:
    """Создает подписыватель cookie на основе секретного ключа приложения."""

    return URLSafeTimedSerializer(settings.secret_key, salt="wedding-photos-admin")


def make_admin_cookie(settings: Settings) -> str:
    """Создает значение cookie админской сессии."""

    return serializer(settings).dumps({"admin": True})


def verify_admin_cookie(settings: Settings, value: str) -> bool:
    """Проверяет подпись и срок жизни cookie админа."""

    try:
        data = serializer(settings).loads(value, max_age=7 * 24 * 60 * 60)
    except (BadSignature, SignatureExpired):
        return False
    return data == {"admin": True}
