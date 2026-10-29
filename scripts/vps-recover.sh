#!/usr/bin/env bash
# Recover super-admin access, from the installer menu. Super admins are managed only on this
# server: this runs scripts/admin.sh, which asks for any new password here with hidden input and
# never sends or prints a reset link. Every change is in the audit log and signs the account out.
# shellcheck disable=SC2154 # ask assigns answers by name
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/scripts/vps-recover.sh" "$@"
# shellcheck source=scripts/vps-lib.sh
source "$ROOT/scripts/vps-lib.sh"
require_tty
require_install
admin() { bash "$ROOT/scripts/admin.sh" "$@" </dev/tty; }

say 'Super admins on this installation:'
admin list || die 'Could not read the accounts. Check the stack with option 4 (status).'
cat >/dev/tty <<'EOF'

Recover super-admin access
  1) Lost authenticator - remove two-step sign-in from the account
  2) Forgotten password - set a new one here (hidden input)
  3) Both
  4) No super admin can sign in - create one, or make an existing account a super admin
  0) Cancel
EOF
is_choice() { [[ "$1" =~ ^[0-4]$ ]]; }
ask choice 'Choose' 0 is_choice 'Enter a number from 0 to 4.'
[[ "$choice" != 0 ]] || { say 'Cancelled. Nothing was changed.'; exit 2; }
ask email 'Super-admin email' "$(conf_get "$ENV_FILE" SUPER_ADMIN_EMAIL)" is_email 'Enter an email address.'
confirm "Change $email now? It is signed out everywhere and the change is audited." Y \
  || { say 'Cancelled. Nothing was changed.'; exit 2; }
case "$choice" in
  1) admin reset-mfa --email "$email" ;;
  2) admin set-password --email "$email" ;;
  3) admin reset-mfa --email "$email" && admin set-password --email "$email" ;;
  4) admin create --email "$email" ;;
esac
say 'Sign in at /login. If you removed the authenticator, add a new one from your account settings.'
