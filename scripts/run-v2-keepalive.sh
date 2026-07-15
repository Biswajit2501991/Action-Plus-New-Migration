#!/bin/zsh
set -euo pipefail

ROOT="/Users/biswajit/Desktop/New App Migration"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:4000}"
export PORT="${PORT:-3055}"
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-/api}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://app.gymactionplus.com}"
export NODE_ENV=production

LOG_DIR="$HOME/Library/Logs/com.actionplus.gym"
mkdir -p "$LOG_DIR"
NPM="/opt/homebrew/bin/npm"

port_up() {
  /usr/sbin/lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1
}

for _ in {1..60}; do
  if /usr/bin/curl -sf --max-time 2 "http://127.0.0.1:4000/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

while true; do
  if port_up; then
    sleep 30
    continue
  fi
  print "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] starting V2 on :${PORT}" >>"$LOG_DIR/v2.out.log"
  cd "$ROOT/frontend"
  if [[ ! -f .next/BUILD_ID ]]; then
    "$NPM" run build >>"$LOG_DIR/v2.out.log" 2>>"$LOG_DIR/v2.err.log" || true
  fi
  "$NPM" run start >>"$LOG_DIR/v2.out.log" 2>>"$LOG_DIR/v2.err.log" &
  sleep 5
done
