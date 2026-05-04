#!/bin/zsh
set -e
cd "$(dirname "$0")"
echo "Starting Action Plus Gym desktop launcher..."
node "./scripts/bootstrap-and-run.mjs"
