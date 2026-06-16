#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

# shellcheck disable=SC1091
source "$APP_ROOT/scripts/health-monitor-lib.sh"

LOG_DIR="$APP_ROOT/logs"
LOG_FILE="$LOG_DIR/watchdog.log"
mkdir -p "$LOG_DIR"

health_monitor_load_env

PUBLIC_URL="${APP_PUBLIC_URL:-https://app.gymactionplus.com}"
LOCAL_API_URL="${LOCAL_API_URL:-http://127.0.0.1:5501/api/health}"
CHECK_INTERVAL_SECONDS="${WATCHDOG_INTERVAL_SECONDS:-30}"
MAX_FAIL_STREAK="${WATCHDOG_MAX_FAIL_STREAK:-2}"

ts() { health_monitor_ts; }
log() { health_monitor_append "$LOG_FILE" "$*"; }

log "watchdog started local_api=$LOCAL_API_URL public_url=$PUBLIC_URL interval=${CHECK_INTERVAL_SECONDS}s fail_streak=${MAX_FAIL_STREAK}"
fail_streak=0
alert_state="$(health_monitor_alert_state)"

while true; do
  local_code="$(health_monitor_code "$LOCAL_API_URL")"
  public_code="$(health_monitor_code "$PUBLIC_URL")"
  ok_local=0
  ok_public=0
  [[ "$local_code" == "200" ]] && ok_local=1
  [[ "$public_code" == "200" ]] && ok_public=1

  health_monitor_maybe_daily_ping "$local_code" "$public_code"

  if [[ "$ok_local" -eq 1 && "$ok_public" -eq 1 ]]; then
    if [[ "$fail_streak" -gt 0 ]]; then
      log "recovered local=$local_code public=$public_code"
    fi
    if [[ "$alert_state" == "down" ]]; then
      health_monitor_send_alert recovered "$local_code" "$public_code"
      alert_state="ok"
      health_monitor_set_alert_state ok
      log "recovery_alert_sent local=$local_code public=$public_code"
    fi
    fail_streak=0
  else
    fail_streak=$((fail_streak + 1))
    log "health_fail streak=$fail_streak local=$local_code public=$public_code"
    if [[ "$fail_streak" -ge "$MAX_FAIL_STREAK" ]]; then
      if [[ "$alert_state" != "down" ]]; then
        health_monitor_send_alert down "$local_code" "$public_code"
        alert_state="down"
        health_monitor_set_alert_state down
        log "down_alert_sent local=$local_code public=$public_code"
      fi
      log "restart_triggered streak=$fail_streak local=$local_code public=$public_code"
      pkill -f "scripts/dev-frontend.mjs|scripts/apg-supervisor.mjs|scripts/dev-all-with-tunnel.mjs|scripts/dev-all.mjs|cloudflared|node src/server.js" || true
      sleep 3
      if [[ "${APG_LAUNCHD_MANAGED:-}" == "1" ]]; then
        log "restart_delegated_to_launchd (APG_LAUNCHD_MANAGED=1)"
      elif [[ "$(uname -s)" == Darwin && -n "${APG_CAFFEINATE:-}" ]]; then
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
        log "restart_launched dev:all:tunnel"
      else
        npm run dev:all:tunnel >>"$LOG_FILE" 2>&1 &
        log "restart_launched dev:all:tunnel"
      fi
      fail_streak=0
    fi
  fi

  sleep "$CHECK_INTERVAL_SECONDS"
done
