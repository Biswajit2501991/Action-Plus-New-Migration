#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

# launchd has a minimal PATH; include common Homebrew paths.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export APG_LAUNCHD_MANAGED=1

LOCK_DIR="$APP_ROOT/logs/.autostart.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "[autostart] another instance is running; waiting for lock." >&2
  while [[ -d "$LOCK_DIR" ]]; do sleep 30; done
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT INT TERM

if [[ -f "$APP_ROOT/.env.prod" ]]; then
  export ENV_FILE=.env.prod
fi

read_env_var() {
  local key="$1"
  local file="$2"
  [[ -f "$file" ]] || return 0
  local line val
  line="$(grep -E "^[[:space:]]*${key}=" "$file" 2>/dev/null | tail -n1 || true)"
  [[ -n "$line" ]] || return 0
  val="$(printf '%s' "$line" | sed 's/^[^=]*=//' | sed 's/[[:space:]]*#.*$//' | tr -d "\"' ")"
  [[ -n "$val" ]] && export "${key}=${val}"
}

if [[ ! -v APG_CAFFEINATE ]]; then
  read_env_var APG_CAFFEINATE "$APP_ROOT/.env.prod"
  read_env_var APG_CAFFEINATE "$APP_ROOT/.env"
fi

stop_stale_stack() {
  pkill -f "scripts/dev-frontend.mjs" 2>/dev/null || true
  pkill -f "scripts/apg-supervisor.mjs" 2>/dev/null || true
  pkill -f "scripts/dev-all-with-tunnel.mjs" 2>/dev/null || true
  pkill -f "scripts/dev-all.mjs" 2>/dev/null || true
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  pkill -f "src/server.js" 2>/dev/null || true
  sleep 2
  lsof -ti :4000 -ti :5501 -ti :4010 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 1
}

caf_on=0
case "${APG_CAFFEINATE:-}" in
  1|y|Y|yes|YES|true|TRUE) caf_on=1 ;;
esac

# Keep startup deterministic after reboot/login.
sleep 5

stop_stale_stack

# Build production-ready legacy frontend bundle (no runtime Babel) before launching services.
if [[ -f "$APP_ROOT/scripts/build-legacy-prod-frontend.mjs" ]]; then
  npm run build:legacy:prod >/dev/null 2>&1 || echo "[autostart] legacy prod frontend build failed; falling back to existing files." >&2
fi

if [[ "$(uname -s)" == Darwin && "$caf_on" -eq 1 ]]; then
  if ! command -v caffeinate >/dev/null 2>&1; then
    echo "[autostart] APG_CAFFEINATE=1 but caffeinate not found; starting without it." >&2
    npm run dev:all:tunnel &
  else
    caffeinate -dims -- npm run dev:all:tunnel &
  fi
else
  npm run dev:all:tunnel &
fi
APP_PID=$!
zsh "$APP_ROOT/scripts/watchdog-autorestart.sh" &
WATCHDOG_PID=$!

# Run one post-boot health check once services have had time to initialize.
(
  sleep 25
  "$APP_ROOT/scripts/health-check-after-boot.sh"
) >/dev/null 2>&1 &

cleanup() {
  kill "$WATCHDOG_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

wait "$APP_PID"
