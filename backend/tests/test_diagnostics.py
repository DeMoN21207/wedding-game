import os
import shutil
import subprocess
from pathlib import Path


def test_response_includes_request_id(client):
    response = client.get("/api/album")

    assert response.status_code == 200
    assert response.headers["x-request-id"]


def test_disk_alert_supports_megabyte_threshold(tmp_path):
    """Operational timer должен использовать тот же порог 200 МБ, что и backend."""

    project_root = Path(__file__).resolve().parents[2]
    free_mb = shutil.disk_usage(tmp_path).free // (1024 * 1024)
    state_file = tmp_path / "disk.state"
    env = {
        **os.environ,
        "DISK_ALERT_PATH": str(tmp_path),
        "DISK_ALERT_MIN_FREE_MB": str(free_mb + 1024),
        "DISK_ALERT_MIN_FREE_GB": "0",
        "DISK_ALERT_STATE_FILE": str(state_file),
        "TELEGRAM_BOT_TOKEN": "",
        "TELEGRAM_CHAT_ID": "",
    }

    result = subprocess.run(
        ["bash", "deploy/disk-space-alert.sh"],
        cwd=project_root,
        env=env,
        check=False,
    )

    assert result.returncode == 1
    assert state_file.read_text().strip() == "low"
