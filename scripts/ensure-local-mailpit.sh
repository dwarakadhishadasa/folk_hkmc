#!/usr/bin/env bash
# Ensures the standalone Mailpit container is running and attached to the local
# Supabase Docker network so the Supabase auth service can deliver dev emails to it.
#
# Usage: pnpm mailpit:start   (run after `pnpm supabase:start`)
set -euo pipefail

PROJECT_ID="folk_hkmc"
NETWORK="supabase_network_${PROJECT_ID}"
CONTAINER="mailpit"
IMAGE="public.ecr.aws/supabase/mailpit:v1.22.3"
SMTP_PORT=1025
UI_PORT=8025

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to run Mailpit." >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Creating Mailpit container ($IMAGE)..."
  docker run -d \
    --name "$CONTAINER" \
    -p "${SMTP_PORT}:1025" \
    -p "${UI_PORT}:8025" \
    "$IMAGE" >/dev/null
fi

if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" != "true" ]]; then
  echo "Starting Mailpit container..."
  docker start "$CONTAINER" >/dev/null
fi

if docker network inspect "$NETWORK" >/dev/null 2>&1; then
  if ! docker inspect -f '{{json .NetworkSettings.Networks}}' "$CONTAINER" | grep -q "\"${NETWORK}\""; then
    echo "Attaching Mailpit to ${NETWORK}..."
    docker network connect "$NETWORK" "$CONTAINER"
  fi
else
  echo "Warning: Docker network ${NETWORK} not found. Run 'pnpm supabase:start' first so Supabase auth can reach Mailpit." >&2
fi

echo "Mailpit ready -> SMTP localhost:${SMTP_PORT}, UI http://localhost:${UI_PORT}"
