#!/bin/zsh
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[autostart] This installer is for macOS only."
  exit 1
fi

APP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.actionplus.gym.autostart"
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_PATH="$PLIST_DIR/$LABEL.plist"
LOG_DIR="$APP_ROOT/logs"
OUT_LOG="$HOME/Library/Logs/com.actionplus.gym/autostart.out.log"
ERR_LOG="$HOME/Library/Logs/com.actionplus.gym/autostart.err.log"

mkdir -p "$PLIST_DIR" "$LOG_DIR" "$HOME/Library/Logs/com.actionplus.gym"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$APP_ROOT/scripts/run-autostart.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$APP_ROOT</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$OUT_LOG</string>
  <key>StandardErrorPath</key>
  <string>$ERR_LOG</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
# Service may be in launchctl's disabled overrides (causes bootstrap I/O error 5).
launchctl enable "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/$LABEL"
launchctl kickstart -k "gui/$(id -u)/$LABEL" 2>/dev/null || true

echo "[autostart] Installed and started: $LABEL"
echo "[autostart] Plist: $PLIST_PATH"
echo "[autostart] Logs: $OUT_LOG and $ERR_LOG"
