#!/usr/bin/env bash
# shellcheck disable=SC2034 # answers are read by the scripts that source this file
# No filesystem or Docker effects: gather every deployment choice, then confirm once.
# shellcheck source=scripts/setup-question-input.sh
source "$(dirname "${BASH_SOURCE[0]}")/setup-question-input.sh"

ask_setup_questions() {
  exec 3</dev/tty
  echo 'Space Works Organization deployment questions. Enter accepts the [default].'
  echo 'Run the website on this server?'
  echo '  1) Yes - serve the website and dashboards here.'
  echo '  2) No, backend only - the website runs on Netlify (docs/DEPLOYMENT_NETLIFY.md).'
  question RUN_FRONTEND 'Website' 1 choices:1,2 || return 1
  SITE_ORIGIN=''; PUBLIC_DOMAIN=''; TLS_EMAIL=''; WEBHOST=''
  if [[ "$RUN_FRONTEND" == 2 ]]; then
    question SITE_ORIGIN 'Website URL on Netlify (HTTPS origin)' '' origin || return 1
  fi
  echo 'HTTPS:'
  echo '  1) None - plain HTTP for a LAN or trial.'
  echo '  2) Automatic HTTPS - built-in Caddy; point DNS at this server.'
  echo '  3) I already run a reverse proxy - forward HTTPS to this server.'
  local https_default=1
  [[ "$RUN_FRONTEND" != 2 ]] || https_default=2
  while true; do
    question HTTPS_MODE 'HTTPS' "$https_default" choices:1,2,3 || return 1
    [[ "$RUN_FRONTEND" != 2 || "$HTTPS_MODE" != 1 ]] && break
    echo 'A backend for a Netlify website requires HTTPS. Choose automatic HTTPS or an existing proxy.'
  done
  if [[ "$HTTPS_MODE" != 1 ]]; then
    question PUBLIC_DOMAIN 'Public domain (DNS points at this server)' '' domain || return 1
    [[ "$HTTPS_MODE" != 2 ]] || question TLS_EMAIL 'HTTPS certificate email' '' email || return 1
    WEBHOST="$PUBLIC_DOMAIN"
  else
    question WEBHOST 'Web address (host name or IP, no http://)' localhost host || return 1
  fi
  echo 'File storage (organisation logos, member photos, ID cards, receipts):'
  echo '  1) Bundled Silo object storage - a private bucket on this server.'
  echo '  2) External S3-compatible bucket (Cloudflare R2, Amazon S3...) - create a private bucket and a key limited to it first.'
  question STORAGE 'File storage' 1 choices:1,2 || return 1
  S3_ENDPOINT=''; S3_REGION=''; S3_BUCKET=''; S3_ACCESS_KEY=''; S3_SECRET_KEY=''
  if [[ "$STORAGE" == 2 ]]; then
    question S3_ENDPOINT 'S3 endpoint' '' secure_url || return 1
    question S3_REGION 'S3 region (R2: auto)' auto region || return 1
    question S3_BUCKET 'Private bucket' '' bucket || return 1
    question S3_ACCESS_KEY 'S3 access key' '' text || return 1
    while true; do
      question S3_SECRET_KEY 'S3 secret key' '' secret || return 1
      [[ -n "$S3_SECRET_KEY" ]] && break
      echo 'A secret key is required.'
    done
  fi
  question SUPER_ADMIN_EMAIL 'Super-admin email (you sign in with it to run this platform)' '' email || return 1
  echo 'The super-admin password is set only here or later on the server (bash scripts/admin.sh), never by email.'
  local repeat=''
  while true; do
    question SUPER_ADMIN_PASSWORD 'Super-admin password (12+ characters)' '' password || return 1
    question repeat 'Repeat the password' '' password || return 1
    [[ "$repeat" == "$SUPER_ADMIN_PASSWORD" ]] && break
    echo 'The two passwords did not match.'
  done
  echo 'Outgoing email needs an authenticated SMTP relay on a verified sending domain (Brevo, Amazon SES, Postmark...).'
  local mail_host="${SITE_ORIGIN#https://}"
  mail_host="${mail_host:-$WEBHOST}"
  # Only a real domain makes a usable default sender; localhost or an IP leaves it to the operator.
  local sender_default=''
  [[ "$mail_host" != *.* || "$mail_host" =~ ^[0-9.]+$ ]] || sender_default="Space Works Organization <noreply@$mail_host>"
  question EMAIL_FROM 'Sender, as Name <address@your-domain>' "$sender_default" sender || return 1
  question SMTP_HOST 'SMTP host' smtp-relay.brevo.com domain || return 1
  question SMTP_PORT 'SMTP port (implicit TLS: 465)' 587 port || return 1
  question SMTP_USER 'SMTP login' '' text || return 1
  question SMTP_PASSWORD 'SMTP password or key' '' secret || return 1
  question SETUP_SOCIAL_PROVIDERS 'Which sign-in options besides email + password? Google, Apple, GitHub - comma list, or none' none providers || return 1
  GOOGLE_CLIENT_ID=''; GOOGLE_CLIENT_SECRET=''; GITHUB_CLIENT_ID=''; GITHUB_CLIENT_SECRET=''
  if [[ ",$SETUP_SOCIAL_PROVIDERS," == *,google,* ]]; then
    echo 'Google: a Web client from Google Cloud Console. Leave blank to add it later in Super admin -> Settings.'
    question GOOGLE_CLIENT_ID 'Google client ID' '' google || return 1
    [[ -z "$GOOGLE_CLIENT_ID" ]] || question GOOGLE_CLIENT_SECRET 'Google client secret' '' secret || return 1
  fi
  if [[ ",$SETUP_SOCIAL_PROVIDERS," == *,github,* ]]; then
    echo 'GitHub: an OAuth app. Leave blank to add it later in Super admin -> Settings.'
    question GITHUB_CLIENT_ID 'GitHub client ID' '' optional || return 1
    [[ -z "$GITHUB_CLIENT_ID" ]] || question GITHUB_CLIENT_SECRET 'GitHub client secret' '' secret || return 1
  fi
  if [[ ",$SETUP_SOCIAL_PROVIDERS," == *,apple,* ]]; then
    echo 'Apple: add the services ID, team ID, key ID and .p8 key in Super admin -> Settings after sign-in.'
  fi
  if [[ "${SWO_INSTALL_REPOSITORY_PINNED:-0}" == 1 ]]; then
    echo "GitHub repository to follow [$SWO_REPOSITORY] (selected before download)."
  else
    question SWO_REPOSITORY 'GitHub repository to follow' "${SWO_REPOSITORY:-SpaceWorks-Labs/SpaceWorks-Organization}" repository || return 1
  fi
  INSTALL_RUNNER=N
  if [[ "$(uname -s)" == Linux ]] && command -v systemctl >/dev/null 2>&1 \
    && [[ -d /run/systemd/system ]]; then
    echo 'Pair the runner with the required GitHub approval and repository settings after installation.'
    question INSTALL_RUNNER 'Install a GitHub Actions runner on this server for automatic deploys?' N choices:Y,y,yes,YES,N,n,no,NO || return 1
  else
    echo 'GitHub Actions runner installation supports only Linux with running systemd; skipping.'
  fi
  setup_summary
  local proceed
  question proceed 'Proceed?' Y choices:Y,y,yes,YES,N,n,no,NO || return 1
  exec 3<&-
  [[ "$proceed" =~ ^[Yy] ]] || { echo 'Cancelled; nothing was installed or configured.'; return 1; }
  ANSWERS_CONFIRMED=yes
}

