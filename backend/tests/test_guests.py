from concurrent.futures import ThreadPoolExecutor

from conftest import auth_headers, create_event, create_guest


def test_guest_can_register_and_read_own_profile(client):
    event = create_event(client, "Вечеринка")
    guest = create_guest(client, event["token"], " Дима ")

    response = client.get("/api/me", headers=auth_headers(guest["guest_token"]))

    assert response.status_code == 200
    assert response.json() == {
        "nickname": "Дима",
        "slug": "dima",
        "avatar_index": 1,
        "active_photo_count": 0,
    }


def test_public_event_info_is_available_by_token(client):
    event = create_event(client, "Свадьба Анны и Максима")

    response = client.get(f"/api/events/{event['token']}")

    assert response.status_code == 200
    assert response.json() == {
        "name": "Свадьба Анны и Максима",
        "token": event["token"],
    }


def test_duplicate_nickname_is_rejected_within_same_event(client):
    event = create_event(client, "Свадьба")
    first = create_guest(client, event["token"], "Саша")

    response = client.post(
        "/api/guests",
        json={"event_token": event["token"], "nickname": " саша "},
    )

    assert response.status_code == 409
    assert response.json() == {
        "detail": {
            "code": "NICKNAME_TAKEN",
            "message": "Этот ник уже занят. Придумайте другой.",
        }
    }
    assert first["guest_token"] not in response.text


def test_concurrent_duplicate_registration_creates_one_guest(client):
    event = create_event(client, "Свадьба")

    def register():
        return client.post(
            "/api/guests",
            json={"event_token": event["token"], "nickname": "Одинаковый"},
        )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: register(), range(2)))

    assert sorted(response.status_code for response in responses) == [201, 409]
    duplicate = next(response for response in responses if response.status_code == 409)
    assert duplicate.json()["detail"]["code"] == "NICKNAME_TAKEN"


def test_guest_avatars_are_unique_for_first_twenty_then_repeat(client):
    event = create_event(client, "Свадьба с аватарами")

    guests = [create_guest(client, event["token"], f"Гость {index}") for index in range(1, 22)]

    assert [guest["avatar_index"] for guest in guests[:20]] == list(range(1, 21))
    assert guests[20]["avatar_index"] == 1


def test_same_nickname_allowed_in_different_events(client):
    event1 = create_event(client, "Свадьба 1")
    event2 = create_event(client, "Свадьба 2")
    create_guest(client, event1["token"], "Маша")

    response = client.post(
        "/api/guests",
        json={"event_token": event2["token"], "nickname": "Маша"},
    )

    assert response.status_code == 201


def test_invalid_event_token_is_rejected(client):
    response = client.post(
        "/api/guests",
        json={"event_token": "bad-token", "nickname": "Маша"},
    )

    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "EVENT_NOT_FOUND"


def test_invalid_guest_token_gets_unauthorized(client):
    response = client.get("/api/me", headers=auth_headers("not-a-real-token"))

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "UNAUTHORIZED"
