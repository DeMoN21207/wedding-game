#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVENT_NGINX_SITE="${EVENT_NGINX_SITE:-/etc/nginx/sites-enabled/events.our-day-dv.ru}"
SECURITY_CONF="/etc/nginx/conf.d/wedding-security.conf"
ROUTES_CONF="/etc/nginx/snippets/wedding-events-api-hardening.conf"
INCLUDE_LINE="    include ${ROUTES_CONF};"

install -m 644 "${SCRIPT_DIR}/nginx-wedding-security.conf" "${SECURITY_CONF}"
install -m 644 "${SCRIPT_DIR}/nginx-events-api-hardening.locations.conf" "${ROUTES_CONF}"

if ! grep -Fq "${ROUTES_CONF}" "${EVENT_NGINX_SITE}"; then
  sed -i "/^[[:space:]]*location \/events\/ {/i\\${INCLUDE_LINE}\n" "${EVENT_NGINX_SITE}"
fi

nginx -t
systemctl reload nginx
