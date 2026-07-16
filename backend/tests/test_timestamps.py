from datetime import datetime, timezone

from conftest import login_admin
from test_photos import image_bytes, upload_photo


def assert_utc_timestamp(value: str) -> None:
    parsed = value.replace("Z", "+00:00")
    assert value.endswith("+00:00") or value.endswith("Z")
    assert datetime.fromisoformat(parsed).tzinfo == timezone.utc


def test_api_datetimes_are_serialized_with_utc_timezone(client):
    guest_response = client.post("/api/guests", json={"nickname": "Владивосток"})
    assert guest_response.status_code == 201, guest_response.text
    guest = guest_response.json()
    uploaded = upload_photo(client, guest["guest_token"], image_bytes(), "photo.jpg").json()

    album = client.get("/api/album").json()
    assert_utc_timestamp(album["recent_photos"][0]["created_at"])
    assert_utc_timestamp(album["top_guests"][0]["created_at"])

    gallery = client.get("/api/gallery/photos").json()
    assert_utc_timestamp(gallery["photos"][0]["created_at"])

    rating = client.get("/api/rating").json()
    assert_utc_timestamp(rating["guests"][0]["created_at"])

    my_photos = client.get("/api/me/photos", headers={"Authorization": f"Bearer {guest['guest_token']}"}).json()
    assert_utc_timestamp(my_photos[0]["created_at"])

    login_admin(client)
    events = client.get("/api/admin/events").json()
    assert_utc_timestamp(events[0]["created_at"])

    guests = client.get("/api/admin/guests").json()
    assert_utc_timestamp(guests[0]["created_at"])

    photos = client.get("/api/admin/photos").json()
    assert_utc_timestamp(photos[0]["created_at"])

    assert client.delete(f"/api/admin/photos/{uploaded['id']}").status_code == 204
    trashed = client.get("/api/admin/photos", params={"status": "trashed"}).json()
    assert_utc_timestamp(trashed[0]["created_at"])
    assert_utc_timestamp(trashed[0]["trashed_at"])
