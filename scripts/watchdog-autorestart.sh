#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

LOG_DIR="$APP_ROOT/logs"
LOG_FILE="$LOG_DIR/watchdog.log"
mkdir -p "$LOG_DIR"

PUBLIC_URL="${APP_PUBLIC_URL:-https://app.gymactionplus.com}"
LOCAL_API_URL="${LOCAL_API_URL:-http://127.0.0.1:5501/api/health}"
CHECK_INTERVAL_SECONDS="${WATCHDOG_INTERVAL_SECONDS:-30}"
MAX_FAIL_STREAK="${WATCHDOG_MAX_FAIL_STREAK:-2}"

ts() { date '+%Y-%m-%d %H:%M:%S %z'; }
log() { echo "[$(ts)] $*" >> "$LOG_FILE"; }

health_code() {
  local url="$1"
  curl -L -s -o /dev/null -w '%{http_code}' --max-time 12 "$url" || echo "000"
}

log "watchdog started local_api=$LOCAL_API_URL public_url=$PUBLIC_URL interval=${CHECK_INTERVAL_SECONDS}s fail_streak=${MAX_FAIL_STREAK}"
fail_streak=0

while true; do
  local_code="$(health_code "$LOCAL_API_URL")"
  public_code="$(health_code "$PUBLIC_URL")"
  ok_local=0
  ok_public=0
  [[ "$local_code" == "200" ]] && ok_local=1
  [[ "$public_code" == "200" ]] && ok_public=1

  if [[ "$ok_local" -eq 1 && "$ok_public" -eq 1 ]]; then
    if [[ "$fail_streak" -gt 0 ]]; then
      log "recovered local=$local_code public=$public_code"
    fi
    fail_streak=0
  else
    fail_streak=$((fail_streak + 1))
    log "health_fail streak=$fail_streak local=$local_code public=$public_code"
    if [[ "$fail_streak" -ge "$MAX_FAIL_STREAK" ]]; then
      log "restart_triggered streak=$fail_streak local=$local_code public=$public_code"
      pkill -f "scripts/dev-frontend.mjs|scripts/apg-supervisor.mjs|scripts/dev-all-with-tunnel.mjs|scripts/dev-all.mjs|cloudflared|node src/server.js" || true
      sleep 3
      if [[ "$(uname -s)" == Darwin && -n "${APG_CAFFEINATE:-}" ]]; then
        case "${APG_CAFFEINATE}" in
          1|y|Y|yes|YES|true|TRUE)
            if command -v caffeinate >/dev/null 2>&1; then
              caffeinate -dims -- npm run dev:all:tunnel >>"$LOG_FILE" 2>&1 &
            else
              npm run dev:all:tunnel >>"$LOG_FILE" 2>&1 &
            fi
            ;;
          *) npm run dev:all:tunnel >>"$LOG_FILE" 2>&1 & ;;
        esac
      else
        npm run dev:all:tunnel >>"$LOG_FILE" 2>&1 &
      fi
      log "restart_launched dev:all:tunnel"
      fail_streak=0
    fi
  fi

  sleep "$CHECK_INTERVAL_SECONDS"
done