setup_summary() {
  echo
  echo 'Deployment summary'
  local website https storage scheme=https
  [[ "$RUN_FRONTEND" == 1 ]] && website=yes || website="backend only, website at $SITE_ORIGIN"
  case "$HTTPS_MODE" in 1) https='plain HTTP'; scheme=http ;; 2) https='automatic Caddy HTTPS' ;; 3) https='existing reverse proxy' ;; esac
  [[ "$STORAGE" == 1 ]] && storage='bundled Silo' || storage="external S3 bucket $S3_BUCKET at $S3_ENDPOINT (region $S3_REGION, keys hidden)"
  printf '  Website here: %s; HTTPS: %s; storage: %s\n' "$website" "$https" "$storage"
  printf '  Server: %s://%s; certificate email: %s\n' "$scheme" "$WEBHOST" "${TLS_EMAIL:-none}"
  printf '  Super admin: %s (password set; sign in at /login, then open /super-admin)\n' "$SUPER_ADMIN_EMAIL"
  printf '  Email: %s via %s:%s as %s (password hidden)\n' "$EMAIL_FROM" "$SMTP_HOST" "$SMTP_PORT" "$SMTP_USER"
  printf '  Sign-in options: email + password, %s (Google: %s, GitHub: %s; Apple and the rest later in Super admin -> Settings)\n' \
    "$SETUP_SOCIAL_PROVIDERS" "$([[ -n "$GOOGLE_CLIENT_ID" ]] && echo configured || echo later)" "$([[ -n "$GITHUB_CLIENT_ID" ]] && echo configured || echo later)"
  printf '  GitHub repository: %s; install GitHub Actions runner: %s\n' "$SWO_REPOSITORY" "$INSTALL_RUNNER"
  echo "  migrate builds the database tables. It runs once and stops. It's required."
  echo "  scheduler sends email, runs the membership sweep and clears expired data, once a minute."
  local services='PostgreSQL 16 (TLS), Redis 7 (TLS)'
  [[ "$STORAGE" != 1 ]] || services+=', Silo storage (TLS, bucket initializer)'
  services+=', app, scheduler'
  [[ "$HTTPS_MODE" == 3 ]] || services+=', Caddy web edge'
  echo "  Will run: $services; one-shot migrations."
  case "$HTTPS_MODE" in
    2) echo "  DNS: point $PUBLIC_DOMAIN at this server; ports 80 and 443 must be open." ;;
    3) echo "  Your proxy must forward https://$PUBLIC_DOMAIN to 127.0.0.1:8080, preserving Host, overwriting X-Real-IP and sending X-Forwarded-Proto: https." ;;
  esac
  [[ "$RUN_FRONTEND" == 1 ]] || echo "  Then deploy the website on Netlify with BACKEND_ORIGIN=https://$PUBLIC_DOMAIN and the FRONTEND_GATEWAY_SECRET saved in .env."
  echo "  Will perform: ${SETUP_HOST_PLAN:-write private .env and TLS certificates, pull or build images, apply migrations, start services and install the optional GitHub Actions runner}."
  echo '  Production contains no demo or example data. Secrets are saved privately, never printed here.'
}
