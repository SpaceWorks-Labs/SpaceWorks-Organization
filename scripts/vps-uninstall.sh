#!/usr/bin/env bash
# Remove Space Works Organization from this server, from the installer menu: the containers, the
# systemd timers, the automatic-deploy runner registration, the images and the release files.
# Kept unless the operator types DELETE DATA: the data volumes (database, Redis, bundled storage),
# and .env, tls/, backup.env and backups/ (after a final backup), moved to <install>.kept-<time>.
# Docker and any server hardening stay.
# shellcheck disable=SC2154 # ask assigns answers by name
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/scripts/vps-uninstall.sh" "$@"
# shellcheck source=scripts/vps-lib.sh
source "$ROOT/scripts/vps-lib.sh"
require_tty
require_install
[[ "$ROOT" == /?* && "$ROOT" != / && -f "$ROOT/docker-compose.prod.yml" ]] || die "$ROOT does not look like an installation."
kept="$ROOT.kept-$(date -u +%Y%m%dT%H%M%SZ)"
cat >/dev/tty <<EOF

Uninstall Space Works Organization ($(conf_get "$ENV_FILE" PUBLIC_APP_BASE_URL))
  Removed: the containers, systemd timers, the runner registration, images and $ROOT
  Kept unless you choose otherwise next: the data volumes (database, uploads), and .env, tls/,
  backup.env and backups/ (with a final backup), moved to $kept
EOF
is_word() { [[ -n "$1" ]]; }
ask answer 'Type UNINSTALL to continue' '' is_word
[[ "$answer" == UNINSTALL ]] || { say 'Cancelled. Nothing was changed.'; exit 2; }
cat >/dev/tty <<EOF

Also delete all data? This permanently erases the database, the uploads in the bundled storage,
the settings with every secret and every backup in $(backup_dir).
Copy any backup you need off this server first.
EOF
ask answer 'Type DELETE DATA to erase it, or press Enter to keep it' keep is_word
delete_data=0
[[ "$answer" != 'DELETE DATA' ]] || delete_data=1
take_lock

if [[ $delete_data == 0 ]]; then
  say 'Taking a final backup.'
  bash "$ROOT/scripts/backup.sh" || die 'The final backup failed; nothing was removed.'
fi
runner_dir="${SWO_RUNNER_DIR:-/opt/spaceworks-organization-runner}"
if [[ -f "$runner_dir/.runner" ]]; then
  bash "$ROOT/scripts/install-runner.sh" --remove </dev/tty \
    || warn 'Remove the runner in GitHub (Settings -> Actions -> Runners) by hand.'
fi
remove_timer offsite-backup
remove_timer certificates
images="$(compose config --images 2>/dev/null | grep -E 'spaceworks-organization-(backend|frontend)' | sort -u || true)"
if [[ $delete_data == 1 ]]; then
  compose down --volumes --remove-orphans
else
  compose down --remove-orphans
fi
# shellcheck disable=SC2086 # one image name per word
[[ -z "$images" ]] || docker image rm $images >/dev/null 2>&1 || true

if [[ $delete_data == 0 ]]; then
  as_root mkdir -m 700 -- "$kept"
  for item in "$ENV_FILE" "$(tls_dir)" "$BACKUP_SETTINGS" "$ROOT/offsite-ca.crt" "$ROOT/.spaceworks-version" "$(backup_dir)"; do
    [[ ! -e "$item" ]] || as_root mv -- "$item" "$kept/"
  done
  as_root chown "$(stat -c %u:%g "$ROOT")" "$kept"
fi
as_root rm -rf -- "$ROOT"
say 'Space Works Organization is uninstalled. Docker and any server hardening were left in place.'
if [[ $delete_data == 0 ]]; then
  say "The data volumes (sworg_*) and the settings, certificates and backups in $kept were kept."
  say 'To run it again with them, see "Reinstall after uninstalling" in docs/DEPLOYMENT_VPS.md.'
fi
