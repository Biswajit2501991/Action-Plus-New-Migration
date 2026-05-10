#!/bin/zsh
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[autostart] This uninstaller is for macOS only."
  exit 1
fi

LABEL="com.actionplus.gym.autostart"
PLIST_PATH="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl disable "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true

if [[ -f "$PLIST_PATH" ]]; then
  rm -f "$PLIST_PATH"
fi

echo "[autostart] Uninstalled: $LABEL"
