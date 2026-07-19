#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

CHECK_PATH="${DISK_ALERT_PATH:-/var/www/our-day-dv.ru/events-data}"
MIN_FREE_MB="${DISK_ALERT_MIN_FREE_MB:-}"
MIN_FREE_GB="${DISK_ALERT_MIN_FREE_GB:-}"
STATE_FILE="${DISK_ALERT_STATE_FILE:-/var/lib/wedding-events/disk-alert.state}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"

if [ ! -e "${CHECK_PATH}" ]; then
  logger -t wedding-disk-alert "disk alert path does not exist: ${CHECK_PATH}"
  exit 3
fi

free_kb="$(df -Pk "${CHECK_PATH}" | awk 'NR == 2 { print $4 }')"
used_percent="$(df -Pk "${CHECK_PATH}" | awk 'NR == 2 { print $5 }')"
mount_point="$(df -Pk "${CHECK_PATH}" | awk 'NR == 2 { print $6 }')"
if [ -n "${MIN_FREE_MB}" ]; then
  threshold_kb=$((MIN_FREE_MB * 1024))
elif [ -n "${MIN_FREE_GB}" ]; then
  threshold_kb=$((MIN_FREE_GB * 1024 * 1024))
else
  threshold_kb=$((200 * 1024))
fi
free_gb="$(awk -v kb="${free_kb}" 'BEGIN { printf "%.1f", kb / 1024 / 1024 }')"

mkdir -p "$(dirname "${STATE_FILE}")"
previous_state="ok"
if [ -f "${STATE_FILE}" ]; then
  previous_state="$(cat "${STATE_FILE}")"
fi

send_telegram() {
  local text="$1"
  if [ -z "${TELEGRAM_BOT_TOKEN}" ] || [ -z "${TELEGRAM_CHAT_ID}" ]; then
    return 0
  fi
  curl --fail --silent --show-error \
    --request POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${text}" >/dev/null
}

if [ "${free_kb}" -lt "${threshold_kb}" ]; then
  echo "low" >"${STATE_FILE}"
  if [ "${previous_state}" != "low" ]; then
    message="Wedding album disk alert: ${free_gb} GB free on ${mount_point} (${used_percent} used). Check storage now."
    logger -t wedding-disk-alert "${message}"
    send_telegram "${message}"
  fi
  exit 1
fi

echo "ok" >"${STATE_FILE}"
if [ "${previous_state}" = "low" ]; then
  message="Wedding album disk recovered: ${free_gb} GB free on ${mount_point} (${used_percent} used)."
  logger -t wedding-disk-alert "${message}"
  send_telegram "${message}"
fi
