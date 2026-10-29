#!/bin/sh
# Common entrypoint for every process role of the published images, as SpaceWorks
# does it: an explicit `--role <role>` and the command for that role.
#   spaceworks-organization-backend:
#     --role backend node server.js                   the web app and API (image default)
#     --role migrate                                  apply pending migrations once, then exit
#     --role worker node dist/worker.js               BullMQ worker: outbox delivery and every registered job
#     --role beat node dist/beat.js                   BullMQ beat: keeps the repeatable job schedules in Redis
#     --role ops node docker/ops/check.mjs            operator checks
#   spaceworks-organization-frontend:
#     --role frontend node frontend/server.js         the website alone (image default)
# Web roles (backend, frontend) get the public origins applied and need the
# runtime key; they fail closed without it.
#
# Release images are built once for every installation, so the public origins
# Next.js compiles in are placeholders, replaced before a web server starts:
#   spaceworks-organization-origin.invalid   <- NEXT_PUBLIC_BASE_URL (the site)
#   spaceworks-organization-backend.invalid  <- NEXT_PUBLIC_BACKEND_ORIGIN (frontend image)
# Images built with real origins (Render, a local `docker build`) contain no
# placeholder and skip this.
#
# Migrations use DIRECT_URL (a direct or session-mode connection to a role that
# owns the schema), falling back to DATABASE_URL. With MIGRATE_ON_START=1 the
# backend role applies them before starting, for platforms without a separate
# release step (Render). A failed migration exits non-zero.
set -eu

built=${SWO_NEXT_DIR:-/app/.next}

migrate() {
  direct=${DIRECT_URL:-${DATABASE_URL:-}}
  DIRECT_URL="$direct" DATABASE_URL="${DATABASE_URL:-$direct}" CHECKPOINT_DISABLE=1 \
    node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma
  # Upgrades keep an existing SUPER_ADMIN_EMAIL account as super admin, once (docker/ops/admin.mjs).
  DATABASE_URL="${DATABASE_URL:-$direct}" node /app/docker/ops/admin.mjs promote-bootstrap \
    || echo "[entrypoint] Could not check the super-admin account; run scripts/admin.sh list." >&2
}

if [ "${1:-}" != --role ] || [ -z "${2:-}" ]; then
  echo "[entrypoint] An explicit --role (backend, migrate, worker, beat, ops or frontend) and command are required." >&2
  exit 64
fi
role=$2
shift 2
case "$role" in
  migrate)
    echo "[entrypoint] Applying database migrations"
    if [ $# -eq 0 ]; then migrate; exit 0; fi
    exec "$@" ;;
  worker|beat|ops)
    # Background roles and operator checks never serve pages and need no web settings.
    [ $# -gt 0 ] || { echo "[entrypoint] --role $role needs a command." >&2; exit 64; }
    exec "$@" ;;
  backend|frontend)
    [ $# -gt 0 ] || { echo "[entrypoint] --role $role needs a command." >&2; exit 64; } ;;
  *) echo "[entrypoint] Unknown role: $role." >&2; exit 64 ;;
esac

# apply_origin PLACEHOLDER_HOST VARIABLE VALUE: replace a compiled-in placeholder.
apply_origin() {
  placeholder=$1 name=$2 value=$3
  grep -rqF "$placeholder" "$built" 2>/dev/null || return 0
  # Validated before use in sed: no characters that are special to sed or JS strings.
  if ! printf '%s' "$value" | grep -Eq '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
    echo "[entrypoint] Set $name to an origin such as https://members.example.org (no path or trailing slash)." >&2
    exit 1
  fi
  pattern=$(printf '%s' "$placeholder" | sed 's/\./\\./g')
  echo "[entrypoint] Applying $name=$value"
  grep -rlF "$placeholder" "$built" | while IFS= read -r file; do
    sed -i -e "s|https://$pattern|$value|g" -e "s|$pattern|${value#*://}|g" "$file"
  done
  if grep -rqF "$placeholder" "$built"; then
    echo "[entrypoint] $name could not be applied to every file." >&2
    exit 1
  fi
}

if grep -rqF -e spaceworks-organization-origin.invalid -e spaceworks-organization-backend.invalid "$built" 2>/dev/null; then
  # The build's own key ships in every copy of the image; never fall back to it.
  if [ -z "${NEXT_SERVER_ACTIONS_ENCRYPTION_KEY:-}" ]; then
    echo "[entrypoint] Set NEXT_SERVER_ACTIONS_ENCRYPTION_KEY to this installation's own stable key." >&2
    exit 1
  fi
  # next.config.ts compiles the Server Action origin allow-list into the build.
  if [ -n "${ALLOWED_ACTION_ORIGINS:-}" ]; then
    echo "[entrypoint] ALLOWED_ACTION_ORIGINS takes effect only at build time; build your own image to use it." >&2
    exit 1
  fi
fi
apply_origin spaceworks-organization-origin.invalid NEXT_PUBLIC_BASE_URL "${NEXT_PUBLIC_BASE_URL:-}"
apply_origin spaceworks-organization-backend.invalid NEXT_PUBLIC_BACKEND_ORIGIN "${NEXT_PUBLIC_BACKEND_ORIGIN:-}"

if [ "$role" = backend ] && [ "${MIGRATE_ON_START:-0}" = "1" ]; then
  echo "[entrypoint] Applying database migrations (MIGRATE_ON_START=1)"
  migrate
fi

exec "$@"
