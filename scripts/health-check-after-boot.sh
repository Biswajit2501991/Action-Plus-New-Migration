#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$APP_ROOT/logs"
LOG_FILE="$LOG_DIR/health-check.log"
mkdir -p "$LOG_DIR"

TS="$(date '+%Y-%m-%d %H:%M:%S %z')"
PUBLIC_URL="${1:-https://app.gymactionplus.com}"
LOCAL_URL="${2:-http://127.0.0.1:5501/index.html}"

LOCAL_CODE="$(curl -L -s -o /dev/null -w '%{http_code}' --max-time 15 "$LOCAL_URL" || echo '000')"
PUBLIC_CODE="$(curl -L -s -o /dev/null -w '%{http_code}' --max-time 20 "$PUBLIC_URL" || echo '000')"

STATUS="FAIL"
if [[ "$LOCAL_CODE" == "200" && "$PUBLIC_CODE" == "200" ]]; then
  STATUS="OK"
fi

echo "[$TS] $STATUS local=$LOCAL_CODE public=$PUBLIC_CODE local_url=$LOCAL_URL public_url=$PUBLIC_URL" >> "$LOG_FILE"
