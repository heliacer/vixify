#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

git fetch --quiet origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0

git reset --hard --quiet origin/main
npm ci
npm run build
systemctl --user restart vixify
echo "$(date -Is) deployed $(git rev-parse --short HEAD)"
