#!/bin/zsh
# Shared health monitoring helpers (sourced by watchdog / daily ping scripts).

: "${APP_ROOT:=$(cd "$(dirname "${(%):-%x}")/.." && pwd)}"
: "${LOG_DIR:=$APP_ROOT/logs}"
: "${HEALTH_DAILY_LOG:=$LOG_DIR/health-daily.log}"
: "${HEALTH_ALERT_LOG:=$LOG_DIR/health-alerts.log}"
: "${HEALTH_ALERT_STATE:=$LOG_DIR/.health-alert-state}"

health_monitor_ts() { date '+%Y-%m-%d %H:%M:%S %z'; }
health_monitor_today() { date '+%Y-%m-%d'; }

health_monitor_load_env() {
  local key file line val
  for file in "$APP_ROOT/.env.prod" "$APP_ROOT/.env"; do
    [[ -f "$file" ]] || continue
    for key in APP_PUBLIC_URL APG_HEALTH_ALERT_MACOS APG_HEALTH_ALERT_WEBHOOK; do
      [[ -v "$key" ]] && continue
      line="$(grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -n1 || true)"
      [[ -n "$line" ]] || continue
      val="$(printf '%s' "$line" | sed 's/^[^=]*=//' | sed 's/[[:space:]]*#.*$//' | tr -d "\"' ")"
      [[ -n "$val" ]] && export "${key}=${val}"
    done
  done
}

health_monitor_code() {
  local url="$1"
  curl -L -s -o /dev/null -w '%{http_code}' --max-time 12 "$url" 2>/dev/null || echo "000"
}

health_monitor_append() {
  local file="$1"
  shift
  mkdir -p "$LOG_DIR"
  echo "[$(health_monitor_ts)] $*" >> "$file"
}

health_monitor_alert_state() {
  [[ -f "$HEALTH_ALERT_STATE" ]] && cat "$HEALTH_ALERT_STATE" || echo "ok"
}

health_monitor_set_alert_state() {
  mkdir -p "$LOG_DIR"
  printf '%s' "$1" > "$HEALTH_ALERT_STATE"
}

health_monitor_macos_enabled() {
  [[ "$(uname -s)" != "Darwin" ]] && return 1
  case "${APG_HEALTH_ALERT_MACOS:-1}" in
    1|y|Y|yes|YES|true|TRUE) return 0 ;;
    *) return 1 ;;
  esac
}

health_monitor_notify_macos() {
  local title="$1"
  local body="$2"
  health_monitor_macos_enabled || return 0
  command -v osascript >/dev/null 2>&1 || return 0
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import subprocess, sys; subprocess.run(["osascript", "-e", f"display notification {sys.argv[2]!r} with title {sys.argv[1]!r} sound name \"Basso\""], check=False)' \
      "$title" "$body" 2>/dev/null || true
  else
    osascript -e "display notification \"$body\" with title \"$title\" sound name \"Basso\"" 2>/dev/null || true
  fi
}

health_monitor_notify_webhook() {
  local severity="$1"
  local message="$2"
  local url="${APG_HEALTH_ALERT_WEBHOOK:-}"
  [[ -n "$url" ]] || return 0
  local host
  host="$(hostname -s 2>/dev/null || hostname 2>/dev/null || echo unknown)"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json, subprocess, sys, urllib.request
payload = {"severity": sys.argv[1], "message": sys.argv[2], "host": sys.argv[3], "service": "action-plus-gym", "ts": sys.argv[4]}
req = urllib.request.Request(sys.argv[5], data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
try:
    urllib.request.urlopen(req, timeout=15)
except Exception:
    pass' "$severity" "$message" "$host" "$(health_monitor_ts)" "$url" 2>/dev/null || true
  else
    curl -sS -o /dev/null -X POST -H 'Content-Type: application/json' \
      --max-time 15 \
      -d "{\"severity\":\"$severity\",\"message\":\"$message\",\"host\":\"$host\",\"service\":\"action-plus-gym\"}" \
      "$url" 2>/dev/null || true
  fi
}

health_monitor_send_alert() {
  local kind="$1"
  local local_code="$2"
  local public_code="$3"
  local public_url="${APP_PUBLIC_URL:-https://app.gymactionplus.com}"
  local title body

  case "$kind" in
    down)
      title="Action Plus Gym — DOWN"
      body="Stack unhealthy. local=$local_code public=$public_code ($public_url)"
      ;;
    recovered)
      title="Action Plus Gym — Recovered"
      body="Stack healthy again. local=$local_code public=$public_code"
      ;;
    *)
      title="Action Plus Gym"
      body="$kind local=$local_code public=$public_code"
      ;;
  esac

  health_monitor_append "$HEALTH_ALERT_LOG" "alert kind=$kind local=$local_code public=$public_code"
  health_monitor_notify_macos "$title" "$body"
  health_monitor_notify_webhook "$kind" "$body"
}

health_monitor_maybe_daily_ping() {
  local local_code="$1"
  local public_code="$2"
  local public_url="${APP_PUBLIC_URL:-https://app.gymactionplus.com}"
  local today last ping_status

  today="$(health_monitor_today)"
  last=""
  [[ -f "$LOG_DIR/.health-daily-date" ]] && last="$(cat "$LOG_DIR/.health-daily-date" 2>/dev/null || true)"
  [[ "$today" == "$last" ]] && return 0

  if [[ "$local_code" == "200" && "$public_code" == "200" ]]; then
    ping_status="OK"
  else
    ping_status="FAIL"
  fi

  health_monitor_append "$HEALTH_DAILY_LOG" \
    "daily_ping status=$ping_status local=$local_code public=$public_code public_url=$public_url"
  printf '%s' "$today" > "$LOG_DIR/.health-daily-date"
}
