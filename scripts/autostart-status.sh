#!/bin/zsh
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="${APG_AUTOSTART_LABEL:-com.actionplus.gym.autostart}"
UID_NUM="$(id -u)"
DOMAIN="gui/$UID_NUM"

echo "=== Action Plus Gym autostart status ==="
echo "label: $LABEL"
echo ""

if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
  echo "launchd: registered"
  launchctl print "$DOMAIN/$LABEL" 2>/dev/null | rg -n "state =|last exit|runs =|pid =" || true
else
  echo "launchd: NOT registered — run: npm run autostart:install"
fi

echo ""
LOCAL_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 http://127.0.0.1:5501/api/health 2>/dev/null || echo 000)"
PUBLIC_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 https://app.gymactionplus.com/ 2>/dev/null || echo 000)"
echo "health: local_api=$LOCAL_CODE public=$PUBLIC_CODE"

if [[ -f "$APP_ROOT/logs/watchdog.log" ]]; then
  echo ""
  echo "watchdog (last 3 lines):"
  tail -n 3 "$APP_ROOT/logs/watchdog.log" || true
fi
