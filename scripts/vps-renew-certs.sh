#!/usr/bin/env bash
# Renew the private TLS certificates of PostgreSQL, Redis and Silo (825 days, deploy/certificates.sh)
# from the install's own CA, keeping the CA and every credential, then recreate the services and
# run the operator checks. Caddy renews the public HTTPS certificates by itself.
#   bash scripts/vps-renew-certs.sh                  renew now
#   bash scripts/vps-renew-certs.sh --if-due         renew only within 60 days of expiry
#   bash scripts/vps-renew-certs.sh --install-timer  check weekly (sworg-certificates.timer, uses sudo)
set -euo pipefail
set +x
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/install-owner.sh
source "$ROOT/scripts/install-owner.sh"
require_install_owner "$ROOT/scripts/vps-renew-certs.sh" "$@"
# shellcheck source=scripts/vps-lib.sh
source "$ROOT/scripts/vps-lib.sh"
mode=renew
case "${1:-}" in
  '') ;;
  --if-due) mode=if-due ;;
  --install-timer) mode=timer ;;
  *) die 'Usage: bash scripts/vps-renew-certs.sh [--if-due | --install-timer]' ;;
esac
require_install
if [[ "$mode" == timer ]]; then
  has_systemd || { say 'No systemd here; renew with this script before the certificates expire.'; exit 0; }
  timer_enabled certificates && exit 0
  install_timer certificates 'internal certificate renewal' 'Mon *-*-* 04:00:00 UTC' vps-renew-certs.sh --if-due
  say 'Internal certificates are checked weekly and renewed two months before they expire.'
  exit 0
fi
tls="$(tls_dir)"
[[ -s "$tls/ca.key" ]] || die "No private CA in $tls."
image="$(backend_image)"
in_image() {
  MSYS_NO_PATHCONV=1 docker run --rm --network none --user "$(id -u):$(id -g)" --entrypoint sh \
    -v "$tls:/tls" -v "$ROOT/deploy/certificates.sh:/certificates.sh:ro" "$image" "$@"
}
if [[ "$mode" == if-due ]]; then
  status=0
  # shellcheck disable=SC2016 # expanded inside the container
  in_image -c 'for s in db redis minio; do [ ! -f "/tls/$s/public.crt" ] || openssl x509 -checkend 5184000 -noout -in "/tls/$s/public.crt" >/dev/null || exit 10; done' \
    || status=$?
  [[ $status != 0 ]] || exit 0
  [[ $status == 10 ]] || die 'Could not read the certificates; nothing was renewed.'
fi
take_lock
say 'Renewing the internal certificates from the existing CA.'
in_image /certificates.sh --renew || die 'Certificate renewal failed; the current certificates stay in use.'
services=(db redis)
[[ "$(conf_get "$ENV_FILE" SWO_STORAGE)" == external ]] || services+=(minio)
serving_services
say 'Restarting the services with the renewed certificates (a short interruption).'
compose up -d --wait --wait-timeout 300 --force-recreate --no-deps "${services[@]}" "${SERVING_SERVICES[@]}"
compose run --rm ops
say 'Internal certificates renewed.'
