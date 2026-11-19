#!/usr/bin/env bash
# Manage super-admin accounts on this server: create one, set or reset its password, remove its two-step
# sign-in, revoke it, or list them. Super-admin passwords are only ever set here.
#   bash scripts/admin.sh create --email you@example.org
#   bash scripts/admin.sh set-password --email you@example.org
#   bash scripts/admin.sh reset-mfa --email you@example.org
#   bash scripts/admin.sh revoke --email you@example.org
#   bash scripts/admin.sh list
#   bash scripts/admin.sh login-methods --show
#   bash scripts/admin.sh login-methods --set google,apple,github   (also password, oidc, saml, supabase, firebase; or none)
# Runs docker/ops/admin.mjs in the bundled stack's ops container (SWO_ADMIN_TOPOLOGY=cloud for the cloud stack).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
topology="${SWO_ADMIN_TOPOLOGY:-bundled}"
case "$topology" in bundled|cloud) ;; *) echo "[admin] SWO_ADMIN_TOPOLOGY must be bundled or cloud." >&2; exit 64 ;; esac
(($# > 0)) || { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 64; }
tty=()
[[ -t 0 ]] || tty=(-T)
exec "$ROOT/scripts/spaceworks-compose.sh" "$topology" run --rm ${tty[@]+"${tty[@]}"} ops --role ops node docker/ops/admin.mjs "$@"
