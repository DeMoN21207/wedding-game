
import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'app.db'}")
    monkeypatch.setenv("BASE_URL", "https://photos.example.test")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-pass")
    monkeypatch.setenv("SECRET_KEY", "test-secret-key-12345678901234567890")

    from app.main import create_app

    app = create_app()
    with TestClient(app, base_url="https://photos.example.test") as test_client:
        yield test_client


def create_event(client: TestClient, name: str = "Свадьба") -> dict:
    login_admin(client)
    response = client.post("/api/admin/events", json={"name": name})
    assert response.status_code == 201, response.text
    client.post("/api/admin/logout")
    return response.json()


def login_admin(client: TestClient):
    client.post("/api/admin/login", json={"password": "admin-pass"})


def create_guest(client: TestClient, event_token: str, nickname: str = "Дима") -> dict:
    response = client.post(
        "/api/guests",
        json={"event_token": event_token, "nickname": nickname},
    )
    assert response.status_code == 201, response.text
    return response.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
