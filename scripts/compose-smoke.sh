#!/usr/bin/env bash
# shellcheck disable=SC2034 # the answers are read by write_setup_environment
# Disposable end-to-end check of the bundled stack, used by CI and before releases:
# writes a configuration exactly as setup.sh does (plain HTTP, bundled Silo), makes
# the private CA, starts every service through scripts/spaceworks-compose.sh, runs
# the operator checks, proves the worker, beat and edge, backs up and restores the
# database, then removes the stack, its volumes and its files.
#   SWO_IMAGE_TAG=<tag> bash scripts/compose-smoke.sh     use already built/pulled images
#   SWO_COMPOSE_BUILD_LAYER=1 bash scripts/compose-smoke.sh   build from this checkout
# Its own project name (sworg-smoke) and port (18080) keep it apart from real stacks.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
say() { printf '[compose smoke] %s\n' "$*"; }
die() { printf '[compose smoke] ERROR: %s\n' "$*" >&2; exit 1; }
host_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

port="${SWO_SMOKE_PORT:-18080}"
work="$(mktemp -d)"
export SWO_COMPOSE_PROJECT="${SWO_COMPOSE_PROJECT:-sworg-smoke}"
work_host="$(host_path "$work")"
export SWO_STATIC_ENV_FILE="$work_host/.env" SWO_TLS_DIR="$work_host/tls" SWO_BACKUP_DIR="$work_host/backups"
export SWO_IMAGE_TAG="${SWO_IMAGE_TAG:-local}"
COMPOSE=("$SCRIPT_DIR/spaceworks-compose.sh" bundled)
cleanup() {
  local status=$?
  if [[ "$status" != 0 ]]; then "${COMPOSE[@]}" ps -a || true; "${COMPOSE[@]}" logs --tail 60 || true; fi
  "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  # Files written by root inside containers are removed by a container too.
  MSYS_NO_PATHCONV=1 docker run --rm -v "$(host_path "$work"):/work" alpine:3 sh -c 'rm -rf /work/* /work/.env' >/dev/null 2>&1 || true
  rm -rf -- "$work"
  exit "$status"
}
trap cleanup EXIT

# The answers setup.sh would collect, written by its own environment writer.
# shellcheck source=scripts/setup-question-input.sh
source "$SCRIPT_DIR/setup-question-input.sh"
# shellcheck source=scripts/spaceworks-repository.sh
source "$SCRIPT_DIR/spaceworks-repository.sh"
# shellcheck source=scripts/setup-write-environment.sh
source "$SCRIPT_DIR/setup-write-environment.sh"
RUN_FRONTEND=1 SITE_ORIGIN='' HTTPS_MODE=1 WEBHOST=sworg.localhost TLS_EMAIL='' STORAGE=1
SUPER_ADMIN_EMAIL=admin@example.test EMAIL_FROM='Space Works Organization <noreply@example.test>'
SMTP_HOST=smtp.example.test SMTP_PORT=587 SMTP_USER=smoke SMTP_PASSWORD="$(rand_key 24)"
GOOGLE_CLIENT_ID='' GITHUB_CLIENT_ID='' ANSWERS_CONFIRMED=yes
write_setup_environment
sed -i "s/^HTTP_PORT=.*/HTTP_PORT='$port'/" "$SWO_STATIC_ENV_FILE"
mkdir -p "$work/tls" "$work/backups"
if [[ "${SWO_COMPOSE_BUILD_LAYER:-0}" == 1 ]]; then "${COMPOSE[@]}" build backend; fi
MSYS_NO_PATHCONV=1 docker run --rm --network none --user "$(id -u):$(id -g)" --entrypoint sh \
  -v "$SWO_TLS_DIR:/tls" -v "$(host_path "$ROOT/deploy/certificates.sh"):/certificates.sh:ro" \
  "$SWO_BACKEND_IMAGE:$SWO_IMAGE_TAG" /certificates.sh

say 'Starting the bundled stack.'
"${COMPOSE[@]}" up -d --wait --wait-timeout 300
say 'Migrations ran:'
"${COMPOSE[@]}" logs migrate | grep -E 'migrations|No pending' | tail -n 3
"${COMPOSE[@]}" run --rm ops

say 'The web edge serves the app and hides the internal job endpoints.'
curl --fail --silent --show-error --header 'Host: sworg.localhost' "http://127.0.0.1:$port/api/health" >/dev/null
status="$(curl --silent --output /dev/null --write-out '%{http_code}' --request POST --header 'Host: sworg.localhost' "http://127.0.0.1:$port/api/internal/outbox")"
[[ "$status" == 404 ]] || die "The edge exposed /api/internal/outbox (HTTP $status)."

for role in worker beat; do
  say "Waiting for the $role to report healthy."
  for _ in $(seq 1 30); do
    health="$(docker inspect --format '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q "$role")")"
    [[ "$health" == healthy ]] && break
    sleep 5
  done
  [[ "$health" == healthy ]] || die "The $role never became healthy."
  "${COMPOSE[@]}" logs "$role" | tail -n 3
done

say 'Backing up and restoring the database.'
SWO_UPDATE_INSTALL_DIR="$ROOT" bash "$SCRIPT_DIR/backup.sh" --prefix smoke
dump="$(find "$work/backups" -maxdepth 1 -name 'smoke-*.sql.gz' -exec basename {} \; | head -n 1)"
[[ -n "$dump" ]] || die 'No database dump was written.'
SWO_UPDATE_INSTALL_DIR="$ROOT" bash "$SCRIPT_DIR/restore.sh" "backups/$dump" --yes
"${COMPOSE[@]}" run --rm ops
say 'Bundled stack smoke test passed.'
