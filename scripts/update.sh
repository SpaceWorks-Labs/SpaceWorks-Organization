#!/usr/bin/env bash
# Apply the newest published Space Works Organization release to a bundled Compose stack.
set -euo pipefail

UPDATE_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SWO_UPDATE_INSTALL_DIR:-$(cd "$UPDATE_SCRIPT_DIR/.." && pwd)}"
cd "$ROOT"
export SWO_UPDATE_INSTALL_DIR="$ROOT"
# shellcheck source=scripts/install-owner.sh
source "$UPDATE_SCRIPT_DIR/install-owner.sh"
require_install_owner "$UPDATE_SCRIPT_DIR/update.sh" "$@"

# The installed wrapper and compose files stay authoritative until the backup is taken.
COMPOSE=("$ROOT/scripts/spaceworks-compose.sh" bundled)
LOCK_DIR="$ROOT/.spaceworks-update.lock"
VERSION_FILE="$ROOT/.spaceworks-version"
PREVIOUS_FILE="$ROOT/.spaceworks-previous-version"
# shellcheck source=scripts/spaceworks-repository.sh
source "$UPDATE_SCRIPT_DIR/spaceworks-repository.sh"
configure_release_repository
TAG_PATTERN='^v[0-9]+\.[0-9]+\.[0-9]+-main\.[0-9]+\.[0-9a-f]{12}$'
update_complete=0
deployment_started=0
host_configuration_started=0
previous_version=""
backup_name=""
UPDATE_LOCK_HELD=0
UPDATE_LOCK_OVERRIDE=0
REQUESTED_VERSION=""
ROLLBACK=0

say() { printf '[Space Works updater] %s\n' "$*"; }
warn() { printf '[Space Works updater] WARNING: %s\n' "$*" >&2; }
die() { printf '[Space Works updater] ERROR: %s\n' "$*" >&2; exit 1; }
# shellcheck source=scripts/update-lock.sh
source "$UPDATE_SCRIPT_DIR/update-lock.sh"
# shellcheck source=scripts/install-host-bundle.sh
source "$UPDATE_SCRIPT_DIR/install-host-bundle.sh"
# shellcheck source=scripts/update-rollback.sh
source "$UPDATE_SCRIPT_DIR/update-rollback.sh"

ARGUMENTS=("$@")
while (($# > 0)); do
  case "$1" in
    --force) ;;
    --version)
      [[ -z "$REQUESTED_VERSION" ]] || die "--version may only be specified once."
      shift; (($# > 0)) || die "--version requires an immutable main release version."
      REQUESTED_VERSION="$1"
      [[ "v$REQUESTED_VERSION" =~ $TAG_PATTERN ]] || die "--version requires X.Y.Z-main.<run>.<12 lowercase hex SHA>."
      ;;
    --rollback) ROLLBACK=1 ;;
    --override-lock) UPDATE_LOCK_OVERRIDE=1 ;;
    -h|--help)
      cat <<'EOF'
Usage: scripts/update.sh [--force] [--version <version> | --rollback] [--override-lock]
  --version <version>  deploy this exact published main release of the configured repository
  --rollback           return to the release that ran before the last update (images and host
                       files; database changes stay - restore backups/pre-update-*.sql.gz for those)
  --override-lock      clear a verified stale/wedged portable update lock
EOF
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
  shift
done
[[ "$ROLLBACK" == 0 || -z "$REQUESTED_VERSION" ]] || die "Use either --version or --rollback, not both."

command -v docker >/dev/null 2>&1 || die "Docker is not installed."
command -v curl >/dev/null 2>&1 || die "curl is required to check GitHub releases."
cleanup() {
  exit_code=$?
  trap - EXIT
  set +e
  if [[ "$deployment_started" == 1 && "$update_complete" == 0 ]]; then
    rollback_application_images
  elif [[ "$exit_code" != 0 && "$host_configuration_started" == 1 ]]; then
    restore_host_bundle
    warn "The update stopped before deployment; the running release was not replaced."
  fi
  release_update_lock
  [[ -z "${SWO_UPDATE_STAGE_DIR:-}" || "$SWO_UPDATE_STAGE_DIR" != */.sworg-stage.* ]] || rm -rf -- "$SWO_UPDATE_STAGE_DIR"
  exit "$exit_code"
}
trap cleanup EXIT
acquire_update_lock

current=""
[[ ! -f "$VERSION_FILE" ]] || current="$(tr -d '[:space:]' < "$VERSION_FILE")"
previous_version="$current"
last_backup="$(cat "$ROOT/.spaceworks-previous-backup" 2>/dev/null || true)"
if [[ "$ROLLBACK" == 1 ]]; then
  REQUESTED_VERSION="$(tr -d '[:space:]' < "$PREVIOUS_FILE" 2>/dev/null || true)"
  [[ "v$REQUESTED_VERSION" =~ $TAG_PATTERN ]] || die "No earlier published release is recorded in $PREVIOUS_FILE."
fi
github() {
  curl --fail --silent --show-error --location --connect-timeout 10 --max-time 60 --retry 2 --retry-delay 5 \
    --header 'Accept: application/vnd.github+json' --header 'User-Agent: sworg-self-host-updater' "$@"
}
api="https://api.github.com/repos/$SWO_REPOSITORY/releases"
if [[ -n "$REQUESTED_VERSION" ]]; then
  release_json="$(github "$api/tags/v$REQUESTED_VERSION")" || die "v$REQUESTED_VERSION is not a release of $SWO_REPOSITORY."
