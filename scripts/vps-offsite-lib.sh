#!/usr/bin/env bash
# Backup encryption (age) and off-site copies (an S3-compatible bucket), sourced by scripts/vps-lib.sh.
# Settings live in the owner-only backup.env beside .env:
#   BACKUP_AGE_RECIPIENT   age public key; off-site copies are encrypted to it
#   OFFSITE_ENDPOINT, OFFSITE_BUCKET, OFFSITE_PREFIX, OFFSITE_ACCESS_KEY_ID, OFFSITE_SECRET_ACCESS_KEY,
#   OFFSITE_KEEP_DAYS, OFFSITE_CA (a private endpoint's CA, copied beside it as offsite-ca.crt)
# shellcheck shell=bash
# shellcheck disable=SC2154 # ask assigns answers by name

json_string() { local value="${1//\\/\\\\}"; printf '"%s"' "${value//\"/\\\"}"; }

# run_mc [DOCKER OPTIONS...] IMAGE MC-ARGS...: the mc client with the off-site bucket as alias
# `offsite`. The keys go into a private mc config for this one call, never into a URL or onto a
# command line (mc does not decode a URL's userinfo, so keys with "/" or "+" would be sent wrong).
run_mc() {
  local home status=0 ca=() backups
  backups="$(backup_dir)"
  mkdir -p "$backups"
  home="$(mktemp -d "$backups/.mc.XXXXXX")"
  mkdir -m 0700 "$home/.mc"
  ( umask 077
    printf '{"version":"10","aliases":{"offsite":{"url":%s,"accessKey":%s,"secretKey":%s,"api":"s3v4","path":"auto"}}}\n' \
      "$(json_string "$(conf_get "$BACKUP_SETTINGS" OFFSITE_ENDPOINT)")" \
      "$(json_string "$(conf_get "$BACKUP_SETTINGS" OFFSITE_ACCESS_KEY_ID)")" \
      "$(json_string "$(conf_get "$BACKUP_SETTINGS" OFFSITE_SECRET_ACCESS_KEY)")" > "$home/.mc/config.json" )
  if [[ -n "$(conf_get "$BACKUP_SETTINGS" OFFSITE_CA)" ]]; then
    ca=(--volume "$ROOT/offsite-ca.crt:/offsite-ca.crt:ro" --env SSL_CERT_FILE=/offsite-ca.crt)
  fi
  # As the install owner, so downloaded files belong to it.
  MSYS_NO_PATHCONV=1 docker run --rm --user "$(id -u):$(id -g)" --env HOME=/mc-home --env MC_CONFIG_DIR=/mc-home/.mc \
    --volume "$home:/mc-home" ${ca[@]+"${ca[@]}"} --entrypoint mc "$@" || status=$?
  rm -rf -- "$home"
  return "$status"
}
offsite_path() {
  printf 'offsite/%s/%s' "$(conf_get "$BACKUP_SETTINGS" OFFSITE_BUCKET)" "$(conf_get "$BACKUP_SETTINGS" OFFSITE_PREFIX)"
}

# ask_offsite: the bucket questions; answers in offsite_* variables.
ask_offsite() {
  cat >/dev/tty <<'EOF'

Off-site copies go to an S3-compatible bucket at another provider (Cloudflare R2, Backblaze B2,
Amazon S3...). Create a private bucket and a key limited to it first.
EOF
  ask offsite_endpoint 'Off-site S3 endpoint' '' is_https_endpoint 'Enter the HTTPS endpoint, such as https://<account>.r2.cloudflarestorage.com.'
  offsite_endpoint="${offsite_endpoint%/}"
  ask offsite_ca 'CA certificate file, only for a private endpoint' none is_ca_file 'Enter the path of a PEM certificate file, or none.'
  [[ "$offsite_ca" != none ]] || offsite_ca=''
  ask offsite_bucket 'Off-site bucket' '' is_bucket 'Enter a bucket name: lowercase letters, digits, dots and hyphens.'
  ask offsite_prefix 'Folder in the bucket' spaceworks-organization is_prefix 'Use letters, digits, dots, hyphens and underscores.'
  ask offsite_key 'Access key ID' '' is_plain "Enter the access key, without ' or \\ characters."
  ask_secret offsite_secret 'Secret access key (hidden)' is_plain
  ask offsite_days 'Days to keep off-site copies' 90 is_days 'Enter a number of days.'
}
save_offsite() {
  if [[ -n "${offsite_ca:-}" ]]; then
    install -m 0600 "$offsite_ca" "$ROOT/offsite-ca.crt"
    conf_set "$BACKUP_SETTINGS" OFFSITE_CA offsite-ca.crt
  else
    conf_unset "$BACKUP_SETTINGS" OFFSITE_CA
  fi
  conf_set "$BACKUP_SETTINGS" OFFSITE_ENDPOINT "$offsite_endpoint"
  conf_set "$BACKUP_SETTINGS" OFFSITE_BUCKET "$offsite_bucket"
  conf_set "$BACKUP_SETTINGS" OFFSITE_PREFIX "$offsite_prefix"
  conf_set "$BACKUP_SETTINGS" OFFSITE_ACCESS_KEY_ID "$offsite_key"
  conf_set "$BACKUP_SETTINGS" OFFSITE_SECRET_ACCESS_KEY "$offsite_secret"
  conf_set "$BACKUP_SETTINGS" OFFSITE_KEEP_DAYS "$offsite_days"
}
clear_offsite() {
  local name
  for name in OFFSITE_ENDPOINT OFFSITE_BUCKET OFFSITE_PREFIX OFFSITE_ACCESS_KEY_ID OFFSITE_SECRET_ACCESS_KEY OFFSITE_KEEP_DAYS OFFSITE_CA; do
    conf_unset "$BACKUP_SETTINGS" "$name"
  done
  rm -f -- "$ROOT/offsite-ca.crt"
}

# age encrypts to a public key; only its private key, kept off this server, decrypts.
ensure_age() {
  command -v age >/dev/null 2>&1 && command -v age-keygen >/dev/null 2>&1 && return 0
  say 'Installing age (backup encryption) from the distribution packages.'
  install_packages age >/dev/null 2>&1 || true
  command -v age >/dev/null 2>&1 && command -v age-keygen >/dev/null 2>&1
}
# new_backup_key: make a key pair, save the public half and show the private key once. It is
# never written to this server.
new_backup_key() {
  local identity recipient answer
  identity="$(age-keygen 2>/dev/null)"
  recipient="$(printf '%s\n' "$identity" | age-keygen -y)"
  [[ "$recipient" =~ ^age1[a-z0-9]{58}$ ]] || die 'age-keygen did not produce a key.'
  conf_set "$BACKUP_SETTINGS" BACKUP_AGE_RECIPIENT "$recipient"
  cat >/dev/tty <<EOF

Backup encryption key. Store it now in your password manager or another safe place OFF this
server. It is shown only this once and is not saved here. Without it, off-site copies cannot be
restored.

$(printf '%s\n' "$identity" | grep '^AGE-SECRET-KEY-')

EOF
  while true; do
    printf 'Type SAVED once the key is stored safely: ' >/dev/tty
    IFS= read -r answer </dev/tty || die 'No terminal input.'
    [[ "${answer%$'\r'}" != SAVED ]] || break
  done
  printf '\033[2J\033[H' >/dev/tty
}
