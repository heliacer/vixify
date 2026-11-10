#!/usr/bin/env bash
set -euo pipefail
trap 'echo "failed: $BASH_COMMAND"' ERR
cd "$(dirname "$0")"
exec 9>/tmp/vixify-deploy.lock
flock -n 9 || exit 0
export XDG_RUNTIME_DIR="/run/user/$(id -u)"

git fetch --quiet origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && exit 0

git reset --hard --quiet origin/main
npm ci
npm run build
systemctl --user restart vixify
echo "$(date -Is) deployed $(git rev-parse --short HEAD)"
