import logging
import time
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .db import configure_database, create_schema, migrate_legacy_schema
from .errors import api_error
from .routers import admin, album, guests, photos
from .storage import ensure_storage

INDEX_HEADERS = {
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
}
REQUEST_ID_HEADER = "X-Request-ID"
logger = logging.getLogger("wedding.request")


def configure_logging() -> None:
    """Настраивает единый формат логов приложения без дублирования handlers."""

    wedding_logger = logging.getLogger("wedding")
    wedding_logger.setLevel(logging.INFO)
    if not wedding_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
        wedding_logger.addHandler(handler)
    wedding_logger.propagate = False


def find_static_dir() -> Path:
    """Находит собранный frontend в Docker-образе или локальной папке разработки."""

    app_root = Path(__file__).resolve().parents[1]
    workspace_root = Path(__file__).resolve().parents[2]
    for candidate in (app_root / "static", workspace_root / "frontend" / "dist"):
        if (candidate / "index.html").exists():
            return candidate
    return app_root / "static"


def index_response(static_dir: Path) -> FileResponse:
    """Отдает SPA index.html без кеширования, чтобы обновления frontend подхватывались сразу."""

    return FileResponse(static_dir / "index.html", headers=INDEX_HEADERS)


def create_app() -> FastAPI:
    """Создает FastAPI-приложение, подключает API, медиа и SPA fallback."""

    configure_logging()
    settings = get_settings()
    configure_database(settings.database_url)
    create_schema()
    migrate_legacy_schema(settings.legacy_event_token)
    ensure_storage(settings)

    app = FastAPI(title=settings.app_title)
    app.state.settings = settings

    @app.middleware("http")
    async def request_logging_middleware(request: Request, call_next):
        """Логирует каждый HTTP-запрос с request id и временем выполнения."""

        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid4().hex[:12]
        started = time.monotonic()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        finally:
            duration_ms = round((time.monotonic() - started) * 1000, 1)
            logger.info(
                "request id=%s method=%s path=%s status=%s duration_ms=%s client=%s",
                request_id,
                request.method,
                request.url.path,
                status_code,
                duration_ms,
                request.client.host if request.client else "-",
            )

    api_prefixes = ["/api"]
    if settings.app_base_path:
        api_prefixes.append(f"{settings.app_base_path}/api")
    for prefix in api_prefixes:
        app.include_router(album.router, prefix=prefix)
        app.include_router(guests.router, prefix=prefix)
        app.include_router(photos.router, prefix=prefix)
        app.include_router(admin.router, prefix=prefix)

    media_prefixes = [""]
    if settings.app_base_path:
        media_prefixes.append(settings.app_base_path)
    for prefix in media_prefixes:
        app.include_router(photos.media_router, prefix=prefix)

    @app.api_route("/api/{full_path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    def unknown_api_route(full_path: str):
        """Возвращает JSON 404 для неизвестных API-маршрутов без отдачи SPA."""

        raise api_error(404, "API_NOT_FOUND", "API endpoint not found.")

    if settings.app_base_path:
        @app.api_route(f"{settings.app_base_path}/api/{{full_path:path}}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
        def unknown_prefixed_api_route(full_path: str):
            """Возвращает JSON 404 для неизвестных API-маршрутов под base path."""

            raise api_error(404, "API_NOT_FOUND", "API endpoint not found.")

    static_dir = find_static_dir()
    if static_dir.exists():
        assets_dir = static_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
            if settings.app_base_path:
                app.mount(f"{settings.app_base_path}/assets", StaticFiles(directory=assets_dir), name="events-assets")

        if settings.app_base_path:
            @app.get("/admin")
            def redirect_legacy_admin():
                """Перенаправляет старую ссылку админки на сервис под base path."""

                return RedirectResponse(f"{settings.app_base_path}/admin")

            @app.get("/gallery")
            def redirect_legacy_gallery():
                """Перенаправляет старую ссылку галереи на сервис под base path."""

                return RedirectResponse(f"{settings.app_base_path}/gallery")

            @app.get("/e/{event_token}")
            def redirect_legacy_event(event_token: str):
                """Сохраняет совместимость старых QR-ссылок событий."""

                return RedirectResponse(f"{settings.app_base_path}/")

            @app.get(settings.app_base_path)
            def base_path_index():
                """Отдает SPA index для корневой страницы сервиса."""

                return index_response(static_dir)

            @app.get(f"{settings.app_base_path}/{{full_path:path}}")
            def prefixed_spa_fallback(full_path: str):
                """Отдает статический файл или SPA index внутри base path."""

                if full_path.startswith("api/"):
                    raise api_error(404, "API_NOT_FOUND", "API endpoint not found.")
                candidate = static_dir / full_path
                if full_path and candidate.exists() and candidate.is_file():
                    return FileResponse(candidate)
                return index_response(static_dir)

            @app.get("/")
            def redirect_to_base_path():
                """Перенаправляет корень домена на base path сервиса."""

                return RedirectResponse(f"{settings.app_base_path}/")

        @app.get("/{full_path:path}")
        def spa_fallback(full_path: str):
            """Отдает статический файл или SPA index для неприкрытых маршрутов."""

            if full_path.startswith("api/"):
                raise api_error(404, "API_NOT_FOUND", "API endpoint not found.")
            candidate = static_dir / full_path
            if full_path and candidate.exists() and candidate.is_file():
                return FileResponse(candidate)
            return index_response(static_dir)

    return app


app = create_app()
