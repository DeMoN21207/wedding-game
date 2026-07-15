import pytest


def test_production_rejects_default_admin_password(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    monkeypatch.setenv("SECRET_KEY", "x" * 32)
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))

    from app.config import get_settings

    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        get_settings()


def test_production_rejects_default_secret_key(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ADMIN_PASSWORD", "strong-admin-password")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))

    from app.config import get_settings

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        get_settings()


def test_https_base_url_rejects_default_secrets_even_without_app_env(monkeypatch, tmp_path):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("BASE_URL", "https://event.example.test")
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))

    from app.config import get_settings

    with pytest.raises(RuntimeError, match="ADMIN_PASSWORD"):
        get_settings()


def test_development_allows_local_defaults(monkeypatch, tmp_path):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))

    from app.config import get_settings

    settings = get_settings()

    assert settings.admin_password == "change-me"
    assert settings.secret_key == "local-secret-change-me"
