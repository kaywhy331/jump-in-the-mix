#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
docker compose down
echo "Jump in the Mix has stopped. Your local data is preserved."
