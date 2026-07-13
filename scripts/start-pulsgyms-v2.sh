#!/usr/bin/env bash
# Start Action Plus V2 UI for https://www.pulsgyms.com (Cloudflare Tunnel → :3055)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:$PATH"
export API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:4000}"
export PORT="${PORT:-3055}"
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-/api}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://www.pulsgyms.com}"

if [[ ! -d frontend/node_modules ]]; then
  npm run install:frontend
fi

echo "Action Plus V2 UI"
echo "  Local:  http://127.0.0.1:${PORT}"
echo "  Public: ${NEXT_PUBLIC_APP_URL}"
echo "  API →  ${API_PROXY_TARGET}"
echo ""
echo "Ensure Cloudflare Tunnel ingress maps www.pulsgyms.com → http://127.0.0.1:3055"
echo "and the Express backend is already running."
echo ""

npm run dev:frontend
