from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from types import SimpleNamespace

from conftest import auth_headers, create_event, create_guest
from PIL import Image


def image_bytes(fmt: str = "JPEG", size=(80, 60)) -> bytes:
    image = Image.new("RGB", size, color=(210, 30, 90))
    buffer = BytesIO()
    image.save(buffer, format=fmt)
    return buffer.getvalue()


def noisy_image_bytes(size=(1800, 1300)) -> bytes:
    image = Image.effect_noise(size, 82).convert("RGB")
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=96)
    return buffer.getvalue()


def iphone_mov_bytes() -> bytes:
    return b"\x00\x00\x00\x18ftypqt  \x00\x00\x00\x00qt  wide" + (b"\x00" * 256)


def upload_photo(
    client,
    token: str,
    content: bytes,
    filename: str = "photo.jpg",
    content_type: str = "image/jpeg",
):
    return client.post(
        "/api/photos",
        headers=auth_headers(token),
        files={"file": (filename, content, content_type)},
    )


def test_upload_returns_before_image_preview_is_ready_and_background_builds_it(client):
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Аня")

    response = upload_photo(client, guest["guest_token"], image_bytes(), "anya.jpg")

    assert response.status_code == 201, response.text
    photo = response.json()
    assert photo["number"] == 1
    assert photo["media_type"] == "image"
    assert photo["preview_url"] == f"/media/previews/{photo['id']}"
    assert photo["thumbnail_url"] == f"/media/thumbs/{photo['id']}"

    thumbnail = client.get(f"/media/thumbs/{photo['id']}")
    assert thumbnail.status_code == 200
    assert thumbnail.headers["content-type"].startswith("image/webp")

    gallery = client.get("/api/me/photos", headers=auth_headers(guest["guest_token"]))
    assert gallery.status_code == 200
    assert [item["id"] for item in gallery.json()] == [photo["id"]]
    assert gallery.json()[0]["thumbnail_url"] == "/media/thumbs/1"


def test_upload_accepts_iphone_mov_video_and_serves_it(client, monkeypatch):
    from app.routers import photos as photo_router

    def fake_video_preview(original, preview):
        preview.parent.mkdir(parents=True, exist_ok=True)
        image = Image.new("RGB", (1200, 720), color=(40, 80, 160))
        image.save(preview, format="JPEG")
        return True

    monkeypatch.setattr(photo_router, "save_video_preview", fake_video_preview)
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Видео")

    response = upload_photo(
        client,
        guest["guest_token"],
        iphone_mov_bytes(),
        "iphone-live-moment.mov",
        "video/quicktime",
    )

    assert response.status_code == 201, response.text
    photo = response.json()
    assert photo["media_type"] == "video"
    assert photo["preview_url"] == "/media/previews/1"
    assert photo["thumbnail_url"] == "/media/thumbs/1"

    gallery = client.get("/api/me/photos", headers=auth_headers(guest["guest_token"]))
    assert gallery.status_code == 200
    assert gallery.json()[0]["media_type"] == "video"
    assert gallery.json()[0]["thumbnail_url"] == "/media/thumbs/1"

    thumbnail = client.get(f"/media/thumbs/{photo['id']}")
    assert thumbnail.status_code == 200
    assert thumbnail.headers["content-type"].startswith("image/webp")
    poster_thumbnail = Image.open(BytesIO(thumbnail.content))
    assert poster_thumbnail.format == "WEBP"
    assert max(poster_thumbnail.size) <= 640

    preview = client.get(f"/media/previews/{photo['id']}")
    assert preview.status_code == 200
    assert preview.headers["content-type"].startswith("video/quicktime")

    download = client.get(f"/media/downloads/{photo['id']}")
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("video/quicktime")


