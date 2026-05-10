#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

# launchd has a minimal PATH; include common Homebrew paths.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# Keep startup deterministic after reboot/login.
sleep 5

npm run dev:all:tunnel &
APP_PID=$!

# Run one post-boot health check once services have had time to initialize.
(
  sleep 25
  "$APP_ROOT/scripts/health-check-after-boot.sh"
) >/dev/null 2>&1 &

wait "$APP_PID"
