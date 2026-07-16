#!/usr/bin/env bash
set -u

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

TAG="wedding-diagnostics"
OUT_DIR="/var/log/wedding-diagnostics"
REASON="${1:-manual}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="${OUT_DIR}/diagnostic-${STAMP}.log"
EVENT_DOMAIN="${EVENT_DOMAIN:-event.our-day-dv.ru}"
MAIN_DOMAIN="${MAIN_DOMAIN:-our-day-dv.ru}"
PUBLIC_IP="${PUBLIC_IP:-45.146.167.228}"
EVENT_PAGE_URL="${EVENT_PAGE_URL:-https://${EVENT_DOMAIN}/events/}"
EVENT_API_URL="${EVENT_API_URL:-https://${EVENT_DOMAIN}/events/api/album}"
MAIN_SITE_URL="${MAIN_SITE_URL:-https://${MAIN_DOMAIN}/}"
BACKEND_LOCAL_API_URL="${BACKEND_LOCAL_API_URL:-http://127.0.0.1:8000/events/api/album}"

mkdir -p "${OUT_DIR}"
chmod 750 "${OUT_DIR}"

section() {
  printf '\n\n### %s\n' "$1"
}

run_cmd() {
  section "$*"
  timeout 25 "$@" || true
}

curl_probe() {
  local name="$1"
  local url="$2"
  shift 2
  section "curl ${name}: ${url}"
  timeout 12 curl \
    --verbose \
    --location \
    --connect-timeout 3 \
    --max-time 10 \
    --output /tmp/wedding-diagnostic-curl-body \
    --write-out 'http=%{http_code} dns=%{time_namelookup} connect=%{time_connect} tls=%{time_appconnect} first_byte=%{time_starttransfer} total=%{time_total}\n' \
    "$@" \
    "${url}" || true
  rm -f /tmp/wedding-diagnostic-curl-body
}

openssl_probe() {
  local name="$1"
  local host="$2"
  local servername="$3"
  section "openssl ${name}: ${host} sni=${servername}"
  timeout 10 openssl s_client -brief -connect "${host}" -servername "${servername}" </dev/null || true
}

{
  section "metadata"
  printf 'timestamp_utc=%s\n' "$(date -u -Is)"
  printf 'reason=%s\n' "${REASON}"
  hostnamectl || true
  uptime || true

  run_cmd systemctl --no-pager --full status nginx wedding-events wedding-site wedding-healthcheck.timer
  run_cmd free -h
  run_cmd df -h /
  run_cmd ps -eo pid,ppid,user,comm,rss,%mem,%cpu,etime --sort=-rss
  run_cmd ss -s
  section "listening sockets"
  ss -ltnp || true
  section "port 443 tcp sockets"
  ss -tanp | awk 'NR == 1 || /:443/ { print }' | head -300 || true
  section "nginx processes and fds"
  pgrep -a nginx || true
  for pid in $(pgrep nginx || true); do
    printf 'pid=%s fd_count=' "${pid}"
    ls "/proc/${pid}/fd" 2>/dev/null | wc -l || true
  done

  curl_probe "event-domain-api" "${EVENT_API_URL}"
  curl_probe "event-domain-page" "${EVENT_PAGE_URL}"
  curl_probe "main-domain" "${MAIN_SITE_URL}"
  curl_probe "event-loopback-api" "${EVENT_API_URL}" --resolve "${EVENT_DOMAIN}:443:127.0.0.1"
  curl_probe "event-public-ip-api" "${EVENT_API_URL}" --resolve "${EVENT_DOMAIN}:443:${PUBLIC_IP}"
  curl_probe "backend-local-api" "${BACKEND_LOCAL_API_URL}"

  openssl_probe "event-domain" "${EVENT_DOMAIN}:443" "${EVENT_DOMAIN}"
  openssl_probe "event-public-ip" "${PUBLIC_IP}:443" "${EVENT_DOMAIN}"
  openssl_probe "event-loopback" "127.0.0.1:443" "${EVENT_DOMAIN}"

  run_cmd journalctl -u nginx -u wedding-events -u wedding-site -u wedding-healthcheck.service --since "30 min ago" --no-pager
  run_cmd journalctl -k --since "30 min ago" --no-pager

  section "nginx error tails"
  tail -200 /var/log/nginx/error.log /var/log/nginx/*.error.log 2>/dev/null || true
  section "nginx access tails"
  tail -200 /var/log/nginx/access.log /var/log/nginx/*.access.log 2>/dev/null || true
  section "wedding healthcheck logs"
  journalctl -t wedding-healthcheck --since "30 min ago" --no-pager || true
} >"${OUT_FILE}" 2>&1

find "${OUT_DIR}" -type f -name 'diagnostic-*.log' -mtime +14 -delete
ls -1t "${OUT_DIR}"/diagnostic-*.log 2>/dev/null | tail -n +51 | xargs -r rm -f

logger -t "${TAG}" "snapshot reason=${REASON} file=${OUT_FILE}"
printf '%s\n' "${OUT_FILE}"
