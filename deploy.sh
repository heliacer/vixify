#!/usr/bin/env bash
# Updates the bot to origin/main and restarts it, but only if something changed.
# Runs every 5 minutes from cron, or right away with `npm run deploy` from your PC.
set -euo pipefail
cd "$(dirname "$0")"
export XDG_RUNTIME_DIR="/run/user/$(id -u)" # lets cron talk to systemctl --user

git fetch --quiet origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0

git reset --hard --quiet origin/main
npm ci
npm run build
systemctl --user restart vixify
echo "$(date -Is) deployed $(git rev-parse --short HEAD)"
