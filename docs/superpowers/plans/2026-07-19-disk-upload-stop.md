# 200 MB Disk Upload Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Останавливать загрузку фото и видео до полного заполнения диска, оставляя ровно настраиваемый резерв `200 МБ` и показывая гостю согласованное сообщение.

**Architecture:** Существующие три уровня защиты сохраняются: middleware проверяет `Content-Length`, endpoint проверяет размер `UploadFile`, а `stream_upload` контролирует свободное место во время записи. Порог и текст становятся едиными константами; frontend продолжает показывать сообщение API и корректно сохраняет частичный успех множественной загрузки.

**Tech Stack:** FastAPI, SQLAlchemy, Pillow, pytest, React 19, TypeScript, Vitest, systemd.

## Global Constraints

- Production-резерв диска: `209715200` байт (`200 МБ`).
- HTTP-ответ при нехватке места: `507` с кодом `STORAGE_FULL`.
- Текст для гостя: `Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются.`
- Успешно загруженные файлы из пачки не отправляются повторно.
- Автоматическое удаление старых фото и видео запрещено.
- Бэкапы не добавляются.

---

### Task 1: Единая backend-политика заполненного альбома

**Files:**
- Modify: `backend/tests/test_config.py`
- Modify: `backend/tests/test_main.py`
- Modify: `backend/tests/test_photos.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/errors.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/routers/photos.py`
- Modify: `.env.example`

**Interfaces:**
- Produces: `STORAGE_FULL_MESSAGE: str` из `app.errors`.
- Produces: `DEFAULT_DISK_FREE_RESERVE_BYTES = 200 * 1024 * 1024`.
- Preserves: API detail shape `{"detail": {"code": str, "message": str}}`.

- [ ] **Step 1: Написать падающие тесты конфигурации и API-сообщения**

В `backend/tests/test_config.py` изменить ожидание дефолта:

```python
assert settings.disk_free_reserve_bytes == 200 * 1024 * 1024
```

В `backend/tests/test_main.py` и `backend/tests/test_photos.py` после проверки `STORAGE_FULL` добавить:

```python
assert response.json()["detail"]["message"] == (
    "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
)
```

- [ ] **Step 2: Запустить тесты и подтвердить правильное падение**

Run:

```bash
PYTHONPATH=backend ./.venv/bin/pytest \
  backend/tests/test_config.py::test_development_allows_local_defaults \
  backend/tests/test_main.py::test_upload_is_rejected_before_multipart_parsing_when_disk_reserve_is_at_risk \
  backend/tests/test_photos.py::test_upload_refuses_when_file_would_consume_disk_reserve -q
```

Expected: `3 failed`; текущий дефолт равен `5 ГБ`, текущий текст сообщает о заканчивающемся месте.

- [ ] **Step 3: Добавить единые константы и использовать их во всех отказах**

В `backend/app/errors.py` добавить:

```python
STORAGE_FULL_MESSAGE = "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
```

В `backend/app/config.py` заменить константу:

```python
DEFAULT_DISK_FREE_RESERVE_BYTES = 200 * 1024 * 1024
```

В `backend/app/main.py` импортировать `STORAGE_FULL_MESSAGE` и подставить его в ранний `JSONResponse`. В `backend/app/routers/photos.py` использовать ту же константу в `ensure_upload_disk_space` и обработчике `StorageFullError`.

В `.env.example` установить:

```dotenv
DISK_FREE_RESERVE_BYTES=209715200
```

- [ ] **Step 4: Запустить целевые тесты и lint**

Run:

```bash
PYTHONPATH=backend ./.venv/bin/pytest \
  backend/tests/test_config.py \
  backend/tests/test_main.py \
  backend/tests/test_photos.py::test_upload_refuses_when_file_would_consume_disk_reserve -q
./.venv/bin/ruff check backend/app backend/tests
```

Expected: все тесты проходят, Ruff выводит `All checks passed!`.

- [ ] **Step 5: Зафиксировать backend-политику**

```bash
git add .env.example backend/app backend/tests
git commit -m "Stop uploads with 200 MB disk reserve"
```

---

### Task 2: Проверка остановки во время потоковой записи

**Files:**
- Create: `backend/tests/test_images.py`
- Verify: `backend/app/images.py`

**Interfaces:**
- Consumes: `stream_upload(file, destination, max_bytes, min_free_bytes) -> tuple[int, str]`.
- Consumes: `StorageFullError`.
- Guarantees: частичный `.part` удаляется при достижении резерва.

- [ ] **Step 1: Написать тест потокового отказа**

Создать `backend/tests/test_images.py`:

