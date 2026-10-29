#!/usr/bin/env bash
# Status and health, from the installer menu: the release, every long-running service (backend,
# worker, beat, PostgreSQL, Redis, Silo, Caddy, backups), disk, the newest backups, certificates,
# timers, the public address, then the operator checks (the ops role: TLS, roles, migrations,
# Redis, the bucket, readiness, and the worker's and beat's /health). Changes nothing.
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/scripts/vps-status.sh" "$@"
# shellcheck source=scripts/vps-lib.sh
source "$ROOT/scripts/vps-lib.sh"
require_install
failed=0
line() { printf '  %-22s %s\n' "$1" "$2"; }

origin="$(conf_get "$ENV_FILE" PUBLIC_APP_BASE_URL)"
printf '\nSpace Works Organization\n'
line Release "$(cat "$ROOT/.spaceworks-version" 2>/dev/null || echo 'built from source') at $origin"
line 'Previous release' "$(cat "$ROOT/.spaceworks-previous-version" 2>/dev/null || echo none)"
disk() { df -Pm "$1" 2>/dev/null | awk 'NR == 2 { print $4 " MB free" }'; }
line 'Disk (install)' "$(disk "$ROOT")"
docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || true)"
[[ -z "$docker_root" ]] || line 'Disk (Docker)' "$(disk "$docker_root" || true)"

backups="$(backup_dir)"
newest() {
  find "$backups" -maxdepth 1 -type f -name "$1" -printf '%T@ %f\n' 2>/dev/null | sort -n | tail -n 1 | cut -d' ' -f2
}
scheduled="$(newest 'scheduled-*.sql.gz')"
line 'Newest scheduled dump' "${scheduled:-none yet}"
any="$(newest '*.sql.gz')"
[[ -z "$any" || "$any" == "$scheduled" ]] || line 'Newest dump' "$any"
hours="$(conf_get "$ENV_FILE" BACKUP_INTERVAL_HOURS)"
is_hours "${hours:-}" || hours=24
if [[ -n "$scheduled" && -n "$(find "$backups/$scheduled" -mmin +$((hours * 60 + 120)) 2>/dev/null)" ]]; then
  warn 'The newest scheduled dump is older than its interval; see scripts/spaceworks-compose.sh bundled logs backup'
  failed=1
fi
if [[ -n "$(conf_get "$BACKUP_SETTINGS" OFFSITE_BUCKET)" ]]; then
  line 'Off-site copies' "$(cat "$backups/offsite-status" 2>/dev/null || echo 'none sent yet')"
  grep -q '^ok ' "$backups/offsite-status" 2>/dev/null || failed=1
else
  line 'Off-site copies' 'off (installer menu: Backups)'
fi
for name in offsite-backup certificates; do
  if timer_enabled "$name"; then state=on; elif has_systemd; then state=off; else state='no systemd'; fi
  line "Timer $name" "$state"
done
line 'Automatic deploys' "$([[ -f "${SWO_RUNNER_DIR:-/opt/spaceworks-organization-runner}/.runner" ]] && echo 'runner installed' || echo off)"
tls="$(tls_dir)"
if [[ -s "$tls/db/public.crt" ]]; then
  expiry="$(MSYS_NO_PATHCONV=1 docker run --rm --network none --user "$(id -u):$(id -g)" -v "$tls:/tls:ro" \
    --entrypoint openssl "$(backend_image)" x509 -enddate -noout -in /tls/db/public.crt 2>/dev/null || true)"
  line 'Internal certificates' "${expiry#notAfter=}"
fi

printf '\nServices\n'
mapfile -t expected < <(compose config --services 2>/dev/null | grep -vxE 'createbuckets|migrate|ops' || true)
states="$(compose ps --all --format '{{.Service}} {{.State}} {{.Health}}' 2>/dev/null || true)"
for service in "${expected[@]}"; do
  read -r _ state health <<< "$(grep -E "^$service " <<< "$states" | head -n 1 || true)"
  if [[ "${state:-}" == running && ( -z "${health:-}" || "$health" == healthy ) ]]; then
    printf '  ok    %-16s running%s\n' "$service" "${health:+, $health}"
  else
    printf '  FAIL  %-16s %s\n' "$service" "${state:-not created}${health:+, $health}"
    failed=1
  fi
done

if [[ "$(conf_get "$ENV_FILE" SWO_LAYER)" != proxy && "$(conf_get "$ENV_FILE" DEPLOYMENT_MODE)" != backend ]]; then
  if curl --fail --silent --show-error --max-time 15 --output /dev/null "$origin/api/health" 2>/dev/null; then
    printf '  ok    %-16s %s answers\n' 'web address' "$origin"
  else
    printf '  FAIL  %-16s %s does not answer (DNS, firewall or Caddy; see logs caddy)\n' 'web address' "$origin"
    failed=1
  fi
fi

printf '\nOperator checks\n'
compose run --rm ops || failed=1
((failed == 0)) || { warn 'Something needs attention: see FAIL above, and scripts/spaceworks-compose.sh bundled logs <service>.'; exit 1; }
say 'Everything is healthy.'
