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

# The bundled services that serve requests, as this installation runs them.
serving_services() {
  SERVING_SERVICES=(backend scheduler)
  [[ "$(repository_env_value SWO_LAYER)" == proxy ]] || SERVING_SERVICES+=(caddy)
}
