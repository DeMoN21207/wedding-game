from types import SimpleNamespace


def test_spa_fallback_rejects_paths_outside_static_directory(client):
    """Закодированные `..` не должны превращать SPA fallback в файловый сервер ОС."""

    traversal = "/".join(["%2e%2e"] * 8)

    response = client.get(f"/events/{traversal}/etc/passwd")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["detail"]["code"] == "STATIC_FILE_NOT_FOUND"


def test_upload_is_rejected_before_multipart_parsing_when_disk_reserve_is_at_risk(client, monkeypatch):
    """Большой body отклоняется до авторизации и разбора multipart во временный файл."""

    from app import main

    monkeypatch.setattr(
        main.shutil,
        "disk_usage",
        lambda _: SimpleNamespace(total=30 * 1024**3, used=26 * 1024**3, free=4 * 1024**3),
    )

    response = client.post(
        "/events/api/photos",
        content=b"",
        headers={"Content-Length": str(10 * 1024 * 1024)},
    )

    assert response.status_code == 507
    assert response.json()["detail"]["code"] == "STORAGE_FULL"
