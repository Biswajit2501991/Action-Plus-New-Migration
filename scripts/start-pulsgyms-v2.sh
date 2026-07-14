#!/usr/bin/env bash
# Start Action Plus V2 UI for https://www.pulsgyms.com (Cloudflare Tunnel → :3055)
# Defaults to production `next start`. Use DEV=1 for turbopack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${DEV:-0}" == "1" ]]; then
  export PATH="/opt/homebrew/bin:$PATH"
  export API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:4000}"
  export PORT="${PORT:-3055}"
  export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-/api}"
  export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://www.pulsgyms.com}"
  if [[ ! -d frontend/node_modules ]]; then
    npm run install:frontend
  fi
  echo "Action Plus V2 UI (dev)"
  npm run dev:frontend
else
  exec "$ROOT/scripts/start-v2-prod.sh"
fi
