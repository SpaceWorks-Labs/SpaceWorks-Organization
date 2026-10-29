#!/usr/bin/env bash
# Shared helpers for the server tools behind the installer menu (scripts/vps-*.sh). Sourced, never
# executed, after require_install_owner: the tools run as the install owner and use sudo only for
# host changes (systemd timers, packages). Prompts read the terminal directly, because the installer
# itself arrives through `curl | bash`.
# shellcheck shell=bash
# shellcheck source=scripts/spaceworks-repository.sh
source "$ROOT/scripts/spaceworks-repository.sh"
# shellcheck source=scripts/setup-question-input.sh
source "$ROOT/scripts/setup-question-input.sh"
export SWO_UPDATE_INSTALL_DIR="$ROOT"
ENV_FILE="${SWO_STATIC_ENV_FILE:-$ROOT/.env}"
# Backup encryption and off-site settings: owner-only, parsed with conf_get, never sourced.
BACKUP_SETTINGS="$ROOT/backup.env"
COMPOSE=(bash "$ROOT/scripts/spaceworks-compose.sh" bundled)

say() { printf '[Space Works] %s\n' "$*"; }
warn() { printf '[Space Works] WARNING: %s\n' "$*" >&2; }
die() { printf '[Space Works] ERROR: %s\n' "$*" >&2; exit 1; }
require_tty() { { : </dev/tty; } 2>/dev/null || die 'An interactive terminal is required.'; }
require_install() { [[ -f "$ENV_FILE" ]] || die "No installation settings in $ENV_FILE."; }
as_root() {
  if [[ "$(id -u)" == 0 ]]; then "$@"; return; fi
  command -v sudo >/dev/null 2>&1 || die 'This step needs root. Install sudo or run it as root.'
  sudo "$@"
}

# The tools never attach a terminal to a container: timers and the installer run them without one.
compose() {
  case "${1:-}" in
    run|exec) local command="$1"; shift; "${COMPOSE[@]}" "$command" -T "$@" ;;
    *) "${COMPOSE[@]}" "$@" ;;
  esac
}

# Values in .env and backup.env; parsed, never sourced.
conf_get() {
  local value
  [[ -f "$1" ]] || return 0
  value="$(sed -n "s/^$2=//p" "$1" | tail -n 1 | tr -d '\r')"
  if [[ "$value" == \'*\' || "$value" == \"*\" ]]; then value="${value:1:${#value}-2}"; fi
  printf '%s' "$value"
}
# Single quotes stop Compose interpolation; quotes and backslashes are escaped like setup does.
conf_set() {
  local file="$1" key="$2" value="$3"
  value="${value//\\/\\\\}"
  value="${value//\'/\\\'}"
  ( umask 077; { grep -v "^$key=" "$file" 2>/dev/null || true; printf "%s='%s'\n" "$key" "$value"; } > "$file.new" )
  chmod 600 "$file.new"
  mv -f -- "$file.new" "$file"
}
conf_unset() {
  [[ -f "$1" ]] || return 0
  ( umask 077; { grep -v "^$2=" "$1" || true; } > "$1.new" )
  chmod 600 "$1.new"
  mv -f -- "$1.new" "$1"
}

# ask VAR "Question" DEFAULT VALIDATOR "Hint": asked again until the validator accepts it.
ask() {
  local var="$1" question="$2" default="${3-}" check="${4:-is_nonempty}" hint="${5:-Enter a valid value.}" reply
  while true; do
    if [[ -n "$default" ]]; then printf '%s [%s]: ' "$question" "$default" >/dev/tty
    else printf '%s: ' "$question" >/dev/tty; fi
    IFS= read -r reply </dev/tty || die 'No terminal input; run this in an interactive terminal.'
    reply="${reply%$'\r'}"
    reply="${reply:-$default}"
    if "$check" "$reply"; then printf -v "$var" '%s' "$reply"; return 0; fi
    printf '  %s\n' "$hint" >/dev/tty
  done
}
ask_secret() {
  local var="$1" question="$2" check="${3:-is_line}" reply
  while true; do
    printf '%s: ' "$question" >/dev/tty
    IFS= read -r -s reply </dev/tty || die 'No terminal input; run this in an interactive terminal.'
    printf '\n' >/dev/tty
    reply="${reply%$'\r'}"
    if "$check" "$reply"; then printf -v "$var" '%s' "$reply"; return 0; fi
    printf '  A value is required, on one line.\n' >/dev/tty
  done
}
# confirm "Question" Y|N: succeeds on yes; Enter takes the default.
confirm() {
  local default="${2:-N}" reply
  while true; do
    if [[ "$default" == Y ]]; then printf '%s [Y/n]: ' "$1" >/dev/tty; else printf '%s [y/N]: ' "$1" >/dev/tty; fi
    IFS= read -r reply </dev/tty || die 'No terminal input; run this in an interactive terminal.'
    case "${reply%$'\r'}" in
      '') [[ "$default" == Y ]]; return ;;
      [Yy]|[Yy][Ee][Ss]) return 0 ;;
      [Nn]|[Nn][Oo]) return 1 ;;
    esac
    printf '  Answer y or n.\n' >/dev/tty
  done
}

