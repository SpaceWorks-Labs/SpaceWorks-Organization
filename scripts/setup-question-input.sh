#!/usr/bin/env bash
# Input and private answer transport shared by the fetched and checkout installers.
rand_key() { ( set +o pipefail; LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-50}" ); }
# Base64 of 32 random bytes: AES-256 keys (Server Actions, MFA seeds, payment secrets).
aes_key() { head -c 32 /dev/urandom | base64 | tr -d '\n'; }
hex_key() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

valid_dns_host() {
  local host="$1" label
  [[ ${#host} -le 253 && "$host" != *..* && "$host" != *. ]] || return 1
  IFS=. read -ra host_labels <<< "$host"
  for label in "${host_labels[@]}"; do
    [[ ${#label} -le 63 && "$label" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$ ]] || return 1
  done
  [[ ${#host_labels[@]} -gt 0 ]]
}

question() {
  local key="$1" label="$2" default="$3" rule="${4:-text}" value
  while true; do
    local hint="${default:-required}"
    case "$rule" in secret|optional|google|optorigin|p8file|fbdomain|fbproject) hint="${default:-skip}" ;; esac
    [[ "$key" != SMTP_PASSWORD ]] || hint=required
    if [[ "$rule" == choices:Y,* ]]; then
      [[ "$default" =~ ^[Yy] ]] && hint=Y/n || hint=y/N
    fi
    printf '%s [%s]: ' "$label" "$hint"
    if [[ "$rule" == secret || "$rule" == password ]]; then
      IFS= read -r -s -u 3 value || return 1
      echo
    else
      IFS= read -r -u 3 value || return 1
    fi
    value="${value%$'\r'}"
    value="${value:-$default}"
    case "$rule" in
      providers) value="$(printf '%s' "$value" | tr -d ' ' | tr '[:upper:]' '[:lower:]')"; [[ "$value" == none || "$value" =~ ^(google|apple|github|oidc|saml|supabase|firebase)(,(google|apple|github|oidc|saml|supabase|firebase))*$ ]] || { echo 'Use google, apple, github, oidc, saml, supabase, firebase as a comma list, or none.'; continue; } ;;
      optorigin) [[ -z "$value" ]] || { [[ "$value" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?$ ]] && valid_dns_host "${value#https://}"; } || { echo 'Enter one https:// origin without a path, or leave it blank.'; continue; } ;;
      p8file)
        if [[ -n "$value" ]]; then
          local p8="$value"
          if command -v cygpath >/dev/null 2>&1; then p8="$(cygpath -u "$value" 2>/dev/null || printf '%s' "$value")"; fi
          { [[ -f "$p8" && -r "$p8" ]] && grep -q 'BEGIN PRIVATE KEY' "$p8"; } || { echo 'Enter the path to the Apple .p8 key file, or leave it blank.'; continue; }
        fi ;;
      fbdomain) [[ -z "$value" ]] || { [[ "$value" == *.* ]] && valid_dns_host "$value"; } || { echo 'Enter the auth domain, for example your-project.firebaseapp.com.'; continue; } ;;
      fbproject) [[ -z "$value" || "$value" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || { echo 'Enter the Firebase project id.'; continue; } ;;
      fbproviders) [[ "$value" =~ ^[a-zA-Z0-9.]+(,[a-zA-Z0-9.]+)*$ ]] || { echo 'Use a comma list such as google.com,emailLink.'; continue; } ;;
      choices:*) [[ ",${rule#choices:}," == *",$value,"* ]] || { echo 'Choose one of the listed options.'; continue; } ;;
      repository) [[ "$value" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?/[A-Za-z0-9_.-]{1,100}$ && "$value" != */. && "$value" != */.. ]] || { echo 'Enter a GitHub owner/repo name.'; continue; } ;;
      host) valid_dns_host "$value" || { echo 'Enter a hostname or IPv4 address without a scheme, port or path.'; continue; } ;;
      domain) [[ "$value" == *.* && ! "${value##*.}" =~ ^[0-9]+$ ]] && valid_dns_host "$value" || { echo 'Enter a DNS domain without a scheme, port or path.'; continue; }; value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')" ;;
      email) [[ "$value" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo 'Enter an email address.'; continue; } ;;
      sender)
        local named='^[^<>]*[<][^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+[>]$' plain='^[^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+$'
        [[ "$value" =~ $named || "$value" =~ $plain ]] || { echo 'Enter Name <address@your-domain> or an address.'; continue; } ;;
      origin)
        [[ "$value" =~ ^https://[a-zA-Z0-9.-]+$ ]] && valid_dns_host "${value#https://}" || { echo 'Enter one HTTPS origin, without a path or trailing slash.'; continue; }
        value="$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')"
        ;;
      secure_url) [[ "$value" =~ ^https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?$ ]] || { echo 'Enter an https:// endpoint without a path, query or credentials.'; continue; } ;;
      bucket) [[ "$value" =~ ^[a-z0-9][a-z0-9.-]+[a-z0-9]$ && ${#value} -le 63 && "$value" != *..* ]] || { echo 'Use a bucket name of 3-63 lowercase letters, digits, dots or hyphens.'; continue; } ;;
      region) [[ "$value" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'Enter a region code without whitespace.'; continue; } ;;
      port) [[ "$value" =~ ^[0-9]{1,5}$ ]] && ((10#$value >= 1 && 10#$value <= 65535)) || { echo 'Use a port from 1 to 65535.'; continue; } ;;
      google) [[ -z "$value" || "$value" == *.apps.googleusercontent.com ]] || { echo 'A Google client ID ends in .apps.googleusercontent.com.'; continue; } ;;
      secret) [[ -n "$value" || "$key" != SMTP_PASSWORD ]] || { echo 'A value is required.'; continue; } ;;
      password) ((${#value} >= 12 && $(printf '%s' "$value" | LC_ALL=C wc -c) <= 72)) || { echo 'Use 12 to 72 characters.'; continue; } ;;
      optional) ;;
      text) [[ -n "$value" ]] || { echo 'A value is required.'; continue; } ;;
    esac
    [[ "$value" != *$'\r'* && "$value" != *$'\n'* ]] || { echo 'Use a single line.'; continue; }
    [[ "$rule" == secret || "$rule" == password || ! "$value" =~ [[:cntrl:]] ]] || { echo 'Use text without control characters.'; continue; }
    printf -v "$key" '%s' "$value"
    return 0
  done
}

SETUP_ANSWER_KEYS=(RUN_FRONTEND SITE_ORIGIN HTTPS_MODE PUBLIC_DOMAIN TLS_EMAIL WEBHOST STORAGE
  S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY SUPER_ADMIN_EMAIL SUPER_ADMIN_PASSWORD
  EMAIL_FROM SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SETUP_SOCIAL_PROVIDERS
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET
  APPLE_CLIENT_ID APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY
  SUPABASE_URL SUPABASE_ANON_KEY FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_PROVIDERS
  SWO_REPOSITORY INSTALL_RUNNER ANSWERS_CONFIRMED)

save_setup_answers() {
  local target="$1" key
  (umask 077; set -o noclobber; : > "$target") || return 1
  chmod 600 "$target"
  for key in "${SETUP_ANSWER_KEYS[@]}"; do
    printf '%s=%q\n' "$key" "${!key:-}" >> "$target"
  done
}

persist_setup_answers() {
  local key
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      # Native Windows cannot represent POSIX mode 600 reliably. Inherit the
      # confirmed answers in process environment instead of writing a secret file.
      for key in "${SETUP_ANSWER_KEYS[@]}"; do export "${key?}"; done
      ;;
    *) save_setup_answers "$1" ;;
  esac
}

load_setup_answers() {
  local target="$1" mode
  [[ -f "$target" && ! -L "$target" && -O "$target" ]] || { echo 'Answers must be a regular file owned by the operator.' >&2; return 1; }
  mode="$(stat -c %a "$target" 2>/dev/null || stat -f %Lp "$target")"
  [[ "$mode" == 600 ]] || { echo 'Answers file must have mode 600.' >&2; return 1; }
  # shellcheck disable=SC1090 # written by save_setup_answers with %q quoting
  source "$target"
  [[ "${ANSWERS_CONFIRMED:-}" == yes ]] || { echo 'Deployment answers have not been confirmed.' >&2; return 1; }
}