else
  release_json="$(github "$api/latest")" || die "$SWO_REPOSITORY has no published release."
fi
grep -Eq '"draft"[[:space:]]*:[[:space:]]*false' <<< "$release_json" \
  && grep -Eq '"prerelease"[[:space:]]*:[[:space:]]*false' <<< "$release_json" \
  || die "Only published, non-prerelease main releases are deployed."
tag="$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' <<< "$release_json" | head -n 1)"
[[ "$tag" =~ $TAG_PATTERN ]] || die "Unexpected release tag: ${tag:-<empty>}."
version="${tag#v}"
if [[ "$current" == "$version" ]]; then
  say "$version is already installed."
  exit 0
fi

# Every update runs the target release's own updater and host files: stage it and hand over.
if [[ "${SWO_UPDATE_STAGED:-0}" != 1 ]]; then
  stage="$(mktemp -d "${TMPDIR:-/tmp}/.sworg-stage.XXXXXX")"
  say "Downloading $tag into temporary storage."
  github "https://github.com/$SWO_REPOSITORY/archive/refs/tags/$tag.tar.gz" | tar -xz -C "$stage" --strip-components=1 --no-same-owner \
    || { rm -rf -- "$stage"; die "Could not download $tag."; }
  [[ -f "$stage/scripts/update.sh" ]] || { rm -rf -- "$stage"; die "$tag has no updater."; }
  release_update_lock
  exec 8>&-
  trap - EXIT
  [[ "$ROLLBACK" == 0 ]] || ARGUMENTS=(--version "$version")
  if [[ "$ROLLBACK" == 1 ]]; then
    # An older release's updater doesn't know this release's services, so this one removes them afterwards.
    status=0
    env SWO_UPDATE_STAGED=1 SWO_UPDATE_STAGE_DIR="$stage" SWO_ROLLBACK="$ROLLBACK" \
      bash "$stage/scripts/update.sh" ${ARGUMENTS[@]+"${ARGUMENTS[@]}"} || status=$?
    [[ "$status" != 0 ]] || remove_undefined_services
    rm -rf -- "$stage"
    exit "$status"
  fi
  exec env SWO_UPDATE_STAGED=1 SWO_UPDATE_STAGE_DIR="$stage" SWO_ROLLBACK="$ROLLBACK" \
    bash "$stage/scripts/update.sh" ${ARGUMENTS[@]+"${ARGUMENTS[@]}"}
fi
ROLLBACK="${SWO_ROLLBACK:-$ROLLBACK}"

say "Updating ${current:-untracked installation} to $version."
mkdir -p "$ROOT/backups"
chmod 700 "$ROOT/backups"
"${COMPOSE[@]}" up -d --wait db
backup_name="pre-update-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
say "Creating database backup backups/$backup_name."
# The database container trusts its local socket for administrators only.
"${COMPOSE[@]}" exec -T db pg_dump -U sworg -d sworg | gzip > "$ROOT/backups/$backup_name.partial" \
  && [[ "$(gzip -dc "$ROOT/backups/$backup_name.partial" | head -c 1 | wc -c | tr -d " ")" == 1 ]] \
  || { rm -f "$ROOT/backups/$backup_name.partial"; die "Database backup failed; update cancelled."; }
chmod 600 "$ROOT/backups/$backup_name.partial"
mv "$ROOT/backups/$backup_name.partial" "$ROOT/backups/$backup_name"
export SWO_IMAGE_TAG="$version"

# Check the new backend image exists before replacing any host file.
docker pull --quiet "$SWO_BACKEND_IMAGE:$version" >/dev/null || die "Cannot pull $SWO_BACKEND_IMAGE:$version; check that the packages are public."
host_configuration_started=1
install_staged_host_bundle "$(cd "$UPDATE_SCRIPT_DIR/.." && pwd)"
say "Pulling immutable release images."
"${COMPOSE[@]}" pull --quiet
deployment_started=1
if [[ "$ROLLBACK" == 1 ]]; then
  # Older migrations must never run against the newer schema.
  serving_services
  say "Rolling back to $version: replacing application containers only."
  "${COMPOSE[@]}" up -d --wait --wait-timeout 300 --no-deps "${SERVING_SERVICES[@]}" || die "Release $version did not become healthy."
else
  say "Running migrations and replacing application containers."
  "${COMPOSE[@]}" up -d --wait --wait-timeout 300 --remove-orphans || die "Release $version did not become healthy. The backup is backups/$backup_name."
  "${COMPOSE[@]}" run --rm ops || die "Release $version failed its operator checks. The backup is backups/$backup_name."
fi

[[ -z "$current" ]] || printf '%s\n' "$current" > "$PREVIOUS_FILE"
printf '%s\n' "$backup_name" > "$ROOT/.spaceworks-previous-backup"
printf '%s\n' "$version" > "$VERSION_FILE"
update_complete=1
find "$ROOT/backups" -maxdepth 1 -type f -name 'pre-update-*.sql.gz' -mtime +14 -delete
find "$ROOT/backups" -maxdepth 1 -type d -name 'host-config-*' -mtime +30 -exec rm -rf -- {} +
say "Update complete: $version."
if [[ "$ROLLBACK" == 1 ]]; then
  say "Database changes made by $current remain. To return the data too: bash scripts/restore.sh backups/${last_backup:-pre-update-<time>.sql.gz}"
fi
