#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"
printf 'This permanently deletes the local Jump in the Mix database. Type RESET to continue: '
read -r ANSWER
[[ "$ANSWER" == "RESET" ]] || { echo "Canceled."; exit 0; }
docker compose down -v --remove-orphans
printf 'Local data deleted. Rebuilding the guided demo now.\n'
exec ./start-local.sh
