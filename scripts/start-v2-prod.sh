#!/usr/bin/env bash
# Production start for Action Plus V2 (Next.js) behind Cloudflare Tunnel → :3055
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/opt/homebrew/bin:$PATH"
export API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:4000}"
export PORT="${PORT:-3055}"
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-/api}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-https://app.gymactionplus.com}"
export NODE_ENV=production

if [[ ! -d frontend/node_modules ]]; then
  npm run install:frontend
fi

echo "Building V2 frontend…"
npm run build --workspace=frontend 2>/dev/null || (
  cd frontend && npm run build
)

echo ""
echo "Action Plus V2 (production)"
echo "  Local:  http://127.0.0.1:${PORT}"
echo "  Public: ${NEXT_PUBLIC_APP_URL}"
echo "  API →  ${API_PROXY_TARGET}"
echo ""
echo "Ensure Cloudflare Tunnel maps the hostname → http://127.0.0.1:${PORT}"
echo "and Express backend is healthy on ${API_PROXY_TARGET}."
echo ""

cd frontend
exec npm run start
