#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$APP_ROOT/scripts/health-monitor-lib.sh"

health_monitor_load_env
health_monitor_send_alert recovered "200" "200"
echo "Test alert sent (macOS notification + webhook if configured)."
echo "See: $HEALTH_ALERT_LOG"
