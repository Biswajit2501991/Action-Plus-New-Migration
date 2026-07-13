#!/usr/bin/env bash
# Helper to run the V2 Next.js frontend alongside the existing Express backend.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d frontend/node_modules ]]; then
  npm run install:frontend
fi

export API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:4000}"
echo "Starting Action Plus V2 frontend (API → $API_PROXY_TARGET)"
npm run dev:frontend
