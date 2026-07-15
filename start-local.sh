#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;35m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install Docker Desktop, then run this file again."
docker info >/dev/null 2>&1 || fail "Docker is installed but not running. Open Docker Desktop and wait until it finishes starting."
docker compose version >/dev/null 2>&1 || fail "Docker Compose is unavailable. Update Docker Desktop and try again."

if [[ ! -f .env ]]; then
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    KEY="$(openssl rand -hex 32)"
  else
    KEY="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  fi
  if command -v openssl >/dev/null 2>&1; then
    DB_PASSWORD="$(openssl rand -hex 12)"
  else
    DB_PASSWORD="jitm-$(date +%s)"
  fi
  sed -i.bak "s/DATA_ENCRYPTION_KEY=GENERATE_ME/DATA_ENCRYPTION_KEY=${KEY}/" .env
  sed -i.bak "s/POSTGRES_PASSWORD=jitm/POSTGRES_PASSWORD=${DB_PASSWORD}/" .env
  sed -i.bak "s#DATABASE_URL=postgresql://jitm:jitm@localhost#DATABASE_URL=postgresql://jitm:${DB_PASSWORD}@localhost#" .env
  rm -f .env.bak
  say "Created .env with secure local secrets."
fi

if grep -q '^DATA_ENCRYPTION_KEY=GENERATE_ME$' .env; then
  if command -v openssl >/dev/null 2>&1; then
    KEY="$(openssl rand -hex 32)"
  else
    KEY="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  fi
  sed -i.bak "s/DATA_ENCRYPTION_KEY=GENERATE_ME/DATA_ENCRYPTION_KEY=${KEY}/" .env
  rm -f .env.bak
  say "Generated the missing local encryption key."
fi

APP_PORT="$(grep -E '^APP_PORT=' .env | tail -1 | cut -d= -f2 || true)"
APP_PORT="${APP_PORT:-3000}"

OPEN_BROWSER=1
FORCE_REBUILD=0
for ARG in "$@"; do
  case "$ARG" in
    --no-open) OPEN_BROWSER=0 ;;
    --rebuild) FORCE_REBUILD=1 ;;
  esac
done

NEEDS_BUILD="$FORCE_REBUILD"
for IMAGE in jump-in-the-mix-tools:local jump-in-the-mix-web:local jump-in-the-mix-worker:local; do
  if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then NEEDS_BUILD=1; fi
done

if [[ "$NEEDS_BUILD" == "1" ]]; then
  say "Installing and starting Jump in the Mix..."
  echo "The first build downloads the application dependencies and may take several minutes."
  UP_ARGS=(-d --build)
else
  say "Starting Jump in the Mix..."
  echo "The local images are already installed, so this start should be much faster."
  UP_ARGS=(-d)
fi

if ! docker compose up "${UP_ARGS[@]}"; then
  echo
  echo "Docker could not start the application. Common causes are:"
  echo "  • Docker Desktop is still starting"
  echo "  • Port ${APP_PORT} is already in use (change APP_PORT in .env)"
  echo "  • The first build temporarily lost internet access"
  echo
  docker compose ps || true
  fail "Startup failed. Run ./doctor.sh, then try again."
fi

say "Waiting for the application to become ready..."
READY=0
for _ in $(seq 1 90); do
  if docker compose exec -T web curl -fsS "http://localhost:3000/api/health/ready" >/dev/null 2>&1; then READY=1; break; fi
  sleep 2
  printf '.'
done
printf '\n'

if [[ "$READY" != "1" ]]; then
  docker compose ps
  echo
  echo "Recent web logs:"
  docker compose logs --tail=80 web
  fail "The app did not become ready. Run ./doctor.sh for a focused diagnostic."
fi

say "Jump in the Mix is ready"
echo "App:      http://localhost:${APP_PORT}"
echo "Demo:     demo@jumpinthemix.local"
echo "Password: JumpInTheMix123!"
echo
echo "Stop:     ./stop-local.sh"
echo "Reset:    ./reset-local.sh"
echo "Logs:     docker compose logs -f"

if [[ "$OPEN_BROWSER" == "1" ]]; then
  if command -v open >/dev/null 2>&1; then open "http://localhost:${APP_PORT}/login?firstRun=1" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:${APP_PORT}/login?firstRun=1" >/dev/null 2>&1 || true
  fi
fi
