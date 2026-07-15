#!/usr/bin/env bash
set -u

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

TAG="wedding-healthcheck"
LOCK_FILE="/run/wedding-healthcheck.lock"
EVENT_DOMAIN="${EVENT_DOMAIN:-event.our-day-dv.ru}"
MAIN_DOMAIN="${MAIN_DOMAIN:-our-day-dv.ru}"
EVENT_PAGE_URL="${EVENT_PAGE_URL:-https://${EVENT_DOMAIN}/events/}"
EVENT_API_URL="${EVENT_API_URL:-https://${EVENT_DOMAIN}/events/api/album}"
MAIN_SITE_URL="${MAIN_SITE_URL:-https://${MAIN_DOMAIN}/}"
BACKEND_LOCAL_API_URL="${BACKEND_LOCAL_API_URL:-http://127.0.0.1:8000/events/api/album}"
EVENT_PAGE_MARKER="${EVENT_PAGE_MARKER:-Свадебный альбом}"
EVENT_API_MARKER="${EVENT_API_MARKER:-qr_url}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  logger -t "${TAG}" "previous healthcheck is still running"
  exit 0
fi

check_url() {
  local name="$1"
  local url="$2"
  local needle="${3:-}"
  local resolve="${4:-}"
  local body
  local status
  local curl_args=(
    --silent
    --show-error
    --location
    --connect-timeout 3
    --max-time 8
    --write-out "%{http_code}"
  )

  if [ -n "${resolve}" ]; then
    curl_args+=(--resolve "${resolve}")
  fi

  body="$(mktemp)"
  if ! status="$(curl "${curl_args[@]}" --output "${body}" "${url}" 2>&1)"; then
    logger -t "${TAG}" "${name} failed: ${status}"
    rm -f "${body}"
    return 1
  fi

  if [ "${status}" != "200" ]; then
    logger -t "${TAG}" "${name} failed: HTTP ${status}"
    rm -f "${body}"
    return 1
  fi

  if [ -n "${needle}" ] && ! grep -q "${needle}" "${body}"; then
    logger -t "${TAG}" "${name} failed: expected marker not found"
    rm -f "${body}"
    return 1
  fi

  rm -f "${body}"
  return 0
}

run_checks() {
  local failed=0

  check_url \
    "event-api-domain" \
    "${EVENT_API_URL}" \
    "${EVENT_API_MARKER}" \
    "" || failed=1

  check_url \
    "event-page-domain" \
    "${EVENT_PAGE_URL}" \
    "${EVENT_PAGE_MARKER}" \
    "" || failed=1

  check_url \
    "main-site-domain" \
    "${MAIN_SITE_URL}" \
    "" \
    "" || failed=1

  check_url \
    "event-api-loopback" \
    "${EVENT_API_URL}" \
    "${EVENT_API_MARKER}" \
    "${EVENT_DOMAIN}:443:127.0.0.1" || failed=1

  check_url \
    "event-page-loopback" \
    "${EVENT_PAGE_URL}" \
    "${EVENT_PAGE_MARKER}" \
    "${EVENT_DOMAIN}:443:127.0.0.1" || failed=1

  check_url \
    "main-site-loopback" \
    "${MAIN_SITE_URL}" \
    "" \
    "${MAIN_DOMAIN}:443:127.0.0.1" || failed=1

  check_url \
    "event-backend-local" \
    "${BACKEND_LOCAL_API_URL}" \
    "${EVENT_API_MARKER}" \
    "" || failed=1

  return "${failed}"
}

if run_checks; then
  exit 0
fi

diagnostic_before="$(/usr/local/sbin/wedding-diagnostics healthcheck-before-restart 2>/dev/null || true)"
if [ -n "${diagnostic_before}" ]; then
  logger -t "${TAG}" "diagnostic before restart: ${diagnostic_before}"
fi

logger -t "${TAG}" "healthcheck failed, restarting nginx and wedding-events"
nginx -t
systemctl restart nginx wedding-events
sleep 3

if run_checks; then
  diagnostic_after="$(/usr/local/sbin/wedding-diagnostics healthcheck-recovered 2>/dev/null || true)"
  if [ -n "${diagnostic_after}" ]; then
    logger -t "${TAG}" "diagnostic after recovery: ${diagnostic_after}"
  fi
  logger -t "${TAG}" "services recovered after restart"
  exit 0
fi

diagnostic_failed="$(/usr/local/sbin/wedding-diagnostics healthcheck-still-unhealthy 2>/dev/null || true)"
if [ -n "${diagnostic_failed}" ]; then
  logger -t "${TAG}" "diagnostic after failed recovery: ${diagnostic_failed}"
fi

logger -t "${TAG}" "services are still unhealthy after restart"
exit 2
