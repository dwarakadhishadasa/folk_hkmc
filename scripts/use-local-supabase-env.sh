#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_TARGETS=(
  "$ROOT_DIR/apps/folk/.env.local|http://localhost:3000"
  "$ROOT_DIR/apps/gita-life/.env.local|http://localhost:3001"
)
STATUS_FILE="$(mktemp)"
BASE_ENV_FILE="$(mktemp)"

cleanup() {
  rm -f "$STATUS_FILE" "$BASE_ENV_FILE"
}
trap cleanup EXIT

cd "$ROOT_DIR"

pnpm dlx supabase@2.98.2 status -o env > "$STATUS_FILE"

get_status_value() {
  local name="$1"
  grep -E "^${name}=" "$STATUS_FILE" | tail -n 1 | cut -d= -f2-
}

api_url="$(get_status_value API_URL)"
anon_key="$(get_status_value ANON_KEY)"
service_role_key="$(get_status_value SERVICE_ROLE_KEY)"

if [[ -z "$api_url" || -z "$anon_key" || -z "$service_role_key" ]]; then
  echo "Could not read local Supabase credentials. Is the local Supabase stack running?" >&2
  exit 1
fi

update_env_file() {
  local env_file="$1"
  local site_url="$2"

  mkdir -p "$(dirname "$env_file")"
  touch "$env_file"

  awk '
    /^# BEGIN LOCAL SUPABASE$/ { skip = 1; next }
    /^# END LOCAL SUPABASE$/ { skip = 0; next }
    skip != 1 { print }
  ' "$env_file" \
    | grep -vE '^(NEXT_PUBLIC_SITE_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_URL|SUPABASE_PUBLISHABLE_KEY|SUPABASE_SERVICE_ROLE_KEY)=' \
    > "$BASE_ENV_FILE" || true

  {
    cat "$BASE_ENV_FILE"
    printf '\n# BEGIN LOCAL SUPABASE\n'
    printf 'NEXT_PUBLIC_SITE_URL=%s\n' "$site_url"
    printf 'NEXT_PUBLIC_SUPABASE_URL=%s\n' "$api_url"
    printf 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%s\n' "$anon_key"
    printf 'NEXT_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$anon_key"
    printf 'SUPABASE_URL=%s\n' "$api_url"
    printf 'SUPABASE_PUBLISHABLE_KEY=%s\n' "$anon_key"
    printf 'SUPABASE_SERVICE_ROLE_KEY=%s\n' "$service_role_key"
    printf '# END LOCAL SUPABASE\n'
  } > "$env_file"

  echo "Updated ${env_file#"$ROOT_DIR"/} with local Supabase values."
}

for target in "${ENV_TARGETS[@]}"; do
  IFS='|' read -r env_file site_url <<< "$target"
  update_env_file "$env_file" "$site_url"
done
