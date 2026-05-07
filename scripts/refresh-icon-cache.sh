#!/bin/zsh
set -euo pipefail

echo "Refreshing macOS icon cache (one-time)..."

# Restart Finder and Dock so updated app icons are reloaded.
killall Finder 2>/dev/null || true
killall Dock 2>/dev/null || true

echo "Done. If icon still looks stale, log out and back in once."
