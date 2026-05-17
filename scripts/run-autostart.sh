#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

# launchd has a minimal PATH; include common Homebrew paths.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Optional: APG_CAFFEINATE=1 wraps the stack in `caffeinate -dims` on macOS so idle /
# display / disk sleep are deferred while the tunnel runs. Works on battery or AC;
# long sessions still drain battery faster on battery. Set in .env or the parent environment.
if [[ ! -v APG_CAFFEINATE && -f "$APP_ROOT/.env" ]]; then
  __caf=""
  __caf="$( (grep -E '^[[:space:]]*APG_CAFFEINATE=' "$APP_ROOT/.env" || true) | tail -n1 | sed 's/^[^=]*=//' | sed 's/[[:space:]]*#.*$//' | tr -d "\"' ")"
  [[ -n "$__caf" ]] && export APG_CAFFEINATE="$__caf"
fi

caf_on=0
case "${APG_CAFFEINATE:-}" in
  1|y|Y|yes|YES|true|TRUE) caf_on=1 ;;
esac

# Keep startup deterministic after reboot/login.
sleep 5

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
