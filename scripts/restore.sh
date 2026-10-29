#!/usr/bin/env bash
# Restore the database from a dump in backups/ (and, with --with-storage, the files
# from backups/storage). This replaces live data: the backend, worker, beat and web
# edge stop until it finishes, and a fresh database backup is taken first.
#   bash scripts/restore.sh backups/<name>.sql.gz [--with-storage] [--yes]
# Migrations then bring an older dump up to the running release.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SWO_UPDATE_INSTALL_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
# shellcheck source=scripts/install-owner.sh
source "$SCRIPT_DIR/install-owner.sh"
require_install_owner "$SCRIPT_DIR/restore.sh" "$@"
# shellcheck source=scripts/spaceworks-repository.sh
source "$SCRIPT_DIR/spaceworks-repository.sh"
say() { printf '[Space Works restore] %s\n' "$*"; }
warn() { printf '[Space Works restore] WARNING: %s\n' "$*" >&2; }
die() { printf '[Space Works restore] ERROR: %s\n' "$*" >&2; exit 1; }
COMPOSE=("$SCRIPT_DIR/spaceworks-compose.sh" bundled)
dump='' with_storage=0 assume_yes=0
for argument in "$@"; do
  case "$argument" in
    --with-storage) with_storage=1 ;;
    --yes) assume_yes=1 ;;
    -*) die 'Usage: bash scripts/restore.sh backups/<name>.sql.gz [--with-storage] [--yes]' ;;
    *) dump="$argument" ;;
  esac
done
backups="${SWO_BACKUP_DIR:-$ROOT/backups}"
name="$(basename "${dump:-}")"
[[ "$name" =~ ^[a-z][a-z0-9-]*-[0-9]{8}T[0-9]{6}Z\.sql\.gz$ && -s "$backups/$name" ]] \
  || die "Choose a dump made by scripts/backup.sh or the backup service, inside $backups."
[[ "$with_storage" == 0 || "$(repository_env_value SWO_STORAGE)" != external ]] \
  || die 'Files in an external bucket are restored with your storage provider.'
if [[ "$assume_yes" == 0 ]]; then
  [[ -r /dev/tty ]] || die 'An interactive terminal is required (or pass --yes).'
  printf '\nRestore %s%s\nThe site is offline during the restore. A backup of the current database is taken first.\n' \
    "$name" "$([[ "$with_storage" == 1 ]] && echo ' and backups/storage' || true)" >/dev/tty
  printf 'Type RESTORE to continue: ' >/dev/tty
  IFS= read -r answer </dev/tty || answer=''
  [[ "${answer%$'\r'}" == RESTORE ]] || { say 'Cancelled. Nothing was changed.'; exit 2; }
fi
bash "$SCRIPT_DIR/backup.sh" --prefix pre-restore --no-storage
stopped=0
restart_on_failure() {
  local status=$?
  [[ $status != 0 && $stopped == 1 ]] || return 0
  warn 'The restore failed; starting the services again.'
  "${COMPOSE[@]}" up -d >/dev/null 2>&1 || warn 'Start them with scripts/spaceworks-compose.sh bundled up -d.'
  exit "$status"
}
trap restart_on_failure EXIT
stopped=1
serving_services
"${COMPOSE[@]}" stop "${SERVING_SERVICES[@]}" backup
"${COMPOSE[@]}" run --rm --no-deps -T backup restore "$name"
if [[ "$with_storage" == 1 ]]; then
  "${COMPOSE[@]}" run --rm --no-deps -T backup-storage restore-storage
fi
"${COMPOSE[@]}" up -d --wait --wait-timeout 300
stopped=0
say 'Restore finished. Sign in and check recent members, payments and uploads.'
