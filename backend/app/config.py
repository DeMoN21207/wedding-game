import os
from dataclasses import dataclass
from pathlib import Path

PRODUCTION_ENVS = {"production", "prod"}
UNSAFE_ADMIN_PASSWORDS = {"", "change-me", "change-this-password"}
UNSAFE_SECRET_KEYS = {"", "local-secret-change-me", "local-secret", "change-this-long-random-secret"}
DEFAULT_MAX_UPLOAD_BYTES = 300 * 1024 * 1024
DEFAULT_ORIGINAL_IMAGE_OPTIMIZE_MIN_BYTES = 5 * 1024 * 1024
DEFAULT_DISK_FREE_RESERVE_BYTES = 5 * 1024 * 1024 * 1024


@dataclass(frozen=True)
class Settings:
    """Настройки приложения, которые можно менять через переменные окружения."""

    app_env: str
    admin_password: str
    album_name: str
    app_title: str
    app_base_path: str
    base_url: str
    data_dir: Path
    database_url: str
    legacy_event_token: str
    secret_key: str
    max_upload_bytes: int = DEFAULT_MAX_UPLOAD_BYTES
    disk_free_reserve_bytes: int = DEFAULT_DISK_FREE_RESERVE_BYTES
    max_image_pixels: int = 25_000_000
    original_image_optimize_min_bytes: int = DEFAULT_ORIGINAL_IMAGE_OPTIMIZE_MIN_BYTES
    original_image_max_edge: int = 3200
    original_image_quality: int = 86


def normalize_base_path(value: str) -> str:
    """Нормализует base path к виду `/path` или пустой строке для корня."""

    cleaned = value.strip()
    if not cleaned or cleaned == "/":
        return ""
    return f"/{cleaned.strip('/')}"


def app_url(settings: Settings, path: str) -> str:
    """Собирает публичный URL внутри сервиса с учетом base path."""

    return f"{settings.base_url}{settings.app_base_path}{path}"


def env_int(name: str, default: int) -> int:
    """Читает положительное целое из env и падает с понятной ошибкой при мусоре."""

    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero")
    return value


def validate_production_settings(app_env: str, base_url: str, admin_password: str, secret_key: str) -> None:
    """Запрещает запуск production с известными дефолтными секретами."""

    production_like = app_env in PRODUCTION_ENVS or base_url.startswith("https://")
    if not production_like:
        return
    if admin_password in UNSAFE_ADMIN_PASSWORDS:
        raise RuntimeError("ADMIN_PASSWORD must be set to a non-default value in production")
    if secret_key in UNSAFE_SECRET_KEYS or len(secret_key) < 32:
        raise RuntimeError("SECRET_KEY must be set to a long non-default value in production")


def get_settings() -> Settings:
    """Создает снимок настроек приложения на момент старта."""

    data_dir = Path(os.getenv("DATA_DIR", "/data"))
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    base_url = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")
    admin_password = os.getenv("ADMIN_PASSWORD", "change-me")
    secret_key = os.getenv("SECRET_KEY", "local-secret-change-me")
    validate_production_settings(app_env, base_url, admin_password, secret_key)
    return Settings(
        app_env=app_env,
        admin_password=admin_password,
        album_name=os.getenv("ALBUM_NAME", "Свадебный альбом"),
        app_title=os.getenv("APP_TITLE", "Wedding Photos"),
        app_base_path=normalize_base_path(os.getenv("APP_BASE_PATH", "/events")),
        base_url=base_url,
        data_dir=data_dir,
        database_url=os.getenv("DATABASE_URL", f"sqlite:///{data_dir / 'db' / 'app.db'}"),
        legacy_event_token=os.getenv("EVENT_TOKEN", "imported-event"),
        secret_key=secret_key,
        max_upload_bytes=env_int("MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES),
        disk_free_reserve_bytes=env_int("DISK_FREE_RESERVE_BYTES", DEFAULT_DISK_FREE_RESERVE_BYTES),
        max_image_pixels=env_int("MAX_IMAGE_PIXELS", 25_000_000),
        original_image_optimize_min_bytes=env_int(
            "ORIGINAL_IMAGE_OPTIMIZE_MIN_BYTES",
            DEFAULT_ORIGINAL_IMAGE_OPTIMIZE_MIN_BYTES,
        ),
        original_image_max_edge=env_int("ORIGINAL_IMAGE_MAX_EDGE", 3200),
        original_image_quality=env_int("ORIGINAL_IMAGE_QUALITY", 86),
    )
