#!/usr/bin/env bash
# Back up the bundled stack now, while it keeps running, into backups/:
#   bash scripts/backup.sh [--prefix NAME] [--no-storage]
# a gzipped SQL dump of the database, a mirror of the private bucket (bundled
# Silo only) and an owner-only archive of .env, tls/ and backup.env. Scheduled backups run
# in the backup and backup-storage services (deploy/backup.sh).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SWO_UPDATE_INSTALL_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
# shellcheck source=scripts/install-owner.sh
source "$SCRIPT_DIR/install-owner.sh"
require_install_owner "$SCRIPT_DIR/backup.sh" "$@"
# shellcheck source=scripts/spaceworks-repository.sh
source "$SCRIPT_DIR/spaceworks-repository.sh"
say() { printf '[Space Works backup] %s\n' "$*"; }
die() { printf '[Space Works backup] ERROR: %s\n' "$*" >&2; exit 1; }
COMPOSE=("$SCRIPT_DIR/spaceworks-compose.sh" bundled)
prefix=manual storage=1
while (($# > 0)); do
  case "$1" in
    --prefix) shift; [[ "${1:-}" =~ ^[a-z][a-z0-9-]{0,30}$ ]] || die '--prefix needs a short lowercase name.'; prefix="$1" ;;
    --no-storage) storage=0 ;;
    *) die 'Usage: bash scripts/backup.sh [--prefix NAME] [--no-storage]' ;;
  esac
  shift
done
[[ -f "${SWO_STATIC_ENV_FILE:-$ROOT/.env}" ]] || die "No installation settings in $ROOT/.env."
backups="${SWO_BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$backups"
chmod 700 "$backups"
"${COMPOSE[@]}" up -d --wait db >/dev/null
"${COMPOSE[@]}" run --rm --no-deps -T backup database "$prefix" || die 'Database backup failed.'
if [[ "$storage" == 1 && "$(repository_env_value SWO_STORAGE)" != external ]]; then
  "${COMPOSE[@]}" run --rm --no-deps -T backup-storage storage || die 'Storage backup failed.'
fi
if [[ "$prefix" == manual ]]; then
  archive="$backups/config-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
  settings=(.env tls)
  [[ ! -f "$ROOT/backup.env" ]] || settings+=(backup.env)
  (umask 077; tar -czf "$archive" -C "$ROOT" "${settings[@]}")
  say "Settings and certificates: $archive"
fi
say 'Backups contain every secret. Copy them off this server, encrypted.'
