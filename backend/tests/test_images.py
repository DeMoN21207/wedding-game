from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import UploadFile

from app import images


def test_stream_upload_removes_partial_file_when_disk_reaches_reserve(tmp_path, monkeypatch):
    """Поток без надежного Content-Length не должен доесть последние 200 МБ."""

    destination = tmp_path / "upload.part"
    upload = UploadFile(filename="large.mov", file=BytesIO(b"x" * (17 * 1024 * 1024)))
    reserve = 200 * 1024 * 1024
    monkeypatch.setattr(
        images.shutil,
        "disk_usage",
        lambda _: SimpleNamespace(total=reserve * 2, used=reserve, free=reserve),
    )

    with pytest.raises(images.StorageFullError):
        images.stream_upload(upload, destination, 300 * 1024 * 1024, reserve)

    assert not destination.exists()
