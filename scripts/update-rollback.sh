#!/usr/bin/env bash
# shellcheck disable=SC2154 # variables are set by update.sh, which sources this file
# Failed image deployment leaves forward migrations in place; never restore data here.
rollback_application_images() {
  [[ "$previous_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+-(main|dev)\.[0-9]+\.[0-9a-f]{12}$ || "$previous_version" == local ]] || return 0
  say "Update failed; rolling application containers back to $previous_version."
  restore_host_bundle
  export SWO_IMAGE_TAG="$previous_version"
  printf '%s\n' "$previous_version" > "$VERSION_FILE" || \
    say "WARNING: could not reset $VERSION_FILE to $previous_version."
  serving_services
  "${COMPOSE[@]}" pull --quiet "${SERVING_SERVICES[@]}" || \
    say "Could not refresh previous images; trying the host's cached copies."
  # --no-deps prevents old migrations from being applied to the forward schema.
  if "${COMPOSE[@]}" up -d --wait --wait-timeout 300 --no-deps "${SERVING_SERVICES[@]}"; then
    say "Rollback complete: $previous_version is healthy."
    say "Database changes remain; backup retained at backups/${backup_name:-<none>}."
  else
    say "ERROR: automatic rollback to $previous_version failed."
    say "Restore backups/${backup_name:-<the pre-update dump>} with scripts/restore.sh and the previous image tag manually."
  fi
}
