from conftest import auth_headers, login_admin
from fastapi.testclient import TestClient
from test_photos import image_bytes, iphone_mov_bytes, upload_photo


def test_album_dashboard_starts_empty_and_exposes_permanent_qr_url(client):
    response = client.get("/api/album")

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Свадебный альбом"
    assert response.json()["qr_url"] == "https://photos.example.test/events/"
    assert response.json()["total_photos"] == 0
    assert response.json()["total_guests"] == 0
    assert response.json()["recent_photos"] == []
    assert response.json()["top_guests"] == []


def test_album_name_can_be_configured_from_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'app.db'}")
    monkeypatch.setenv("BASE_URL", "https://photos.example.test")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-12345678901234567890")
    monkeypatch.setenv("ALBUM_NAME", "Наш лучший день")

    from app.main import create_app

    app = create_app()
    with TestClient(app, base_url="https://photos.example.test") as test_client:
        response = test_client.get("/api/album")

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Наш лучший день"


def test_album_rejects_duplicate_nickname_without_event_token(client):
    first = client.post("/api/guests", json={"nickname": " Маша "})
    second = client.post("/api/guests", json={"nickname": "маша"})

    assert first.status_code == 201, first.text
    assert second.status_code == 409, second.text
    assert second.json() == {
        "detail": {
            "code": "NICKNAME_TAKEN",
            "message": "Этот ник уже занят. Придумайте другой.",
        }
    }
    assert first.json()["guest_token"] not in second.text


def test_album_dashboard_shows_recent_photos_and_contributors(client):
    guest = client.post("/api/guests", json={"nickname": "Лена"}).json()
    uploaded = upload_photo(client, guest["guest_token"], image_bytes(), "lena.jpg").json()

    response = client.get("/api/album")

    assert response.status_code == 200, response.text
    album = response.json()
    assert album["total_photos"] == 1
    assert album["total_guests"] == 1
    assert album["recent_photos"][0]["id"] == uploaded["id"]
    assert album["recent_photos"][0]["guest_nickname"] == "Лена"
    assert album["recent_photos"][0]["preview_url"] == f"/media/previews/{uploaded['id']}"
    assert album["recent_photos"][0]["thumbnail_url"] == f"/media/thumbs/{uploaded['id']}"
    assert album["top_guests"][0]["nickname"] == "Лена"
    assert album["top_guests"][0]["active_photo_count"] == 1


def test_album_dashboard_includes_simple_media_analytics(client):
    guest = client.post("/api/guests", json={"nickname": "Статистика"}).json()
    image_content = image_bytes()
    video_content = iphone_mov_bytes()
    upload_photo(client, guest["guest_token"], image_content, "moment.jpg")
    video = upload_photo(
        client,
        guest["guest_token"],
        video_content,
        "dance.mov",
        "video/quicktime",
    )
    assert video.status_code == 201, video.text

    response = client.get("/api/album")

    assert response.status_code == 200, response.text
    album = response.json()
    assert album["total_photos"] == 2
    assert album["total_images"] == 1
    assert album["total_videos"] == 1
    assert album["total_size_bytes"] == len(image_content) + len(video_content)


def test_public_album_preview_is_available_to_guests_without_owner_token(client):
    guest = client.post("/api/guests", json={"nickname": "Ира"}).json()
    uploaded = upload_photo(client, guest["guest_token"], image_bytes(), "ira.jpg").json()

    response = client.get(f"/media/previews/{uploaded['id']}")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/")


def test_admin_album_qr_uses_permanent_album_url(client):
    login_admin(client)

    response = client.get("/api/admin/album/qr")

    assert response.status_code == 200, response.text
    assert response.json()["url"] == "https://photos.example.test/events/"
    assert response.json()["qr_png_base64"].startswith("data:image/png;base64,")


def test_admin_album_qr_is_cached_per_url(client, monkeypatch):
    from app.routers import admin as admin_router

    login_admin(client)
    calls = 0
    real_make = admin_router.qrcode.make

    def counted_make(url: str):
        nonlocal calls
        calls += 1
        return real_make(url)

    admin_router.qr_data_url.cache_clear()
    monkeypatch.setattr(admin_router.qrcode, "make", counted_make)

    first = client.get("/api/admin/album/qr")
    admin_router.qr_data_url.cache_clear()
    second = client.get("/api/admin/album/qr")

    admin_router.qr_data_url.cache_clear()
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert calls == 1


def test_admin_camera_qr_uses_direct_camera_url(client):
    login_admin(client)

    response = client.get("/api/admin/album/camera-qr")

    assert response.status_code == 200, response.text
    assert response.json()["url"] == "https://photos.example.test/events/camera"
    assert response.json()["qr_png_base64"].startswith("data:image/png;base64,")


