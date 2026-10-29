#!/usr/bin/env bash
# Collect a support bundle, from the installer menu: versions, settings without secrets, timers,
# service state, the operator checks, disk and memory, and the last 500 log lines of each service,
# with credentials, tokens and keys redacted. Logs can still hold email and IP addresses: read the
# bundle before sharing it. Written to support/ in the install, readable by its owner only.
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/scripts/vps-support.sh" "$@"
# shellcheck source=scripts/vps-lib.sh
source "$ROOT/scripts/vps-lib.sh"
require_install
umask 077
name="sworg-support-$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf -- "$work"' EXIT
out="$work/$name"
mkdir -p "$out/logs"

redact() {
  sed -E \
    -e 's#(://)[^/@[:space:]]+@#\1REDACTED@#g' \
    -e 's#((password|passwd|secret|token|key|authorization|cookie)[^=:[:space:]]*[=:][[:space:]]*)[^[:space:],"&]+#\1REDACTED#Ig' \
    -e 's#(Bearer )[A-Za-z0-9._~+/=-]+#\1REDACTED#g' \
    -e 's#AGE-SECRET-KEY-[A-Z0-9]+#REDACTED#g' \
    -e 's#[A-Za-z0-9+/]{43}=|[a-f0-9]{64,}#REDACTED#g'
}
# Only settings that are never secret show their value; every other key shows as set.
settings() {
  local key
  while IFS='=' read -r key _; do
    [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || continue
    case "$key" in
      SWO_REPOSITORY|SWO_BACKEND_IMAGE|SWO_FRONTEND_IMAGE|SWO_LAYER|SWO_STORAGE|PUBLIC_APP_BASE_URL|SITE_ADDRESS|\
      DEPLOYMENT_MODE|ALLOW_PLAIN_HTTP|HTTP_PORT|SMTP_HOST|SMTP_PORT|SMTP_SECURE|S3_ENDPOINT|S3_REGION|S3_BUCKET|\
      BACKUP_INTERVAL_HOURS|BACKUP_RETENTION_DAYS|SILO_IMAGE_TAG|OFFSITE_ENDPOINT|OFFSITE_BUCKET|OFFSITE_PREFIX|OFFSITE_KEEP_DAYS)
        printf '%s=%s\n' "$key" "$(conf_get "$1" "$key")" ;;
      *) printf '%s is set\n' "$key" ;;
    esac
  done < "$1"
}
section() { printf '\n== %s\n' "$1"; }

say 'Collecting the support bundle.'
{
  section 'Release'; cat "$ROOT/.spaceworks-version" 2>/dev/null || echo 'no version marker'
  section 'Previous release'; cat "$ROOT/.spaceworks-previous-version" 2>/dev/null || echo none
  section 'Settings (no secrets)'; settings "$ENV_FILE"
  section 'Backup settings (no secrets)'; [[ ! -f "$BACKUP_SETTINGS" ]] || settings "$BACKUP_SETTINGS"
  section 'Backups'; ls -la "$(backup_dir)" 2>&1 || true
  section 'Off-site status'; cat "$(backup_dir)/offsite-status" 2>/dev/null || echo none
  section 'Timers'; systemctl list-timers 'sworg-*' --all --no-pager 2>/dev/null || echo 'no systemd'
  section 'System'; cat /etc/os-release 2>/dev/null || true; uname -a; uptime 2>/dev/null || true
  section 'Memory'; free -m 2>/dev/null || true
  section 'Disk'; df -h "$ROOT" / 2>/dev/null || df -h
  section 'Docker'; docker version 2>&1 || true; docker compose version 2>&1 || true
  section 'Services'; compose ps --all 2>&1 || true
  section 'Operator checks'; compose run --rm ops 2>&1 || true
} 2>&1 | redact > "$out/report.txt"
for service in $(compose config --services 2>/dev/null || true); do
  compose logs --no-color --tail 500 "$service" 2>&1 | redact > "$out/logs/$service.log" || true
  [[ -s "$out/logs/$service.log" ]] || rm -f -- "$out/logs/$service.log"
done
mkdir -p "$ROOT/support"
chmod 700 "$ROOT/support"
tar -czf "$ROOT/support/$name.tar.gz" -C "$work" "$name"
say "Support bundle: $ROOT/support/$name.tar.gz"
say 'Credentials, tokens and keys are redacted, but logs can hold email and IP addresses. Read it before sharing.'
