#!/usr/bin/env bash
# Backup settings, from the installer menu (Backups):
#   - how often the backup service dumps the database and mirrors the bucket (BACKUP_INTERVAL_HOURS)
#     and how many days the scheduled dumps stay in backups/ (BACKUP_RETENTION_DAYS), both in .env;
#   - an age encryption key whose private half is kept off this server, and nightly encrypted
#     off-site copies to an S3-compatible bucket (scripts/vps-offsite-backup.sh), in backup.env.
# shellcheck disable=SC2154 # ask assigns answers by name
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/scripts/vps-backup-settings.sh" "$@"
# shellcheck source=scripts/vps-lib.sh
source "$ROOT/scripts/vps-lib.sh"
require_tty
require_install
( umask 077; touch "$BACKUP_SETTINGS" )
chmod 600 "$BACKUP_SETTINGS"
image="$(silo_image)"

apply_env_change() {
  take_lock
  say 'Restarting the services that read it.'
  compose up -d --wait --wait-timeout 300 >/dev/null || die 'The services did not become healthy. Check them with option 4 (status).'
}

while true; do
  hours="$(conf_get "$ENV_FILE" BACKUP_INTERVAL_HOURS)"; hours="${hours:-24}"
  days="$(conf_get "$ENV_FILE" BACKUP_RETENTION_DAYS)"; days="${days:-14}"
  recipient="$(conf_get "$BACKUP_SETTINGS" BACKUP_AGE_RECIPIENT)"
  bucket="$(conf_get "$BACKUP_SETTINGS" OFFSITE_BUCKET)"
  if [[ -n "$recipient" ]]; then encryption="on ($recipient)"; else encryption='off'; fi
  if [[ -z "$bucket" ]]; then offsite='off'
  else
    offsite="$bucket/$(conf_get "$BACKUP_SETTINGS" OFFSITE_PREFIX), kept $(conf_get "$BACKUP_SETTINGS" OFFSITE_KEEP_DAYS) days"
    if timer_enabled offsite-backup; then offsite+=', every night at about 03:30 UTC'; else offsite+=', not scheduled'; fi
  fi
  last="$(cat "$(backup_dir)/offsite-status" 2>/dev/null || true)"
  cat >/dev/tty <<EOF

Backups
  On this server:   database every $hours hours, kept $days days, in $(backup_dir)
  Encryption:       $encryption
  Off-site copies:  $offsite${last:+ (last: $last)}

  1) Change how often the database is backed up
  2) Change how many days scheduled backups stay on this server
  3) $([[ -n "$recipient" ]] && echo 'Make a new encryption key, or turn encryption off' || echo 'Turn on encryption (shows a new key once)')
  4) $([[ -n "$bucket" ]] && echo 'Change or turn off off-site copies' || echo 'Set up nightly off-site copies (needs encryption)')
  5) Send an off-site copy now
  6) List off-site copies
  7) Done
EOF
  is_menu() { [[ "$1" =~ ^[1-7]$ ]]; }
  ask choice 'Choose 1-7' 7 is_menu 'Enter a number from 1 to 7.'
  case "$choice" in
    1)
      ask hours 'Hours between database backups (24 = daily)' "$hours" is_hours 'Enter a number of hours from 1 to 168.'
      conf_set "$ENV_FILE" BACKUP_INTERVAL_HOURS "$hours"
      apply_env_change
      say "The database is backed up every $hours hours." ;;
    2)
      ask days 'Days to keep scheduled backups on this server' "$days" is_days 'Enter a number of days.'
      conf_set "$ENV_FILE" BACKUP_RETENTION_DAYS "$days"
      apply_env_change
      say "Scheduled backups stay $days days." ;;
    3)
      if [[ -n "$recipient" ]] && confirm 'Turn encryption off?' N; then
        [[ -z "$bucket" ]] || { warn 'Turn off off-site copies first: they are only sent encrypted.'; continue; }
        conf_unset "$BACKUP_SETTINGS" BACKUP_AGE_RECIPIENT
        say 'Encryption is off.'
      elif [[ -z "$recipient" ]] || confirm 'Make a new key? Copies already sent still need the previous key.' N; then
        ensure_age || die 'age could not be installed from the distribution packages. Install "age", then retry.'
        new_backup_key
        say 'Encryption is on. Restoring an off-site copy needs the key you saved.'
      fi ;;
    4)
      if [[ -n "$bucket" ]] && confirm 'Turn off off-site copies?' N; then
        remove_timer offsite-backup
        clear_offsite
        say 'Off-site copies are off. Copies already in the bucket stay there.'
        continue
      fi
      [[ -n "$recipient" ]] || { warn 'Turn on encryption first: off-site copies are only sent encrypted.'; continue; }
      command -v age >/dev/null 2>&1 || ensure_age || die 'age could not be installed. Install "age", then retry.'
      ask_offsite
      cp -p "$BACKUP_SETTINGS" "$BACKUP_SETTINGS.previous"
      save_offsite
      unset offsite_secret
      say 'Checking that the bucket is reachable with that key.'
      if run_mc "$image" ls "offsite/$offsite_bucket" >/dev/null; then
        rm -f -- "$BACKUP_SETTINGS.previous"
        if has_systemd; then
          install_timer offsite-backup 'nightly encrypted off-site copy' '*-*-* 03:30:00 UTC' vps-offsite-backup.sh
          say 'Off-site copies are on: every night at about 03:30 UTC. Option 5 sends one now.'
        else
          say 'Off-site copies are set up. Without systemd, run scripts/vps-offsite-backup.sh from cron.'
        fi
      else
        mv -f -- "$BACKUP_SETTINGS.previous" "$BACKUP_SETTINGS"
        warn 'The bucket could not be reached with that key. Nothing was changed.'
      fi ;;
    5)
      [[ -n "$bucket" ]] || { warn 'Off-site copies are not set up.'; continue; }
      bash "$ROOT/scripts/vps-offsite-backup.sh" || warn 'The off-site copy failed; see the messages above.' ;;
    6)
      [[ -n "$bucket" ]] || { warn 'Off-site copies are not set up.'; continue; }
      run_mc "$image" ls "$(offsite_path)/" || warn 'The off-site bucket could not be listed.'
      printf 'Download one with: bash scripts/vps-offsite-backup.sh --fetch <name>\n' >/dev/tty ;;
    7) exit 0 ;;
  esac
done