def test_video_thumbnail_url_lazily_builds_missing_poster(client, monkeypatch):
    """Видео получает адрес poster-thumbnail сразу и чинит отсутствующий постер по запросу."""

    from app.config import get_settings
    from app.db import SessionLocal
    from app.models import Photo
    from app.routers import photos as photo_router
    from app.storage import absolute_from_data, thumbnail_path

    def fake_video_preview(original, preview):
        preview.parent.mkdir(parents=True, exist_ok=True)
        image = Image.new("RGB", (900, 600), color=(80, 130, 190))
        image.save(preview, format="JPEG")
        return True

    monkeypatch.setattr(photo_router, "save_video_preview", fake_video_preview)
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Постер")
    uploaded = upload_photo(
        client,
        guest["guest_token"],
        iphone_mov_bytes(),
        "moment.mov",
        "video/quicktime",
    ).json()
    settings = get_settings()

    with SessionLocal() as db:
        stored = db.query(Photo).filter(Photo.id == uploaded["id"]).one()
        if stored.preview_path:
            absolute_from_data(settings, stored.preview_path).unlink(missing_ok=True)
        thumbnail_path(settings, stored.guest, stored.number).unlink(missing_ok=True)
        stored.preview_path = None
        db.commit()

    gallery = client.get("/api/me/photos", headers=auth_headers(guest["guest_token"]))
    assert gallery.status_code == 200
    assert gallery.json()[0]["thumbnail_url"] == f"/media/thumbs/{uploaded['id']}"

    thumbnail = client.get(f"/media/thumbs/{uploaded['id']}")
    assert thumbnail.status_code == 200
    assert thumbnail.headers["content-type"].startswith("image/webp")

    with SessionLocal() as db:
        repaired = db.query(Photo).filter(Photo.id == uploaded["id"]).one()
        assert repaired.preview_path is not None


def test_album_guest_can_see_another_guest_preview(client):
    event = create_event(client, "Свадьба")
    first = create_guest(client, event["token"], "Ира")
    second = create_guest(client, event["token"], "Олег")
    uploaded = upload_photo(client, first["guest_token"], image_bytes(), "ira.jpg").json()

    response = client.get(
        f"/media/previews/{uploaded['id']}",
        headers=auth_headers(second["guest_token"]),
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/")


def test_album_guest_gets_small_thumbnail_for_grid(client):
    event = create_event(client, "Свадьба")
    first = create_guest(client, event["token"], "Ира")
    uploaded = upload_photo(client, first["guest_token"], image_bytes(size=(2000, 1500)), "big.jpg").json()

    response = client.get(f"/media/thumbs/{uploaded['id']}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/webp")
    thumbnail = Image.open(BytesIO(response.content))
    assert thumbnail.format == "WEBP"
    assert max(thumbnail.size) <= 640


def test_image_thumbnail_lazily_recovers_after_interrupted_background_task(client):
    """Оригинал изображения должен восстановить preview после рестарта worker'а."""

    from app import db as db_module
    from app.config import get_settings
    from app.models import Photo
    from app.storage import absolute_from_data, thumbnail_path

    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Восстановление")
    uploaded = upload_photo(client, guest["guest_token"], image_bytes(), "recover.jpg").json()
    settings = get_settings()

    with db_module.SessionLocal() as db:
        stored = db.query(Photo).filter(Photo.id == uploaded["id"]).one()
        if stored.preview_path:
            absolute_from_data(settings, stored.preview_path).unlink(missing_ok=True)
        thumbnail_path(settings, stored.guest, stored.number).unlink(missing_ok=True)
        stored.preview_path = None
        db.commit()

    gallery = client.get("/api/me/photos", headers=auth_headers(guest["guest_token"]))
    assert gallery.json()[0]["thumbnail_url"] == f"/media/thumbs/{uploaded['id']}"

    thumbnail = client.get(f"/media/thumbs/{uploaded['id']}")
    preview = client.get(f"/media/previews/{uploaded['id']}")

    assert thumbnail.status_code == 200
    assert thumbnail.headers["content-type"].startswith("image/webp")
    assert preview.status_code == 200
    assert preview.headers["content-type"].startswith("image/jpeg")


def test_preview_survives_optional_original_optimization_failure(client, monkeypatch):
    """Ошибка фонового сжатия оригинала не должна удалять уже готовое превью."""

    from app import db as db_module
    from app.config import get_settings
    from app.models import Photo
    from app.routers import photos as photo_router
    from app.storage import absolute_from_data

    def fail_optimization(*_args, **_kwargs):
        raise RuntimeError("optimization failed")

    monkeypatch.setattr(photo_router, "optimize_stored_original", fail_optimization)
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Надежность")
    uploaded = upload_photo(client, guest["guest_token"], image_bytes(), "safe.jpg").json()

    with db_module.SessionLocal() as db:
        stored = db.query(Photo).filter(Photo.id == uploaded["id"]).one()
        assert stored.preview_path is not None
        assert absolute_from_data(get_settings(), stored.preview_path).exists()

    assert client.get(f"/media/thumbs/{uploaded['id']}").status_code == 200


def test_upload_refuses_when_file_would_consume_disk_reserve(client, monkeypatch):
    """Загрузка не должна отнимать последние зарезервированные 200 МБ."""

    from app.routers import photos as photo_router

    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Диск")
    monkeypatch.setattr(
        photo_router.shutil,
        "disk_usage",
        lambda _: SimpleNamespace(
            total=30 * 1024**3,
            used=30 * 1024**3 - 190 * 1024**2,
            free=190 * 1024**2,
        ),
    )

    response = upload_photo(client, guest["guest_token"], image_bytes(), "disk.jpg")

    assert response.status_code == 507
    assert response.json()["detail"]["code"] == "STORAGE_FULL"
    assert response.json()["detail"]["message"] == (
        "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
    )
    assert client.get("/api/me/photos", headers=auth_headers(guest["guest_token"])).json() == []


def test_upload_rejects_non_image_and_does_not_add_photo(client):
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Петя")

    response = upload_photo(client, guest["guest_token"], b"not an image", "bad.jpg")

    assert response.status_code == 415
    gallery = client.get("/api/me/photos", headers=auth_headers(guest["guest_token"]))
    assert gallery.json() == []


def test_duplicate_active_upload_returns_existing_photo(client):
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Лена")
    content = image_bytes()
    first = upload_photo(client, guest["guest_token"], content, "first.jpg")
    second = upload_photo(client, guest["guest_token"], content, "again.jpg")

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]


