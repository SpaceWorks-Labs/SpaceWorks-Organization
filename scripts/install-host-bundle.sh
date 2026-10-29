#!/usr/bin/env bash
# A pinned installer stages new host tooling separately from private installation state.
# Copy only the runtime bundle; preserve every replaced file for the rollback path.
HOST_BUNDLE_FILES=(
  setup.sh install.sh setup.ps1 render.yaml .env.production.example
  docker-compose.prod.yml docker-compose.cloud.yml
  docker/compose.build.yml docker/compose.tls.yml docker/compose.proxy.yml docker/compose.external-storage.yml
  deploy/Caddyfile deploy/backup.sh deploy/certificates.sh deploy/createbuckets.sh deploy/init-database.sh
  deploy/pg_hba.conf deploy/postgres-start.sh deploy/redis-start.sh deploy/storage-policy.json
  scripts/admin.sh scripts/backup.sh scripts/install-host-bundle.sh scripts/install-owner.sh scripts/install-runner.sh
  scripts/restore.sh scripts/runner-release.py scripts/setup-first-run.sh scripts/setup-question-input.sh
  scripts/setup-questions.sh scripts/setup-write-environment.sh scripts/spaceworks-compose.sh
  scripts/spaceworks-repository.sh scripts/update-lock.sh scripts/update-rollback.sh scripts/update.sh
  scripts/vps-lib.sh scripts/vps-offsite-lib.sh scripts/vps-status.sh scripts/vps-backup-settings.sh
  scripts/vps-offsite-backup.sh scripts/vps-reconfigure.sh scripts/vps-harden.sh scripts/vps-recover.sh
  scripts/vps-support.sh scripts/vps-uninstall.sh scripts/vps-renew-certs.sh
)

install_staged_host_bundle() {
  local source_root="$1" destination backup relative temporary
  [[ "$source_root" != "$ROOT" ]] || return 0
  backup="$ROOT/backups/host-config-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  HOST_CONFIG_BACKUP_DIR="$backup"
  # Refuse incomplete archives before replacing any file.
  for relative in "${HOST_BUNDLE_FILES[@]}"; do
    [[ -f "$source_root/$relative" ]] || die "The pinned archive lacks $relative."
  done
  mkdir -p "$ROOT/backups"
  chmod 700 "$ROOT/backups"
  for relative in "${HOST_BUNDLE_FILES[@]}"; do
    destination="$ROOT/$relative"
    mkdir -p "$(dirname "$destination")" "$(dirname "$backup/$relative")"
    [[ ! -f "$destination" ]] || cp -p "$destination" "$backup/$relative"
    temporary="$(mktemp "$(dirname "$destination")/.deploy-bundle.XXXXXX")"
    cp -p "$source_root/$relative" "$temporary"
    mv -f -- "$temporary" "$destination"
  done
  say "Installed pinned host runtime files; previous files are in $backup."
}

# Put back the files a failed update replaced (files new in that release stay; they are unused).
restore_host_bundle() {
  local relative
  [[ -n "${HOST_CONFIG_BACKUP_DIR:-}" && -d "$HOST_CONFIG_BACKUP_DIR" ]] || return 0
  for relative in "${HOST_BUNDLE_FILES[@]}"; do
    [[ ! -f "$HOST_CONFIG_BACKUP_DIR/$relative" ]] || cp -p "$HOST_CONFIG_BACKUP_DIR/$relative" "$ROOT/$relative"
  done
  say "Restored the previous host runtime files from $HOST_CONFIG_BACKUP_DIR."
}
