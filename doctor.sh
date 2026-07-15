#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

ok()   { printf '[OK]   %s\n' "$1"; }
info() { printf '[INFO] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1"; FAILED=1; }

FAILED=0
printf '\nJump in the Mix diagnostic\n==========================\n'

if command -v docker >/dev/null 2>&1; then ok "Docker command found"; else fail "Docker is not installed"; fi
if [[ "$FAILED" == "0" ]] && docker info >/dev/null 2>&1; then ok "Docker engine is running"; else fail "Docker Desktop/Engine is not running"; fi
if [[ "$FAILED" == "0" ]] && docker compose version >/dev/null 2>&1; then ok "Docker Compose is available"; else fail "Docker Compose is unavailable"; fi

if [[ -f .env ]]; then
  ok ".env exists"
  if grep -q '^DATA_ENCRYPTION_KEY=GENERATE_ME$' .env; then fail "DATA_ENCRYPTION_KEY still contains the placeholder"; else ok "Local encryption key is configured"; fi
else
  info ".env is missing; ./start-local.sh will create it automatically"
fi

if [[ "$FAILED" == "0" ]]; then
  if docker compose config -q >/dev/null 2>&1; then ok "Docker Compose configuration is valid"; else fail "Docker Compose configuration is invalid"; fi
fi

APP_PORT="$(grep -E '^APP_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 || true)"
APP_PORT="${APP_PORT:-3000}"
printf '\nService status\n--------------\n'
docker compose ps 2>/dev/null || true

printf '\nHealth check\n------------\n'
if curl -fsS "http://localhost:${APP_PORT}/api/health/ready" >/dev/null 2>&1; then
  ok "Application and database are ready at http://localhost:${APP_PORT}"
else
  info "Application is not ready at http://localhost:${APP_PORT}"
  info "Start it with ./start-local.sh"
  info "Detailed logs: docker compose logs --tail=100 setup web worker postgres"
fi

if [[ "$FAILED" != "0" ]]; then
  printf '\nOne or more required checks failed. Resolve the failed item(s), then run this diagnostic again.\n'
  exit 1
fi
printf '\nNo blocking installation problems were detected.\n'
