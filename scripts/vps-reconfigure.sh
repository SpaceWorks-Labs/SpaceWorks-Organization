#!/usr/bin/env bash
# Change settings after installation, from the installer menu:
#   1) the web address   2) outgoing email (SMTP)   3) external bucket keys
# It backs up the database first, keeps the previous .env, recreates the services and runs the
# operator checks; if anything fails, the previous settings are put back and the stack restarted.
# Switching between bundled Silo and an external bucket, or between HTTPS modes, is not done here:
# see "Moving between modes" in docs/DEPLOYMENT_VPS.md.
# shellcheck disable=SC2154 # ask assigns answers by name
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/scripts/vps-reconfigure.sh" "$@"
# shellcheck source=scripts/vps-lib.sh
source "$ROOT/scripts/vps-lib.sh"
require_tty
require_install
layer="$(conf_get "$ENV_FILE" SWO_LAYER)"; layer="${layer:-none}"
storage="$(conf_get "$ENV_FILE" SWO_STORAGE)"
backend_only=0
[[ "$(conf_get "$ENV_FILE" DEPLOYMENT_MODE)" != backend ]] || backend_only=1
site="$(conf_get "$ENV_FILE" SITE_ADDRESS)"; site="${site#http://}"

cat >/dev/tty <<EOF

Change settings
  1) Web address - now $(conf_get "$ENV_FILE" PUBLIC_APP_BASE_URL)$([[ $backend_only == 0 ]] || echo " (this server: $site)")
  2) Outgoing email (SMTP) - now $(conf_get "$ENV_FILE" SMTP_HOST) as $(conf_get "$ENV_FILE" SMTP_USER)
EOF
[[ "$storage" != external ]] || printf '  3) External bucket keys - bucket %s\n' "$(conf_get "$ENV_FILE" S3_BUCKET)" >/dev/tty
printf '  0) Cancel\n' >/dev/tty
is_choice() { [[ "$1" =~ ^[0-2]$ || ( "$1" == 3 && "$storage" == external ) ]]; }
ask choice 'Choose' 0 is_choice 'Enter one of the numbers shown.'
[[ "$choice" != 0 ]] || { say 'Cancelled. Nothing was changed.'; exit 2; }

changes=()
change() { changes+=("$1" "$2"); }
case "$choice" in
  1)
    if [[ "$layer" == none ]]; then
      ask host 'Web address (host name or IP, no http://)' "$site" is_host 'Enter a host name or IPv4 address without a scheme, port or path.'
      change SITE_ADDRESS "http://$host"
      origin="http://$host"
    else
      ask host 'Public domain (its DNS points at this server)' "$site" is_domain 'Enter a domain such as members.example.org.'
      host="$(printf '%s' "$host" | tr '[:upper:]' '[:lower:]')"
      if [[ "$layer" == tls ]]; then change SITE_ADDRESS "$host"; else change SITE_ADDRESS "http://$host"; fi
      origin="https://$host"
    fi
    if [[ $backend_only == 1 ]]; then
      ask origin 'Website URL on Netlify (HTTPS origin)' "$(conf_get "$ENV_FILE" PUBLIC_APP_BASE_URL)" is_origin 'Enter one HTTPS origin, without a path or trailing slash.'
      origin="$(printf '%s' "$origin" | tr '[:upper:]' '[:lower:]')"
    fi
    change PUBLIC_APP_BASE_URL "$origin"
    cat >/dev/tty <<EOF

The site moves to $origin. Point DNS at this server first$([[ "$layer" != proxy ]] || echo ', and forward it from your proxy'). Everyone is
signed out, and links already sent (invitations, pay links, receipts) keep the old address.
EOF
    ;;
  2)
    printf '\nOutgoing email needs an authenticated SMTP relay on a verified sending domain.\n' >/dev/tty
    ask value 'Sender, as Name <address@your-domain>' "$(conf_get "$ENV_FILE" EMAIL_FROM)" is_sender 'Enter Name <address@your-domain> or an address.'
    change EMAIL_FROM "$value"
    ask value 'SMTP host' "$(conf_get "$ENV_FILE" SMTP_HOST)" is_domain 'Enter the relay host name, such as smtp-relay.brevo.com.'
    change SMTP_HOST "$value"
    ask port 'SMTP port (implicit TLS: 465)' "$(conf_get "$ENV_FILE" SMTP_PORT)" is_port 'Enter a port from 1 to 65535.'
    change SMTP_PORT "$port"
    change SMTP_SECURE "$([[ "$port" == 465 ]] && echo true || echo false)"
    ask value 'SMTP login' "$(conf_get "$ENV_FILE" SMTP_USER)" is_line 'Enter the login on one line.'
    change SMTP_USER "$value"
    ask_secret value 'SMTP password or key (hidden)'
    change SMTP_PASSWORD "$value"
    ;;
  3)
    ask value 'Access key ID' '' is_line 'Enter the access key on one line.'
    change S3_ACCESS_KEY_ID "$value"
    ask_secret value 'Secret access key (hidden)'
    change S3_SECRET_ACCESS_KEY "$value"
    ;;
esac
unset value
confirm 'Apply this change? The site restarts briefly.' Y || { say 'Cancelled. Nothing was changed.'; exit 2; }

take_lock
say 'Backing up the database first.'
bash "$ROOT/scripts/backup.sh" --prefix pre-settings --no-storage
cp -p "$ENV_FILE" "$ENV_FILE.previous"
restore_settings() {
  local status=$?
  [[ $status != 0 ]] || return 0
  set +e
  warn 'The change did not pass the checks; putting the previous settings back.'
  mv -f -- "$ENV_FILE.previous" "$ENV_FILE"
  compose up -d --wait --wait-timeout 300 >/dev/null 2>&1 \
    || warn 'Start the services with: scripts/spaceworks-compose.sh bundled up -d'
  exit "$status"
}
trap restore_settings EXIT
for ((i = 0; i < ${#changes[@]}; i += 2)); do conf_set "$ENV_FILE" "${changes[i]}" "${changes[i + 1]}"; done
changes=()
compose up -d --wait --wait-timeout 300
compose run --rm ops
rm -f -- "$ENV_FILE.previous"
trap - EXIT
case "$choice" in
  1) say "Done. The site is at $(conf_get "$ENV_FILE" PUBLIC_APP_BASE_URL)."
     [[ $backend_only == 0 ]] || say 'Update BACKEND_ORIGIN in your Netlify site and redeploy it.' ;;
  2) say 'Done. Send a test email from Super admin -> Settings to confirm delivery.' ;;
  3) say 'Done. The new bucket key is in use.' ;;
esac
