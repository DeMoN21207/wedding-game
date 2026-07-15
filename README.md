# QR-сбор свадебных фото

Одноразовый веб-альбом для свадьбы. Админ показывает постоянный QR, гость открывает ссылку, вводит ник, делает или загружает фото, а общий дашборд показывает последние фото и кто сколько добавил.

## Локальный запуск

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/pip install -r backend/requirements-dev.txt

cd frontend
npm install
npm run build
cd ..

DATA_DIR="$PWD/data" \
DATABASE_URL="sqlite:///$PWD/data/db/app.db" \
APP_ENV="development" \
BASE_URL="http://localhost:8000" \
ADMIN_PASSWORD="admin" \
SECRET_KEY="local-secret" \
ALBUM_NAME="Свадебный альбом" \
.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Открыть:

- альбом: `http://localhost:8000/events/`
- админка: `http://localhost:8000/admin`

В админке QR уже постоянный: он ведет гостей на общий альбом `/events/`.

## VPS через Docker Compose

```bash
cp .env.example .env
# обязательно заменить ADMIN_PASSWORD и SECRET_KEY на свои значения
docker compose -f deploy/docker-compose.yml up -d --build
```

Приложение слушает `127.0.0.1:8000`. Существующий HTTPS reverse proxy должен прокидывать домен на этот порт и разрешать body size не меньше 50 МБ.
Production-переменные перечислены в `.env.example` и `docs/PRODUCTION.md`.

## Гости и фото

Гость определяется токеном, который сохраняется в браузере после ввода ника. Ник внутри общего альбома уникален, а фото подписываются этим ником.

## Где лежат фото

```text
data/uploads/<guest-slug>/originals/<guest-slug>_001.jpg
data/uploads/<guest-slug>/previews/<guest-slug>_001.jpg
data/uploads/<guest-slug>/trash/originals/...
```

Номера фото не переиспользуются. Ник отображается как ввел гость, а папки и файлы используют транслит slug. Для локального запуска можно оставить SQLite. На VPS сервис рассчитан на PostgreSQL и два `uvicorn` worker'а.

## Бэкап

```bash
deploy/backup.sh user@backup-host:/backups/wedding-photos/
```

Скачать все фото с VPS:

```bash
ssh vps "tar -czf - /path/to/project/data/uploads" > wedding-uploads.tar.gz
```

## Проверки

```bash
make check
```

Минимально перед выкладкой должны проходить backend lint, backend tests, frontend build и npm audit.
