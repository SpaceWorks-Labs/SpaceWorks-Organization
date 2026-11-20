#!/usr/bin/env bash
# Compose dotenv single quotes suppress interpolation of operator-provided secrets.
env_setting() {
  # Docker Compose and repository_env_value read single-quoted values literally (no escapes), so write the value as
  # it is. A value that can't be single-quoted (a quote or a line break) is refused rather than silently corrupted;
  # multi-line keys such as Apple's .p8 are written on one line with literal \n, which the app turns back into lines.
  local value="$2"
  if [[ "$value" == *\'* || "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    die "The value for $1 contains a quote or a line break, which the environment file can't hold. Enter it without them."
  fi
  printf "%s='%s'\n" "$1" "$value" >> "$SETUP_ENV_FILE"
}

write_setup_environment() {
  [[ "${ANSWERS_CONFIRMED:-}" == yes ]] || die 'Confirm the deployment questions first.'
  SETUP_ENV_FILE="${SWO_STATIC_ENV_FILE:-$ROOT/.env}"
  (umask 077; set -o noclobber; : > "$SETUP_ENV_FILE")
  chmod 600 "$SETUP_ENV_FILE"
  local scheme=https layer=none app_url
  [[ "$HTTPS_MODE" != 1 ]] || scheme=http
  [[ "$HTTPS_MODE" != 2 ]] || layer=tls
  [[ "$HTTPS_MODE" != 3 ]] || layer=proxy
  [[ "$HTTPS_MODE" != 4 ]] || layer=cloudflared
  app_url="$scheme://$WEBHOST"
  # Backend for a Netlify website: links, sign-in and Server Actions use the website's origin.
  [[ -z "$SITE_ORIGIN" ]] || app_url="$SITE_ORIGIN"
  configure_release_repository || die 'Invalid GitHub repository.'
  env_setting SWO_REPOSITORY "$SWO_REPOSITORY"
  env_setting SWO_BACKEND_IMAGE "$SWO_BACKEND_IMAGE"
  env_setting SWO_FRONTEND_IMAGE "$SWO_FRONTEND_IMAGE"
  env_setting SWO_LAYER "$layer"
  env_setting SWO_STORAGE "$([[ "$STORAGE" == 1 ]] && echo bundled || echo external)"
  env_setting PUBLIC_APP_BASE_URL "$app_url"
  env_setting SITE_ADDRESS "$([[ "$HTTPS_MODE" == 2 ]] && echo "$WEBHOST" || echo "http://$WEBHOST")"
  [[ "$HTTPS_MODE" != 1 ]] || env_setting ALLOW_PLAIN_HTTP 1
  [[ -z "$TLS_EMAIL" ]] || env_setting TLS_EMAIL "$TLS_EMAIL"
  # Only the cloudflared service reads the token (docker/compose.cloudflared.yml); the app never sees it.
  [[ "$HTTPS_MODE" != 4 ]] || env_setting CLOUDFLARE_TUNNEL_TOKEN "$CLOUDFLARE_TUNNEL_TOKEN"
  env_setting HTTP_PORT 80
  if [[ "$RUN_FRONTEND" == 2 ]]; then
    env_setting DEPLOYMENT_MODE backend
    env_setting FRONTEND_GATEWAY_SECRET "$(hex_key)"
  fi
  # Generated alphanumerics stay URL-safe inside the connection strings Compose builds.
  env_setting POSTGRES_PASSWORD "$(rand_key 40)"
  env_setting POSTGRES_APP_PASSWORD "$(rand_key 40)"
  env_setting REDIS_PASSWORD "$(rand_key 40)"
  env_setting MINIO_ROOT_USER "sworg-$(rand_key 12)"
  env_setting MINIO_ROOT_PASSWORD "$(rand_key 40)"
  env_setting S3_APP_PASSWORD "$(rand_key 40)"
  env_setting AUTH_SECRET "$(rand_key 64)"
  env_setting CRON_SECRET "$(rand_key 48)"
  env_setting HEALTHCHECK_SECRET "$(rand_key 48)"
  env_setting NEXT_SERVER_ACTIONS_ENCRYPTION_KEY "$(aes_key)"
  env_setting MFA_ENCRYPTION_KEY "$(aes_key)"
  env_setting PAYMENT_SECRETS_KEY "$(aes_key)"
  env_setting SUPER_ADMIN_EMAIL "$SUPER_ADMIN_EMAIL"
  env_setting EMAIL_FROM "$EMAIL_FROM"
  env_setting SMTP_HOST "$SMTP_HOST"
  env_setting SMTP_PORT "$SMTP_PORT"
  env_setting SMTP_SECURE "$([[ "$SMTP_PORT" == 465 ]] && echo true || echo false)"
  env_setting SMTP_USER "$SMTP_USER"
  env_setting SMTP_PASSWORD "$SMTP_PASSWORD"
  if [[ -n "$GOOGLE_CLIENT_ID" ]]; then
    env_setting AUTH_GOOGLE_ID "$GOOGLE_CLIENT_ID"
    env_setting AUTH_GOOGLE_SECRET "$GOOGLE_CLIENT_SECRET"
  fi
  if [[ -n "$GITHUB_CLIENT_ID" ]]; then
    env_setting AUTH_GITHUB_ID "$GITHUB_CLIENT_ID"
    env_setting AUTH_GITHUB_SECRET "$GITHUB_CLIENT_SECRET"
  fi
  if [[ -n "${APPLE_CLIENT_ID:-}" && -n "${APPLE_PRIVATE_KEY:-}" ]]; then
    env_setting AUTH_APPLE_ID "$APPLE_CLIENT_ID"
    env_setting AUTH_APPLE_TEAM_ID "${APPLE_TEAM_ID:-}"
    env_setting AUTH_APPLE_KEY_ID "${APPLE_KEY_ID:-}"
    env_setting AUTH_APPLE_PRIVATE_KEY "$APPLE_PRIVATE_KEY"
  fi
  if [[ -n "${SUPABASE_URL:-}" && -n "${SUPABASE_ANON_KEY:-}" ]]; then
    env_setting AUTH_SUPABASE_URL "$SUPABASE_URL"
    env_setting AUTH_SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
  fi
  if [[ -n "${FIREBASE_API_KEY:-}" && -n "${FIREBASE_PROJECT_ID:-}" ]]; then
    env_setting AUTH_FIREBASE_API_KEY "$FIREBASE_API_KEY"
    env_setting AUTH_FIREBASE_AUTH_DOMAIN "${FIREBASE_AUTH_DOMAIN:-}"
    env_setting AUTH_FIREBASE_PROJECT_ID "$FIREBASE_PROJECT_ID"
    env_setting AUTH_FIREBASE_PROVIDERS "${FIREBASE_PROVIDERS:-google.com}"
  fi
  # The deployment's own choice of sign-in methods (the super-admin switches become read-only). Unset for "none".
  [[ "${SETUP_SOCIAL_PROVIDERS:-none}" == none ]] || env_setting LOGIN_METHODS "password,$SETUP_SOCIAL_PROVIDERS"
  if [[ "$STORAGE" == 2 ]]; then
    env_setting S3_ENDPOINT "$S3_ENDPOINT"
    env_setting S3_REGION "$S3_REGION"
    env_setting S3_BUCKET "$S3_BUCKET"
    env_setting S3_ACCESS_KEY_ID "$S3_ACCESS_KEY"
    env_setting S3_SECRET_ACCESS_KEY "$S3_SECRET_KEY"
  fi
}