def test_album_dashboard_does_not_switch_to_latest_admin_event(client):
    login_admin(client)
    client.post("/api/admin/events", json={"name": "Первое старое событие"})
    client.post("/api/admin/events", json={"name": "Последнее старое событие"})
    client.post("/api/admin/logout")

    response = client.get("/api/album")

    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Свадебный альбом"


def test_guest_profile_still_uses_token_after_album_signup(client):
    guest = client.post("/api/guests", json={"nickname": "Олег"}).json()

    response = client.get("/api/me", headers=auth_headers(guest["guest_token"]))

    assert response.status_code == 200
    assert response.json()["nickname"] == "Олег"


def test_public_gallery_lists_all_active_photos_with_download_links(client):
    first = client.post("/api/guests", json={"nickname": "Лена"}).json()
    second = client.post("/api/guests", json={"nickname": "Ира"}).json()
    uploaded = []

    for index in range(12):
        guest = first if index % 2 == 0 else second
        uploaded.append(
            upload_photo(
                client,
                guest["guest_token"],
                image_bytes(size=(80 + index, 60 + index)),
                f"photo-{index}.jpg",
            ).json()
        )

    client.delete(f"/api/photos/{uploaded[3]['id']}", headers=auth_headers(second["guest_token"]))

    album = client.get("/api/album").json()
    assert len(album["recent_photos"]) == 10
    assert album["total_photos"] == 11

    first_page = client.get("/api/gallery/photos", params={"limit": 5, "offset": 0})
    second_page = client.get("/api/gallery/photos", params={"limit": 5, "offset": 5})

    assert first_page.status_code == 200, first_page.text
    assert first_page.json()["total"] == 11
    assert first_page.json()["has_more"] is True
    assert len(first_page.json()["photos"]) == 5
    assert len(second_page.json()["photos"]) == 5
    assert first_page.json()["photos"][0]["id"] == uploaded[-1]["id"]
    assert uploaded[3]["id"] not in [photo["id"] for photo in first_page.json()["photos"] + second_page.json()["photos"]]
    assert first_page.json()["photos"][0]["preview_url"] == f"/media/previews/{uploaded[-1]['id']}"
    assert first_page.json()["photos"][0]["thumbnail_url"] == f"/media/thumbs/{uploaded[-1]['id']}"
    assert first_page.json()["photos"][0]["download_url"] == f"/media/downloads/{uploaded[-1]['id']}"
    assert first_page.json()["photos"][0]["guest_nickname"] in {"Лена", "Ира"}


def test_public_gallery_download_serves_only_active_originals(client):
    guest = client.post("/api/guests", json={"nickname": "Саша"}).json()
    active = upload_photo(client, guest["guest_token"], image_bytes(), "sasha.jpg").json()
    trashed = upload_photo(client, guest["guest_token"], image_bytes(size=(81, 61)), "trash.jpg").json()
    client.delete(f"/api/photos/{trashed['id']}", headers=auth_headers(guest["guest_token"]))

    download = client.get(f"/media/downloads/{active['id']}")
    missing = client.get(f"/media/downloads/{trashed['id']}")

    assert download.status_code == 200
    assert download.headers["content-type"].startswith("image/")
    assert "attachment" in download.headers["content-disposition"]
    assert missing.status_code == 404


def test_public_rating_lists_all_guests_with_contribution_stats(client):
    leader = client.post("/api/guests", json={"nickname": "Катя"}).json()
    runner_up = client.post("/api/guests", json={"nickname": "Андрей"}).json()
    quiet = client.post("/api/guests", json={"nickname": "Маша"}).json()

    upload_photo(client, runner_up["guest_token"], image_bytes(), "andrey-1.jpg")
    upload_photo(client, leader["guest_token"], image_bytes(size=(84, 64)), "katya-1.jpg")
    upload_photo(client, leader["guest_token"], image_bytes(size=(86, 66)), "katya-2.jpg")

    response = client.get("/api/rating")

    assert response.status_code == 200, response.text
    rating = response.json()
    assert rating["total_photos"] == 3
    assert rating["total_guests"] == 3
    assert [guest["nickname"] for guest in rating["guests"]] == ["Катя", "Андрей", "Маша"]
    assert [guest["rank"] for guest in rating["guests"]] == [1, 2, 3]
    assert [guest["active_photo_count"] for guest in rating["guests"]] == [2, 1, 0]
    assert [guest["contribution_percent"] for guest in rating["guests"]] == [66.67, 33.33, 0.0]
    assert rating["guests"][2]["slug"] == quiet["slug"]
