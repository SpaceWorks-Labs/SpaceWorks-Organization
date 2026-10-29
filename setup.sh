#!/usr/bin/env bash
# Space Works Organization - guided first-run setup (Linux, macOS, or Windows Git Bash/WSL).
# Run it from the project folder:  bash setup.sh [--build]
# The curl installer (install.sh) runs it from the installed release.
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$PWD"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/setup.sh" "$@"
COMPOSE=("$ROOT/scripts/spaceworks-compose.sh" bundled)
BUILD_FROM_SOURCE=0
case "${1:-}" in
  "") ;;
  --build) BUILD_FROM_SOURCE=1 ;;
  *) printf 'Usage: bash setup.sh [--build]\n' >&2; exit 64 ;;
esac
if [[ "$BUILD_FROM_SOURCE" == 1 ]]; then
  export SWO_COMPOSE_BUILD_LAYER=1
  export SWO_IMAGE_TAG="${SWO_IMAGE_TAG:-local}"
else
  unset SWO_COMPOSE_BUILD_LAYER
fi

say()  { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die()  { printf '\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }
# Docker Desktop on Windows needs drive paths (C:/...) for bind mounts.
host_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# shellcheck source=scripts/spaceworks-repository.sh
source "$ROOT/scripts/spaceworks-repository.sh"
# Questionnaire precedes Docker checks, image pulls and writes to the checkout.
# shellcheck source=scripts/setup-questions.sh
source "$ROOT/scripts/setup-questions.sh"
if [[ "${ANSWERS_CONFIRMED:-}" == yes ]]; then
  :
elif [[ -f .spaceworks-answers ]]; then
  load_setup_answers "$ROOT/.spaceworks-answers" || die 'Invalid private answers file.'
elif [[ ! -f "${SWO_STATIC_ENV_FILE:-$ROOT/.env}" ]]; then
  ask_setup_questions || exit 0
  persist_setup_answers "$ROOT/.spaceworks-answers"
fi

# 1. Docker must be installed and running.
command -v docker >/dev/null 2>&1 || die "Docker is missing. On Linux, run install.sh to install it; on macOS/Windows, install Docker Desktop."
docker info >/dev/null 2>&1 || die "Docker is inaccessible. On Linux, run sudo systemctl start docker and sudo usermod -aG docker \$(id -un), then sign out and back in. On macOS/Windows, start Docker Desktop."
docker compose version >/dev/null 2>&1 || die "The 'docker compose' plugin is missing. Update Docker Desktop."

# shellcheck source=scripts/setup-first-run.sh
source "$ROOT/scripts/setup-first-run.sh"
configure_release_repository || die 'Invalid GitHub repository.'
mkdir -p "$ROOT/backups"
chmod 700 "$ROOT/backups"

if [[ "$BUILD_FROM_SOURCE" == 1 ]]; then
  say "Building the backend image from source (first run can take several minutes)..."
  ${COMPOSE[@]+"${COMPOSE[@]}"} build backend
else
  say "Pulling release images (first run can take a few minutes)..."
  ${COMPOSE[@]+"${COMPOSE[@]}"} pull --quiet
fi

# 2. Private CA and TLS certificates for PostgreSQL, Redis and Silo, made with the
# app image's openssl so the host needs none.
TLS_DIR="${SWO_TLS_DIR:-$ROOT/tls}"
if [[ ! -s "$TLS_DIR/ca.crt" ]]; then
  say "Creating the private CA and service certificates in $TLS_DIR..."
  mkdir -p "$TLS_DIR"
  chmod 755 "$TLS_DIR"
  MSYS_NO_PATHCONV=1 docker run --rm --network none --user "$(id -u):$(id -g)" --entrypoint sh \
    -v "$(host_path "$TLS_DIR"):/tls" -v "$(host_path "$ROOT/deploy/certificates.sh"):/certificates.sh:ro" \
    "$SWO_BACKEND_IMAGE:${SWO_IMAGE_TAG:-latest}" /certificates.sh
fi

say "Starting PostgreSQL, Redis, storage, migrations, the app, the worker and beat, and the web edge..."
${COMPOSE[@]+"${COMPOSE[@]}"} up -d --wait --wait-timeout 300 \
  || die "The stack did not become healthy. Check logs with: ${COMPOSE[*]} logs app migrate"
say "Checking the running stack..."
${COMPOSE[@]+"${COMPOSE[@]}"} run --rm ops || die "Operator checks failed. Inspect with: ${COMPOSE[*]} ps"

if [ "$FIRST_RUN" = 1 ]; then
  if [[ -n "${SUPER_ADMIN_PASSWORD:-}" ]]; then
    say "Creating the super-admin account..."
    printf '%s' "$SUPER_ADMIN_PASSWORD" | ${COMPOSE[@]+"${COMPOSE[@]}"} run --rm -T ops --role ops node docker/ops/admin.mjs \
      create --email "$(repository_env_value SUPER_ADMIN_EMAIL)" --password-stdin \
      || die "Creating the super admin failed. Retry with: bash scripts/admin.sh create --email $(repository_env_value SUPER_ADMIN_EMAIL)"
    unset SUPER_ADMIN_PASSWORD
  fi
  if [[ "${INSTALL_RUNNER:-N}" =~ ^[Yy] ]]; then
    bash "$ROOT/scripts/install-runner.sh" \
      || die 'Runner installation failed. Retry with bash scripts/install-runner.sh.'
  fi
  rm -f -- "$ROOT/.spaceworks-answers"
fi

base_url="$(repository_env_value PUBLIC_APP_BASE_URL)"
say "All done!"
echo "  Website: $base_url"
echo "  Super admin: $(repository_env_value SUPER_ADMIN_EMAIL)"
echo "  Settings and secrets: ${SWO_STATIC_ENV_FILE:-$ROOT/.env} and $TLS_DIR (keep an encrypted off-server copy)"
echo
echo "Next: open $base_url/login, sign in as the super admin with the password you chose, then open"
echo "/super-admin to check email and create your first organisation."
echo "Change the super-admin password only on this server: bash scripts/admin.sh set-password --email <address>"
if [[ "$(repository_env_value DEPLOYMENT_MODE)" == backend ]]; then
  echo "Then deploy the website on Netlify (docs/DEPLOYMENT_NETLIFY.md) with the FRONTEND_GATEWAY_SECRET from .env."
fi
echo "Update later with: bash scripts/update.sh --force   (or run the curl installer again)."
