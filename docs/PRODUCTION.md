# Production checklist

Этот документ фиксирует минимальный порядок проверки и выкладки свадебного альбома.

## Обязательные env-переменные

- `ADMIN_PASSWORD` - пароль входа в админку.
- `SECRET_KEY` - длинный случайный секрет для подписи cookie.
- `APP_ENV=production` - включает запрет запуска с дефолтными секретами.
- `BASE_URL` - публичный HTTPS-домен сервиса, например `https://event.our-day-dv.ru`.
- `APP_BASE_PATH` - путь сервиса на домене, по умолчанию `/events`.
- `DATABASE_URL` - строка подключения к БД. Для production предпочтительнее PostgreSQL.
- `DATA_DIR` - каталог с БД, временными файлами и фото.
- `MAX_UPLOAD_BYTES` - лимит веса одного файла.
- `MAX_IMAGE_PIXELS` - лимит разрешения изображения.
- `WEB_CONCURRENCY` - число uvicorn worker'ов.

Frontend-переменные `VITE_*` применяются на этапе сборки Docker-образа:

- `VITE_APP_BASE_PATH`
- `VITE_ALBUM_TITLE`
- `VITE_MAX_UPLOAD_BYTES`
- `VITE_SHARE_TITLE`

## Проверка перед выкладкой

В production приложение не стартует, если оставить `ADMIN_PASSWORD` или `SECRET_KEY` из примеров.

```bash
make check
```

Команда запускает:

- `ruff check backend/app backend/tests`
- `pytest backend/tests`
- `npm run build`
- `npm audit --omit=dev`

## Миграции БД

Перед изменениями схемы БД создавать новую Alembic-миграцию. Применение миграций:

```bash
make db-upgrade
```

Для существующего проекта перед первой миграцией остановить сервис и проверить, что миграция применена на ожидаемой БД.

## Healthcheck и диагностика

Скрипты в `deploy/` читают домены из env:

- `EVENT_DOMAIN`
- `MAIN_DOMAIN`
- `PUBLIC_IP`
- `EVENT_PAGE_URL`
- `EVENT_API_URL`
- `MAIN_SITE_URL`
- `BACKEND_LOCAL_API_URL`

Если сайт зависает, сначала смотреть:

```bash
journalctl -u wedding-events -u nginx --since "30 min ago" --no-pager
journalctl -t wedding-healthcheck --since "30 min ago" --no-pager
ls -lt /var/log/wedding-diagnostics/
```

## Внешний мониторинг и диск

Для дня свадьбы стоит настроить внешние проверки из [OPERATIONS.md](./OPERATIONS.md):

- UptimeRobot на `https://event.our-day-dv.ru/events/api/album` с Telegram-алертом.
- Telegram-алерт, если на диске свободно меньше `5 ГБ`.

## Текущие production-долги

- Добавить CI, который запускает `make check` на каждый push.
