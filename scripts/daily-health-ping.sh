#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

# shellcheck disable=SC1091
source "$APP_ROOT/scripts/health-monitor-lib.sh"

health_monitor_load_env
LOCAL_API_URL="${LOCAL_API_URL:-http://127.0.0.1:5501/api/health}"
PUBLIC_URL="${APP_PUBLIC_URL:-https://app.gymactionplus.com}"
local_code="$(health_monitor_code "$LOCAL_API_URL")"
public_code="$(health_monitor_code "$PUBLIC_URL")"
health_monitor_maybe_daily_ping "$local_code" "$public_code"

tail -n 1 "$HEALTH_DAILY_LOG" 2>/dev/null || echo "[$(health_monitor_ts)] daily_ping (no log yet)"
