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
  SITE_ORIGIN=''; PUBLIC_DOMAIN=''; TLS_EMAIL=''; WEBHOST=''; CLOUDFLARE_TUNNEL_TOKEN=''
  if [[ "$RUN_FRONTEND" == 2 ]]; then
    question SITE_ORIGIN 'Website URL on Netlify (HTTPS origin)' '' origin || return 1
  fi
  echo 'HTTPS:'
  echo '  1) None - plain HTTP for a LAN or trial.'
  echo '  2) Automatic HTTPS - built-in Caddy; point DNS at this server.'
  echo '  3) I already run a reverse proxy - forward HTTPS to this server.'
  echo '  4) Cloudflare Tunnel - free, no open ports; Cloudflare serves HTTPS (docs/DEPLOYMENT_CLOUDFLARE.md).'
  local https_default=1
  [[ "$RUN_FRONTEND" != 2 ]] || https_default=2
  while true; do
    question HTTPS_MODE 'HTTPS' "$https_default" choices:1,2,3,4 || return 1
    [[ "$RUN_FRONTEND" != 2 || "$HTTPS_MODE" != 1 ]] && break
    echo 'A backend for a Netlify website requires HTTPS. Choose automatic HTTPS, an existing proxy or a Cloudflare Tunnel.'
  done
  if [[ "$HTTPS_MODE" != 1 ]]; then
    if [[ "$HTTPS_MODE" == 4 ]]; then
      echo 'Create the tunnel first (Cloudflare Zero Trust -> Networks -> Tunnels -> Create, Docker connector); the public hostname must point at HTTP backend:3000.'
      question PUBLIC_DOMAIN 'Public domain (its Cloudflare DNS record points at the tunnel)' '' domain || return 1
      question CLOUDFLARE_TUNNEL_TOKEN 'Tunnel token (hidden)' '' tunneltoken || return 1
    else
      question PUBLIC_DOMAIN 'Public domain (DNS points at this server)' '' domain || return 1
    fi
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
  question SETUP_SOCIAL_PROVIDERS 'Which sign-in options besides email and password? google, apple, github, oidc, saml, supabase, firebase - comma list, or none (all are off until you switch them on)' none providers || return 1
  GOOGLE_CLIENT_ID=''; GOOGLE_CLIENT_SECRET=''; GITHUB_CLIENT_ID=''; GITHUB_CLIENT_SECRET=''
  APPLE_CLIENT_ID=''; APPLE_TEAM_ID=''; APPLE_KEY_ID=''; APPLE_PRIVATE_KEY=''
  SUPABASE_URL=''; SUPABASE_ANON_KEY=''; FIREBASE_API_KEY=''; FIREBASE_AUTH_DOMAIN=''; FIREBASE_PROJECT_ID=''; FIREBASE_PROVIDERS=''
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
    echo 'Apple: a Services ID, team ID and a Sign in with Apple key (.p8). Leave the Services ID blank to add it later in Super admin -> Settings.'
    question APPLE_CLIENT_ID 'Apple Services ID' '' optional || return 1
    if [[ -n "$APPLE_CLIENT_ID" ]]; then
      local apple_file=''
      question APPLE_TEAM_ID 'Apple team ID' '' text || return 1
      question APPLE_KEY_ID 'Apple key ID' '' text || return 1
      question apple_file 'Path to the Apple .p8 key file' '' p8file || return 1
      [[ -z "$apple_file" ]] || APPLE_PRIVATE_KEY="$(read_apple_key "$apple_file")"
    fi
  fi
  if [[ ",$SETUP_SOCIAL_PROVIDERS," == *,supabase,* ]]; then
    echo 'Supabase Auth: the project URL and its publishable (anon) key. The project must use asymmetric JWT signing keys. Leave the URL blank to add it later.'
    question SUPABASE_URL 'Supabase project URL (https://<ref>.supabase.co)' '' optorigin || return 1
    [[ -z "$SUPABASE_URL" ]] || question SUPABASE_ANON_KEY 'Supabase publishable key' '' text || return 1
  fi
  if [[ ",$SETUP_SOCIAL_PROVIDERS," == *,firebase,* ]]; then
    echo 'Firebase Auth: public web app values from the Firebase console. Leave the API key blank to add it later.'
    question FIREBASE_API_KEY 'Firebase API key' '' optional || return 1
    if [[ -n "$FIREBASE_API_KEY" ]]; then
      question FIREBASE_AUTH_DOMAIN 'Firebase auth domain' '' fbdomain || return 1
      question FIREBASE_PROJECT_ID 'Firebase project ID' '' fbproject || return 1
      question FIREBASE_PROVIDERS 'Firebase sign-in providers (google.com, microsoft.com, apple.com, github.com, emailLink, password)' google.com fbproviders || return 1
    fi
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
  case "$HTTPS_MODE" in 1) https='plain HTTP'; scheme=http ;; 2) https='automatic Caddy HTTPS' ;; 3) https='existing reverse proxy' ;; 4) https='Cloudflare Tunnel (token hidden)' ;; esac
  [[ "$STORAGE" == 1 ]] && storage='bundled Silo' || storage="external S3 bucket $S3_BUCKET at $S3_ENDPOINT (region $S3_REGION, keys hidden)"
  printf '  Website here: %s; HTTPS: %s; storage: %s\n' "$website" "$https" "$storage"
  printf '  Server: %s://%s; certificate email: %s\n' "$scheme" "$WEBHOST" "${TLS_EMAIL:-none}"
  printf '  Super admin: %s (password set; sign in at /login, then open /super-admin)\n' "$SUPER_ADMIN_EMAIL"
  printf '  Email: %s via %s:%s as %s (password hidden)\n' "$EMAIL_FROM" "$SMTP_HOST" "$SMTP_PORT" "$SMTP_USER"
  printf '  Sign-in options: email and password, %s (configured now: %s; the rest later in Super admin -> Settings)\n' "$SETUP_SOCIAL_PROVIDERS" "$(configured_sign_in_options)"
  printf '  GitHub repository: %s; install GitHub Actions runner: %s\n' "$SWO_REPOSITORY" "$INSTALL_RUNNER"
  echo "  migrate builds the database tables. It runs once and stops. It's required."
  echo "  worker sends email and runs background jobs; beat schedules them (membership sweep and outbox every minute)."
  local services='PostgreSQL 16 (TLS), Redis 7 (TLS)'
  [[ "$STORAGE" != 1 ]] || services+=', Silo storage (TLS, bucket initializer)'
  services+=', app, worker, beat'
  case "$HTTPS_MODE" in 3) ;; 4) services+=', cloudflared tunnel connector' ;; *) services+=', Caddy web edge' ;; esac
  echo "  Will run: $services; one-shot migrations."
  case "$HTTPS_MODE" in
    2) echo "  DNS: point $PUBLIC_DOMAIN at this server; ports 80 and 443 must be open." ;;
    3) echo "  Your proxy must forward https://$PUBLIC_DOMAIN to 127.0.0.1:8080, preserving Host, overwriting X-Real-IP and sending X-Forwarded-Proto: https." ;;
    4) echo "  Cloudflare: the tunnel's public hostname for $PUBLIC_DOMAIN must serve HTTP backend:3000. No ports need to be open on this server." ;;
  esac
  [[ "$RUN_FRONTEND" == 1 ]] || echo "  Then deploy the website on Netlify with BACKEND_ORIGIN=https://$PUBLIC_DOMAIN and the FRONTEND_GATEWAY_SECRET saved in .env."
  echo "  Will perform: ${SETUP_HOST_PLAN:-write private .env and TLS certificates, pull or build images, apply migrations, start services and install the optional GitHub Actions runner}."
  echo '  Production contains no demo or example data. Secrets are saved privately, never printed here.'
}

# The .p8 key as one line with literal \n, the form the AUTH_APPLE_PRIVATE_KEY variable takes.
read_apple_key() {
  local file="$1"
  if command -v cygpath >/dev/null 2>&1; then file="$(cygpath -u "$file" 2>/dev/null || printf '%s' "$file")"; fi
  tr -d '\r' <"$file" | awk 'BEGIN { ORS = "" } NF { print $0 "\\n" }'
}

configured_sign_in_options() {
  local configured=()
  [[ -z "$GOOGLE_CLIENT_ID" ]] || configured+=(google)
  [[ -z "$GITHUB_CLIENT_ID" ]] || configured+=(github)
  [[ -z "$APPLE_PRIVATE_KEY" ]] || configured+=(apple)
  [[ -z "$SUPABASE_ANON_KEY" ]] || configured+=(supabase)
  [[ -z "$FIREBASE_PROJECT_ID" ]] || configured+=(firebase)
  if ((${#configured[@]})); then local IFS=,; printf '%s' "${configured[*]}"; else printf 'none'; fi
}
