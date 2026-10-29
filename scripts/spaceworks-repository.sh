#!/usr/bin/env bash
# Read only named configuration values; never execute the private .env as shell code.
repository_env_value() {
  local key="$1" value="" file="${SWO_STATIC_ENV_FILE:-$ROOT/.env}"
  if [[ -f "$file" ]]; then
    value="$(sed -n "s/^${key}=//p" "$file" | tail -n 1 | tr -d '\r')"
    if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then value="${value:1:${#value}-2}"; fi
  fi
  printf '%s' "$value"
}

configure_release_repository() {
  local owner key value
  SWO_REPOSITORY="${SWO_REPOSITORY:-$(repository_env_value SWO_REPOSITORY)}"
  SWO_REPOSITORY="${SWO_REPOSITORY:-SpaceWorks-Labs/SpaceWorks-Organization}"
  [[ "$SWO_REPOSITORY" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$ ]] \
    && [[ "$SWO_REPOSITORY" != */. && "$SWO_REPOSITORY" != */.. ]] || {
    printf 'ERROR: SWO_REPOSITORY must be a GitHub owner/repo name.\n' >&2
    return 1
  }
  owner="$(printf '%s' "${SWO_REPOSITORY%%/*}" | tr '[:upper:]' '[:lower:]')"
  for key in SWO_BACKEND_IMAGE SWO_FRONTEND_IMAGE; do
    value="${!key:-$(repository_env_value "$key")}"
    if [[ -z "$value" ]]; then
      case "$key" in
        SWO_BACKEND_IMAGE) value="ghcr.io/$owner/spaceworks-organization-backend" ;;
        SWO_FRONTEND_IMAGE) value="ghcr.io/$owner/spaceworks-organization-frontend" ;;
      esac
    fi
    export "$key=$value"
  done
  export SWO_REPOSITORY
}

# The bundled services that serve requests, as this installation's compose file defines them
# (a rollback can restore a release before 0.8, which ran a scheduler instead of worker and beat).
serving_services() {
  local defined service
  defined="$("${COMPOSE[@]}" config --services 2>/dev/null || true)"
  SERVING_SERVICES=(backend)
  for service in worker beat scheduler; do
    grep -qx "$service" <<< "$defined" && SERVING_SERVICES+=("$service")
  done
  [[ "$(repository_env_value SWO_LAYER)" == proxy ]] || SERVING_SERVICES+=(caddy)
}

# After a rollback, stop the background services the restored Compose files no longer define (worker and beat
# when going back before 0.8, the scheduler going the other way), so no newer code keeps running beside the old.
remove_undefined_services() {
  local defined service id
  defined="$("${COMPOSE[@]}" config --services 2>/dev/null || true)"
  [[ -n "$defined" ]] || return 0
  for service in worker beat scheduler; do
    grep -qx "$service" <<< "$defined" && continue
    while read -r id; do
      [[ -z "$id" ]] || docker rm -f "$id" >/dev/null
    done < <(docker ps -aq --filter "label=com.docker.compose.project=${SWO_COMPOSE_PROJECT:-sworg}" --filter "label=com.docker.compose.service=$service")
  done
}
