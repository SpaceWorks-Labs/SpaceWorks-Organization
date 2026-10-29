#!/usr/bin/env bash
# Send an encrypted copy of this installation off the server, to the bucket set up in the installer
# menu (Backups). A nightly timer (sworg-offsite-backup.timer) runs it.
#   bash scripts/vps-offsite-backup.sh               copy now
#   bash scripts/vps-offsite-backup.sh --fetch NAME  download copy NAME into backups/offsite/NAME/
# A copy is a folder named after its UTC time holding database.sql.gz.age (a fresh dump),
# settings.tar.gz.age (.env, tls/ and backup.env) and, with bundled Silo, storage.tar.age (the
# bucket mirror). Each is encrypted to BACKUP_AGE_RECIPIENT on the way out; nothing unencrypted
# leaves the server and only the private key kept off it opens them. Local backups/ are unchanged.
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/scripts/vps-offsite-backup.sh" "$@"
# shellcheck source=scripts/vps-lib.sh
source "$ROOT/scripts/vps-lib.sh"
require_install
usage() { die 'Usage: bash scripts/vps-offsite-backup.sh [--fetch YYYYMMDDTHHMMSSZ]'; }
fetch=''
case "${1:-}" in
  '') (($# == 0)) || usage ;;
  --fetch) [[ $# == 2 && "$2" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || usage; fetch="$2" ;;
  *) usage ;;
esac
[[ -n "$(conf_get "$BACKUP_SETTINGS" OFFSITE_BUCKET)" ]] || die 'Off-site copies are not set up. Use the installer menu: Backups.'
backups="$(backup_dir)"
image="$(silo_image)"
umask 077

if [[ -n "$fetch" ]]; then
  mkdir -p "$backups/offsite/$fetch"
  run_mc --volume "$backups/offsite/$fetch:/out" "$image" mirror --quiet "$(offsite_path)/$fetch" /out >/dev/null \
    || die "Could not download $fetch from the off-site bucket."
  say "Downloaded to $backups/offsite/$fetch. Decrypt with the key you saved, for example:"
  say "  age -d -i key.txt database.sql.gz.age > $backups/offsite-$fetch.sql.gz"
  say "Then: bash scripts/restore.sh backups/offsite-$fetch.sql.gz (see docs/DEPLOYMENT_VPS.md)."
  exit 0
fi

recipient="$(conf_get "$BACKUP_SETTINGS" BACKUP_AGE_RECIPIENT)"
[[ -n "$recipient" ]] || die 'Off-site copies are sent encrypted only. Turn on encryption in the installer menu (Backups).'
command -v age >/dev/null 2>&1 || die 'age is not installed. Install the "age" package, then retry.'
take_lock
name="$(date -u +%Y%m%dT%H%M%SZ)"
status_file="$backups/offsite-status"
mkdir -p "$backups"
work="$(mktemp -d "$backups/.offsite.XXXXXX")"
on_exit() {
  local status=$?
  rm -rf -- "$work"
  if [[ $status != 0 ]]; then printf 'failed %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$name" > "$status_file"; fi
  exit "$status"
}
trap on_exit EXIT
encrypt() { age --encrypt --recipient "$recipient"; }

say "Encrypting copy $name."
compose up -d --wait db >/dev/null
# The database container trusts its local socket for administrators only.
compose exec db pg_dump -U sworg -d sworg | gzip | encrypt > "$work/database.sql.gz.age"
settings=(-C "$(dirname "$ENV_FILE")" "$(basename "$ENV_FILE")" -C "$(dirname "$(tls_dir)")" "$(basename "$(tls_dir)")")
[[ ! -f "$BACKUP_SETTINGS" ]] || settings+=(-C "$ROOT" backup.env)
[[ ! -f "$ROOT/offsite-ca.crt" ]] || settings+=(-C "$ROOT" offsite-ca.crt)
tar -czf - "${settings[@]}" | encrypt > "$work/settings.tar.gz.age"
if [[ "$(conf_get "$ENV_FILE" SWO_STORAGE)" != external ]]; then
  # The mirror belongs to the backup containers, so a container reads it out.
  compose run --rm --no-deps backup-storage storage >/dev/null
  compose run --rm --no-deps --entrypoint tar backup -cf - -C /backups storage | encrypt > "$work/storage.tar.age"
fi

say "Copying $name to the off-site bucket $(conf_get "$BACKUP_SETTINGS" OFFSITE_BUCKET)."
run_mc --volume "$work:/backup:ro" "$image" mirror --quiet /backup "$(offsite_path)/$name" >/dev/null
run_mc "$image" stat "$(offsite_path)/$name/database.sql.gz.age" >/dev/null
keep="$(conf_get "$BACKUP_SETTINGS" OFFSITE_KEEP_DAYS)"
if is_days "${keep:-}"; then
  run_mc "$image" rm --recursive --force --older-than "${keep}d" "$(offsite_path)/" >/dev/null \
    || warn 'Old off-site copies could not be pruned.'
fi
printf 'ok %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$name" > "$status_file"
say "Off-site copy $name is stored and encrypted."
