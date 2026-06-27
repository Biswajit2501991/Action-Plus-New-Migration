#!/bin/zsh
set -euo pipefail

# Start production stack detached from the terminal (macOS launchd).
# Safe to close Cursor/Terminal after this — the app keeps running.

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_ROOT"

LABEL="${APG_AUTOSTART_LABEL:-com.actionplus.gym.autostart}"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

plist_points_here() {
  [[ -f "$PLIST_PATH" ]] || return 1
  grep -Fq "$APP_ROOT/scripts/run-autostart.sh" "$PLIST_PATH" 2>/dev/null
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[prod:daemon] macOS launchd required. On other OS, use: nohup npm run dev:all:tunnel >> logs/prod-daemon.log 2>&1 &"
  exit 1
fi

if ! plist_points_here; then
  echo "[prod:daemon] Launch agent missing or points at another folder."
  echo "[prod:daemon] Installing for: $APP_ROOT"
  zsh "$APP_ROOT/scripts/install-autostart-macos.sh"
else
  launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  launchctl kickstart -k "$DOMAIN/$LABEL" 2>/dev/null || launchctl bootstrap "$DOMAIN" "$PLIST_PATH"
fi

echo ""
echo "[prod:daemon] Running in background via launchd ($LABEL)."
echo "[prod:daemon] You can close this terminal — the app will keep running."
echo "[prod:daemon] Status:  npm run autostart:status"
echo "[prod:daemon] Logs:    ~/Library/Logs/com.actionplus.gym/autostart.out.log"
echo "[prod:daemon]          $APP_ROOT/logs/watchdog.log"
echo "[prod:daemon] Stop:    npm run autostart:uninstall  (or launchctl bootout $DOMAIN/$LABEL)"
