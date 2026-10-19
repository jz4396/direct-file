#!/usr/bin/env bash
# One-command local Docker stack for Direct File.
#
#   scripts/local-docker.sh [up]   build and start, wait until healthy
#   scripts/local-docker.sh down   stop and remove containers (keeps data)
#   scripts/local-docker.sh reset  stop and remove containers and data volumes
#   scripts/local-docker.sh status show service status
#   scripts/local-docker.sh logs [service...]
#
# Starts: db, redis, localstack, api (backend), df-client, csp-simulator.
# Open http://localhost:5000/ and sign in with any email at IAL2.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

SERVICES=(db redis localstack api df-client csp-simulator)
ENV_FILE=".local-docker.env"

compose() {
  docker compose --env-file "$ENV_FILE" \
    -f docker-compose.yaml -f docker-compose.local.yaml "$@"
}

ensure_env() {
  if ! docker compose version >/dev/null 2>&1; then
    echo "docker compose v2 is required (docker compose version)" >&2
    exit 1
  fi
  if [[ ! -f "$ENV_FILE" ]]; then
    # Per-checkout development key for local envelope encryption.
    # Generated locally, never committed (see .gitignore).
    umask 077
    printf 'LOCAL_WRAPPING_KEY=%s\n' "$(openssl rand -base64 32)" > "$ENV_FILE"
    echo "created $ENV_FILE with a new local wrapping key"
  fi
}

cmd="${1:-up}"
shift || true
ensure_env

case "$cmd" in
  up)
    compose up -d --build --wait --wait-timeout "${DF_WAIT_TIMEOUT:-900}" "${SERVICES[@]}"
    cat <<MSG

Direct File is up:
  Interview (via CSP simulator): http://localhost:${DF_CSPSIM_PORT:-5000}/
  Client (direct):               http://localhost:${DF_FE_PORT:-3000}/df/file/
  API health:                    http://localhost:${DF_API_PORT:-8080}/df/file/api/actuator/health
Stop with: scripts/local-docker.sh down
MSG
    ;;
  down)   compose down --remove-orphans ;;
  reset)  compose down --remove-orphans --volumes ;;
  status) compose ps ;;
  logs)   compose logs -f "$@" ;;
  *)
    echo "usage: $0 [up|down|reset|status|logs [service...]]" >&2
    exit 2
    ;;
esac