is_nonempty() { [[ -n "${1//[[:space:]]/}" ]]; }
is_line() { is_nonempty "$1" && [[ ! "$1" =~ [[:cntrl:]] ]]; }
# backup.env values hold no quotes or backslashes, so they read back exactly.
is_plain() { is_line "$1" && [[ "$1" != *[\'\\]* ]]; }
is_host() { valid_dns_host "$1"; }
is_domain() { [[ "$1" == *.* && ! "${1##*.}" =~ ^[0-9]+$ ]] && valid_dns_host "$1"; }
is_origin() { [[ "$1" =~ ^https://[a-zA-Z0-9.-]+$ ]] && valid_dns_host "${1#https://}"; }
is_email() { [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; }
is_sender() {
  local named='^[^<>]*[<][^[:space:]@<>]+@[^[:space:]@<>]+[.][^[:space:]@<>]+[>]$'
  is_line "$1" && { [[ "$1" =~ $named ]] || is_email "$1"; }
}
is_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && ((10#$1 >= 1 && 10#$1 <= 65535)); }
is_days() { [[ "$1" =~ ^[1-9][0-9]{0,3}$ ]]; }
is_hours() { [[ "$1" =~ ^[1-9][0-9]{0,2}$ ]] && ((10#$1 <= 168)); }
is_https_endpoint() { [[ "$1" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]]; }
is_bucket() { [[ "$1" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ && "$1" != *..* ]]; }
is_prefix() { [[ "$1" =~ ^[A-Za-z0-9._-]{1,64}$ ]]; }
is_ca_file() { [[ "$1" == none ]] || { [[ "$1" == /* && -f "$1" && -r "$1" ]] && grep -q 'BEGIN CERTIFICATE' "$1"; }; }

# Directories as Compose resolves them (relative to the install).
install_path() {
  local value
  value="$(conf_get "$ENV_FILE" "$1")"
  value="${!1:-${value:-$2}}"
  [[ "$value" == /* ]] || value="$ROOT/${value#./}"
  printf '%s' "$value"
}
backup_dir() { install_path SWO_BACKUP_DIR ./backups; }
tls_dir() { install_path SWO_TLS_DIR ./tls; }

# The backend image of the running release (it carries openssl and the operator tools).
backend_image() {
  local tag="${SWO_IMAGE_TAG:-}"
  [[ -n "$tag" || ! -f "$ROOT/.spaceworks-version" ]] || tag="$(tr -d '[:space:]' < "$ROOT/.spaceworks-version")"
  configure_release_repository >/dev/null || die 'Invalid GitHub repository in the settings.'
  printf '%s:%s' "$SWO_BACKEND_IMAGE" "${tag:-latest}"
}
# The Silo image of the compose file: its mc client talks to S3 buckets without host packages.
silo_image() {
  local tag
  tag="${SILO_IMAGE_TAG:-$(conf_get "$ENV_FILE" SILO_IMAGE_TAG)}"
  [[ -n "$tag" ]] || tag="$(sed -n 's/.*pgsty\/silo:\${SILO_IMAGE_TAG:-\([^}]*\)}.*/\1/p' "$ROOT/docker-compose.prod.yml" | head -n 1)"
  printf 'pgsty/silo:%s' "$tag"
}

# One update, settings change, certificate renewal or off-site copy at a time (the updater's lock file).
take_lock() {
  [[ "${SWO_OPERATION_LOCK_HELD:-0}" != 1 ]] || return 0
  command -v flock >/dev/null 2>&1 || return 0
  exec 8>"$ROOT/.spaceworks-operation.lock"
  flock -n 8 || die 'Another update, backup or settings change is running. Try again when it finishes.'
  export SWO_OPERATION_LOCK_HELD=1
}

os_family() {
  # shellcheck disable=SC1091
  ( . /etc/os-release 2>/dev/null
    case " ${ID:-} ${ID_LIKE:-} " in
      *" debian "*|*" ubuntu "*) echo debian ;;
      *" fedora "*|*" rhel "*|*" centos "*|*" rocky "*|*" almalinux "*) echo rhel ;;
      *" arch "*|*" manjaro "*) echo arch ;;
      *" suse "*|*" opensuse "*|*" sles "*) echo suse ;;
      *) echo other ;;
    esac )
}
install_packages() {
  case "$(os_family)" in
    debian) as_root env DEBIAN_FRONTEND=noninteractive apt-get update -qq \
      && as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" ;;
    rhel) as_root dnf install -y "$@" 2>/dev/null || as_root yum install -y "$@" ;;
    arch) as_root pacman -Sy --noconfirm --needed "$@" ;;
    suse) as_root zypper --non-interactive install "$@" ;;
    *) return 1 ;;
  esac
}

has_systemd() { [[ "$(uname -s)" == Linux ]] && command -v systemctl >/dev/null 2>&1 && [[ -d /run/systemd/system ]]; }
timer_enabled() { has_systemd && systemctl is-enabled --quiet "sworg-$1.timer" 2>/dev/null; }
# install_timer NAME "Description" ONCALENDAR SCRIPT [ARGS...]: runs a script of this install as
# its owner. Updates replace the script in place, so the unit never needs rewriting.
install_timer() {
  local name="$1" description="$2" calendar="$3" command
  shift 3
  has_systemd || die 'Scheduling needs systemd.'
  [[ "$ROOT" =~ ^/[A-Za-z0-9/._-]+$ ]] || die 'Timers need an install path of letters, digits, dots, hyphens and slashes.'
  command="/bin/bash $ROOT/scripts/$*"
  as_root tee "/etc/systemd/system/sworg-$name.service" >/dev/null <<EOF
[Unit]
Description=Space Works Organization: $description
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=$(stat -c %U "$ROOT")
ExecStart=$command
EOF
  as_root tee "/etc/systemd/system/sworg-$name.timer" >/dev/null <<EOF
[Unit]
Description=Space Works Organization: $description

[Timer]
OnCalendar=$calendar
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
EOF
  as_root systemctl daemon-reload
  as_root systemctl enable --now "sworg-$name.timer" >/dev/null 2>&1
}
remove_timer() {
  has_systemd || return 0
  [[ -f "/etc/systemd/system/sworg-$1.timer" ]] || return 0
  as_root systemctl disable --now "sworg-$1.timer" >/dev/null 2>&1 || true
  as_root rm -f "/etc/systemd/system/sworg-$1.timer" "/etc/systemd/system/sworg-$1.service"
  as_root systemctl daemon-reload
}

# shellcheck source=scripts/vps-offsite-lib.sh
source "$ROOT/scripts/vps-offsite-lib.sh"
