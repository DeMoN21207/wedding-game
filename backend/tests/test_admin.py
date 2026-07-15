from io import BytesIO
from types import SimpleNamespace
from zipfile import ZipFile

from conftest import create_event, create_guest
from test_photos import image_bytes, upload_photo


def test_admin_requires_login(client):
    response = client.get("/api/admin/events")

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "ADMIN_REQUIRED"


def test_unknown_api_route_returns_json_404(client):
    response = client.get("/api/admin/missing-route")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["detail"]["code"] == "API_NOT_FOUND"


def test_admin_can_create_list_delete_events(client):
    from conftest import login_admin
    login_admin(client)

    create_resp = client.post("/api/admin/events", json={"name": "Свадьба Димы и Вики"})
    assert create_resp.status_code == 201
    event = create_resp.json()
    assert event["name"] == "Свадьба Димы и Вики"
    assert event["guest_count"] == 0
    assert event["photo_count"] == 0

    list_resp = client.get("/api/admin/events")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    qr_resp = client.get(f"/api/admin/events/{event['id']}/qr")
    assert qr_resp.status_code == 200
    assert qr_resp.json()["url"].endswith(f"/events/e/{event['token']}")
    assert qr_resp.json()["qr_png_base64"].startswith("data:image/png;base64,")

    del_resp = client.delete(f"/api/admin/events/{event['id']}")
    assert del_resp.status_code == 204

    list_after = client.get("/api/admin/events")
    assert list_after.json() == []


def test_events_path_exposes_separate_service_api(client):
    from conftest import login_admin
    login_admin(client)

    create_resp = client.post("/events/api/admin/events", json={"name": "Событие на сайте"})
    assert create_resp.status_code == 201
    event = create_resp.json()

    qr_resp = client.get(f"/events/api/admin/events/{event['id']}/qr")
    assert qr_resp.status_code == 200
    assert qr_resp.json()["url"] == f"https://photos.example.test/events/e/{event['token']}"

    public_resp = client.get(f"/events/api/events/{event['token']}")
    assert public_resp.status_code == 200
    assert public_resp.json()["name"] == "Событие на сайте"

    missing_resp = client.get("/events/api/admin/missing-route")
    assert missing_resp.status_code == 404
    assert missing_resp.headers["content-type"].startswith("application/json")
    assert missing_resp.json()["detail"]["code"] == "API_NOT_FOUND"


def test_admin_can_view_guests_photos_and_restore_trash(client):
    from conftest import login_admin
    event = create_event(client, "Тестовое событие")
    guest = create_guest(client, event["token"], "Юля")
    uploaded = upload_photo(client, guest["guest_token"], image_bytes(), "yulya.jpg").json()

    login_admin(client)

    guests = client.get("/api/admin/guests", params={"event_id": event["id"]})
    assert guests.status_code == 200
    assert guests.json()[0]["active_photo_count"] == 1

    photos = client.get("/api/admin/photos", params={"status": "active", "event_id": event["id"]})
    assert photos.status_code == 200
    assert len(photos.json()) == 1

    delete_response = client.delete(f"/api/admin/photos/{uploaded['id']}")
    assert delete_response.status_code == 204

    trashed = client.get("/api/admin/photos", params={"status": "trashed", "event_id": event["id"]})
    assert trashed.status_code == 200
    assert [item["id"] for item in trashed.json()] == [uploaded["id"]]

    restore = client.post(f"/api/admin/photos/{uploaded['id']}/restore")
    assert restore.status_code == 200
    assert restore.json()["status"] == "active"


def test_admin_guest_and_photo_lists_support_pagination(client):
    from conftest import login_admin

    event = create_event(client, "Большой альбом")
    uploaded = []
    for index in range(4):
        guest = create_guest(client, event["token"], f"Гость {index}")
        uploaded.append(
            upload_photo(
                client,
                guest["guest_token"],
                image_bytes(size=(80 + index, 60 + index)),
                f"guest-{index}.jpg",
            ).json()
        )

    login_admin(client)

    guests = client.get("/api/admin/guests", params={"event_id": event["id"], "limit": 2, "offset": 1})
    photos = client.get("/api/admin/photos", params={"status": "active", "event_id": event["id"], "limit": 2, "offset": 1})

    assert guests.status_code == 200, guests.text
    assert [guest["nickname"] for guest in guests.json()] == ["Гость 1", "Гость 2"]
    assert photos.status_code == 200, photos.text
    assert [photo["id"] for photo in photos.json()] == [uploaded[2]["id"], uploaded[1]["id"]]


def test_admin_can_download_active_photos_as_zip_archive(client):
    from conftest import login_admin

    event = create_event(client, "Архив")
    first_guest = create_guest(client, event["token"], "Аня")
    second_guest = create_guest(client, event["token"], "Петя")
    first = upload_photo(client, first_guest["guest_token"], image_bytes(), "anya.jpg").json()
    second = upload_photo(client, second_guest["guest_token"], image_bytes(size=(90, 70)), "petya.jpg").json()
    trashed = upload_photo(client, second_guest["guest_token"], image_bytes(size=(95, 75)), "old.jpg").json()

    login_admin(client)
    assert client.delete(f"/api/admin/photos/{trashed['id']}").status_code == 204

    response = client.get("/api/admin/photos/archive.zip")

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/zip")
    with ZipFile(BytesIO(response.content)) as archive:
        names = archive.namelist()
        assert len(names) == 2
        assert any(f"{first['id']:06d}" in name and name.endswith(".jpg") for name in names)
        assert any(f"{second['id']:06d}" in name and name.endswith(".jpg") for name in names)
        assert not any(f"{trashed['id']:06d}" in name for name in names)


def test_admin_archive_refuses_when_disk_space_is_too_low(client, monkeypatch):
    from conftest import login_admin

    from app.routers import admin as admin_router

    event = create_event(client, "Архив без места")
    guest = create_guest(client, event["token"], "Аня")
    upload_photo(client, guest["guest_token"], image_bytes(), "anya.jpg")
    monkeypatch.setattr(admin_router.shutil, "disk_usage", lambda _: SimpleNamespace(free=1024))

    login_admin(client)
    response = client.get("/api/admin/photos/archive.zip")

    assert response.status_code == 507
    assert response.json()["detail"]["code"] == "ARCHIVE_NOT_ENOUGH_SPACE"


def test_admin_can_permanently_delete_trashed_photo_files(client):
    from conftest import login_admin

    event = create_event(client, "Удаление")
    guest = create_guest(client, event["token"], "Юля")
    uploaded = upload_photo(client, guest["guest_token"], image_bytes(size=(200, 160)), "yulya.jpg").json()

    login_admin(client)
    assert client.delete(f"/api/admin/photos/{uploaded['id']}").status_code == 204

    data_dir = client.app.state.settings.data_dir
    files_before = sorted(path.relative_to(data_dir).as_posix() for path in data_dir.rglob("*") if path.is_file())
    assert any(f"{guest['slug']}_001" in path and "/trash/" in path for path in files_before)

    response = client.delete(f"/api/admin/photos/{uploaded['id']}/permanent")

    assert response.status_code == 204, response.text
    assert client.get("/api/admin/photos", params={"status": "trashed"}).json() == []
    files_after = sorted(path.relative_to(data_dir).as_posix() for path in data_dir.rglob("*") if path.is_file())
    assert not any(f"{guest['slug']}_001" in path for path in files_after)
