# Wedding operations

Эти шаги закрывают внешний мониторинг и алерт по диску. Бэкапы здесь сознательно не настраиваются.

## Внешний мониторинг

В UptimeRobot создать HTTPS monitor:

- URL: `https://event.our-day-dv.ru/events/api/album`
- Interval: `1 min`
- Keyword check: `qr_url`
- Alert contact: Telegram

Почему не `/events/`: API проходит через nginx, backend и PostgreSQL, поэтому проверяет всю цепочку, а не только отдачу статической страницы.

## Алерт по свободному месту

Создать `/etc/wedding-events-ops.env`:

```bash
DISK_ALERT_PATH=/var/www/our-day-dv.ru/events-data
DISK_ALERT_MIN_FREE_GB=5
TELEGRAM_BOT_TOKEN=123456:telegram-bot-token
TELEGRAM_CHAT_ID=123456789
```

Установить таймеры:

```bash
install -m 755 deploy/disk-space-alert.sh /usr/local/sbin/wedding-disk-alert
install -m 644 deploy/wedding-disk-alert.service /etc/systemd/system/
install -m 644 deploy/wedding-disk-alert.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wedding-disk-alert.timer
```

## Проверка перед свадьбой

```bash
systemctl list-timers | grep wedding
systemctl status wedding-disk-alert.timer
journalctl -u wedding-disk-alert --since "1 hour ago" --no-pager
```

## Лимит видео и диск

Сейчас сервис рассчитан на видео до `300 МБ`. Это удобно для гостей, но при 23 ГБ свободного места примерно 70 больших видео могут заполнить диск. Поэтому обязательны:

- Telegram-алерт при свободном месте меньше `5 ГБ`;
- ручная проверка свободного места перед мероприятием.

Если окажется, что гости активно грузят длинные видео, безопаснее временно снизить лимит до `150 МБ` через `MAX_UPLOAD_BYTES` и nginx `client_max_body_size`.
