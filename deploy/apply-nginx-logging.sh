#!/usr/bin/env bash
set -euo pipefail

update_site() {
  local file="$1"
  local access_log="$2"
  local error_log="$3"

  sed -i "s#access_log ${access_log};#access_log ${access_log} wedding_diagnostics;#g" "${file}"
  sed -i "s#error_log ${error_log};#error_log ${error_log} info;#g" "${file}"

  if ! grep -q "X-Request-ID" "${file}"; then
    sed -i '/proxy_set_header Host/a\        proxy_set_header X-Request-ID $request_id;' "${file}"
  fi
}

EVENT_NGINX_SITE="${EVENT_NGINX_SITE:-/etc/nginx/sites-available/events.our-day-dv.ru}"
EVENT_NGINX_ACCESS_LOG="${EVENT_NGINX_ACCESS_LOG:-/var/log/nginx/events.our-day-dv.ru.access.log}"
EVENT_NGINX_ERROR_LOG="${EVENT_NGINX_ERROR_LOG:-/var/log/nginx/events.our-day-dv.ru.error.log}"
MAIN_NGINX_SITE="${MAIN_NGINX_SITE:-/etc/nginx/sites-available/our-day-dv.ru}"
MAIN_NGINX_ACCESS_LOG="${MAIN_NGINX_ACCESS_LOG:-/var/log/nginx/our-day-dv.ru.access.log}"
MAIN_NGINX_ERROR_LOG="${MAIN_NGINX_ERROR_LOG:-/var/log/nginx/our-day-dv.ru.error.log}"

update_site \
  "${EVENT_NGINX_SITE}" \
  "${EVENT_NGINX_ACCESS_LOG}" \
  "${EVENT_NGINX_ERROR_LOG}"

update_site \
  "${MAIN_NGINX_SITE}" \
  "${MAIN_NGINX_ACCESS_LOG}" \
  "${MAIN_NGINX_ERROR_LOG}"

nginx -t