```python
from io import BytesIO
from types import SimpleNamespace

import pytest
from fastapi import UploadFile

from app import images


def test_stream_upload_removes_partial_file_when_disk_reaches_reserve(tmp_path, monkeypatch):
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
```

- [ ] **Step 2: Запустить тест и подтвердить его результат**

Run:

```bash
PYTHONPATH=backend ./.venv/bin/pytest backend/tests/test_images.py -q
```

Expected: тест проходит на существующем потоковом guard. Если он падает, исправить только очистку partial-файла или условие резерва в `backend/app/images.py`, не меняя API.

- [ ] **Step 3: Запустить все backend-тесты**

```bash
PYTHONPATH=backend ./.venv/bin/pytest backend/tests -q
```

Expected: весь backend-набор проходит.

- [ ] **Step 4: Зафиксировать регрессионную проверку**

```bash
git add backend/tests/test_images.py backend/app/images.py
git commit -m "Test disk reserve during upload streaming"
```

---

### Task 3: Дружелюбный frontend-текст и частичная пачка

**Files:**
- Modify: `frontend/src/features/upload/uploadBatch.ts`
- Modify: `frontend/src/features/upload/uploadBatch.test.ts`
- Modify: `frontend/src/components/UploadButton.tsx`
- Modify: `frontend/src/api/client.test.ts`

**Interfaces:**
- Produces: `uploadFailureMessage(error: unknown) -> string`.
- Consumes: `RequestError.message` из ответа `STORAGE_FULL`.
- Preserves: `PartialUploadError.completedItems` и `remainingItems`.

- [ ] **Step 1: Написать падающий тест форматирования ошибки**

В `frontend/src/features/upload/uploadBatch.test.ts` импортировать `uploadFailureMessage` и добавить:

```typescript
it("показывает гостю сообщение заполненного альбома без технического текста", () => {
  const error = new Error("Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются.");

  expect(uploadFailureMessage(error)).toBe(
    "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
  );
});
```

- [ ] **Step 2: Запустить тест и увидеть отсутствие функции**

```bash
cd frontend && npm run test -- src/features/upload/uploadBatch.test.ts
```

Expected: FAIL, экспорт `uploadFailureMessage` отсутствует.

- [ ] **Step 3: Реализовать чистую функцию и подключить её к кнопке**

В `frontend/src/features/upload/uploadBatch.ts` добавить:

```typescript
export function uploadFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось загрузить файл.";
}
```

В `UploadButton.tsx` импортировать функцию и заменить вычисление ошибки:

```typescript
setError(uploadFailureMessage(err));
```

В `frontend/src/api/client.test.ts` добавить XHR-проверку `507`:

```typescript
xhr.fail(507, {
  detail: {
    code: "STORAGE_FULL",
    message: "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
  }
});

await expect(resultPromise).rejects.toMatchObject({
  status: 507,
  code: "STORAGE_FULL",
  message: "Спасибо за ваши фото! Альбом заполнен, новые файлы больше не принимаются."
});
```

- [ ] **Step 4: Проверить frontend**

```bash
cd frontend && npm run check
```

Expected: Vitest, TypeScript и Vite build проходят.

- [ ] **Step 5: Зафиксировать frontend-поведение**

```bash
git add frontend/src
git commit -m "Show friendly message when album storage is full"
```

---

### Task 4: Системный контроль порога 200 МБ

**Files:**
- Modify: `deploy/disk-space-alert.sh`
- Modify: `backend/tests/test_diagnostics.py`
- Modify: `docs/OPERATIONS.md`
- Modify: `docs/PRODUCTION.md`

**Interfaces:**
- Produces: env `DISK_ALERT_MIN_FREE_MB`, default `200`.
- Preserves: необязательные `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`.
- Produces: exit `1` и state `low` при свободном месте ниже порога.

- [ ] **Step 1: Написать падающий subprocess-тест скрипта**

В `backend/tests/test_diagnostics.py` добавить тест, который вычисляет текущий свободный объём временного каталога, задаёт порог на один мегабайт выше и запускает скрипт:

```python
import os
import shutil
import subprocess


def test_disk_alert_supports_200_mb_threshold(tmp_path):
    free_mb = shutil.disk_usage(tmp_path).free // (1024 * 1024)
    state_file = tmp_path / "disk.state"
    env = {
        **os.environ,
        "DISK_ALERT_PATH": str(tmp_path),
        "DISK_ALERT_MIN_FREE_MB": str(free_mb + 1),
        "DISK_ALERT_STATE_FILE": str(state_file),
        "TELEGRAM_BOT_TOKEN": "",
        "TELEGRAM_CHAT_ID": "",
    }

    result = subprocess.run(["bash", "deploy/disk-space-alert.sh"], env=env, check=False)

    assert result.returncode == 1
    assert state_file.read_text().strip() == "low"
```