def test_deleted_duplicate_upload_creates_new_number(client):
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Коля")
    content = image_bytes()
    first = upload_photo(client, guest["guest_token"], content, "first.jpg").json()

    delete_response = client.delete(
        f"/api/photos/{first['id']}",
        headers=auth_headers(guest["guest_token"]),
    )
    assert delete_response.status_code == 204

    second = upload_photo(client, guest["guest_token"], content, "second.jpg")

    assert second.status_code == 201
    assert second.json()["number"] == 2
    gallery = client.get("/api/me/photos", headers=auth_headers(guest["guest_token"]))
    assert [item["number"] for item in gallery.json()] == [2]


def test_parallel_uploads_for_same_guest_get_unique_numbers(client):
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Соня")

    def send(index: int):
        return upload_photo(
            client,
            guest["guest_token"],
            image_bytes(size=(80 + index, 60 + index)),
            f"parallel-{index}.jpg",
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(send, [1, 2]))

    assert [response.status_code for response in responses] == [201, 201]
    assert sorted(response.json()["number"] for response in responses) == [1, 2]

    gallery = client.get("/api/me/photos", headers=auth_headers(guest["guest_token"]))
    assert [item["number"] for item in gallery.json()] == [2, 1]


def test_upload_rejects_tiny_file_with_too_many_pixels(client):
    event = create_event(client, "Свадьба")
    guest = create_guest(client, event["token"], "Вика")

    response = upload_photo(client, guest["guest_token"], image_bytes(size=(6000, 5000)), "huge.jpg")

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "IMAGE_TOO_LARGE"
    gallery = client.get("/api/me/photos", headers=auth_headers(guest["guest_token"]))
    assert gallery.json() == []


def test_large_image_upload_stores_optimized_original(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'app.db'}")
    monkeypatch.setenv("BASE_URL", "https://photos.example.test")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-12345678901234567890")
    monkeypatch.setenv("ORIGINAL_IMAGE_OPTIMIZE_MIN_BYTES", "1")
    monkeypatch.setenv("ORIGINAL_IMAGE_MAX_EDGE", "900")

    from app.main import create_app

    app = create_app()
    with TestClient(app, base_url="https://photos.example.test") as client:
        event = create_event(client, "Свадьба")
        guest = create_guest(client, event["token"], "Оптимизация")
        original = noisy_image_bytes()

        response = upload_photo(client, guest["guest_token"], original, "large.jpg")

        assert response.status_code == 201, response.text
        photo = response.json()
        download = client.get(f"/media/downloads/{photo['id']}")
        assert download.status_code == 200
        assert download.headers["content-type"].startswith("image/jpeg")
        assert len(download.content) < len(original)

        optimized = Image.open(BytesIO(download.content))
        assert max(optimized.size) <= 900