- [ ] **Step 2: Запустить тест и подтвердить падение**

```bash
PYTHONPATH=backend ./.venv/bin/pytest backend/tests/test_diagnostics.py::test_disk_alert_supports_200_mb_threshold -q
```

Expected: FAIL, текущий скрипт не читает `DISK_ALERT_MIN_FREE_MB`.

- [ ] **Step 3: Добавить MB-порог с обратной совместимостью**

В `deploy/disk-space-alert.sh` заменить расчёт порога:

```bash
MIN_FREE_MB="${DISK_ALERT_MIN_FREE_MB:-}"
MIN_FREE_GB="${DISK_ALERT_MIN_FREE_GB:-}"
if [ -n "${MIN_FREE_MB}" ]; then
  threshold_kb=$((MIN_FREE_MB * 1024))
elif [ -n "${MIN_FREE_GB}" ]; then
  threshold_kb=$((MIN_FREE_GB * 1024 * 1024))
else
  threshold_kb=$((200 * 1024))
fi
```

Обновить `docs/OPERATIONS.md`: production использует `DISK_ALERT_MIN_FREE_MB=200`. В `docs/PRODUCTION.md` явно указать `DISK_FREE_RESERVE_BYTES=209715200`.

- [ ] **Step 4: Проверить скрипт и полный проект**

```bash
bash -n deploy/disk-space-alert.sh
make check
```

Expected: shell syntax valid; backend, frontend, build и audit проходят.

- [ ] **Step 5: Зафиксировать operational check**

```bash
git add deploy/disk-space-alert.sh backend/tests/test_diagnostics.py docs
git commit -m "Alert when wedding disk reaches 200 MB reserve"
```

---

### Task 5: Production-выкладка и безопасная проверка

**Files:**
- Deploy: repository commit to `/var/www/our-day-dv.ru/events-app`
- Modify on VPS: `/etc/wedding-events.env`
- Modify on VPS: `/etc/wedding-events-ops.env`

**Interfaces:**
- Requires: SSH alias `wedding-events-vps`.
- Verifies: systemd service `wedding-events`, timer `wedding-disk-alert.timer`, nginx and public API.

- [ ] **Step 1: Проверить чистый Git и отправить коммиты**

```bash
git status --short
git push origin main
```

Expected: status пустой; push завершён без ошибок.

- [ ] **Step 2: Скопировать код без данных и виртуального окружения**

```bash
rsync -az \
  --exclude='.git/' \
  --exclude='.venv/' \
  --exclude='frontend/node_modules/' \
  --exclude='.pytest_cache/' \
  --exclude='__pycache__/' \
  --exclude='.env' \
  ./ wedding-events-vps:/var/www/our-day-dv.ru/events-app/
```

- [ ] **Step 3: Установить production-пороги и перезапустить сервисы**

На VPS заменить или добавить значения, не затрагивая остальные секреты:

```bash
set_env_value() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "${file}" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "${file}"
  else
    touch "${file}"
    printf '%s=%s\n' "${key}" "${value}" >>"${file}"
  fi
}

set_env_value /etc/wedding-events.env DISK_FREE_RESERVE_BYTES 209715200
set_env_value /etc/wedding-events-ops.env DISK_ALERT_MIN_FREE_MB 200
```

Затем выполнить:

```bash
install -m 755 /var/www/our-day-dv.ru/events-app/deploy/disk-space-alert.sh /usr/local/sbin/wedding-disk-alert
systemctl daemon-reload
systemctl restart wedding-events
systemctl restart wedding-disk-alert.timer
nginx -t
```

- [ ] **Step 4: Проверить живую конфигурацию без заполнения диска**

```bash
ssh wedding-events-vps 'grep "^DISK_FREE_RESERVE_BYTES=209715200$" /etc/wedding-events.env'
ssh wedding-events-vps 'systemctl is-active wedding-events nginx wedding-disk-alert.timer'
curl -sS -o /dev/null -w '%{http_code}\n' https://event.our-day-dv.ru/events/api/album
```

Expected: env-строка найдена; три сервиса `active`; API отвечает `200`.

- [ ] **Step 5: Проверить журналы и ресурсы**

```bash
ssh wedding-events-vps 'df -h /var/www/our-day-dv.ru/events-data; free -h; journalctl -u wedding-events -u wedding-disk-alert --since "10 minutes ago" --no-pager'
```

Expected: диск не заполнен, OOM/traceback отсутствуют, таймер выполняется.

- [ ] **Step 6: Финальный коммит не требуется**

Production env остаётся вне Git; зафиксированные коммиты уже соответствуют развернутому коду.
