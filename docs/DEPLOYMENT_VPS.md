# Deploying on a server (VPS)

The bundled deployment runs the whole platform on one Linux server with Docker Compose, exactly like a
standalone SpaceWorks install: the curl installer, `setup.sh`, `scripts/update.sh` and
`scripts/spaceworks-compose.sh bundled`. Assume a dedicated server: the installer's Caddy takes ports 80 and 443.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/SpaceWorks-Labs/SpaceWorks-Organization/main/install.sh | bash
```

The installer checks the host (architecture, distribution, Docker, disk space, an existing install), asks which
GitHub repository to follow, downloads the newest published `main` release into temporary storage and asks the
deployment questions (see the README). Nothing changes until you confirm the summary. Then it installs missing
packages (Docker Engine, the Compose plugin, curl, tar), copies the release to `/opt/spaceworks-organization`
and runs `setup.sh`, which:

1. writes the owner-only `.env` with every generated secret (`scripts/setup-write-environment.sh`);
2. pulls the release images (or builds them with `bash setup.sh --build`);
3. creates a private CA and service certificates for PostgreSQL, Redis and Silo in `tls/`
   (`deploy/certificates.sh`, run inside the backend image so the host needs no openssl);
4. starts the stack with `up --wait` and runs the operator checks (`--role ops`);
5. installs the optional GitHub Actions runner.

On Linux with systemd the installer then schedules the weekly internal-certificate check (see
[Certificates](#certificates)). Options: `--repo owner/name` (or `SWO_REPOSITORY`), `SWO_DIR=/path` for another
install directory, `--help`.

## The installer menu

Run the same curl command on an installed server and it offers every operation. Each option runs a script of
the installed release as the install owner (with `sudo` only for host changes), so you can also run it
directly from the install directory:

| Option | Script | What it does |
|---|---|---|
| 1 Update | `scripts/update.sh --force` | See [Updates and rollback](#updates-and-rollback). |
| 2 Back up now | `scripts/backup.sh` | Dump, bucket mirror and settings archive into `backups/`. |
| 3 Roll back | `scripts/update.sh --force --rollback` | The release before the last update. |
| 4 Status and health | `scripts/vps-status.sh` | Release, disk, newest dumps, off-site status, timers, certificate expiry, every service's state and health (backend, worker, beat, db, redis, minio, caddy, backup), the public address, then the operator checks. Changes nothing. |
| 5 Backups | `scripts/vps-backup-settings.sh` | Backup interval and retention, encryption key, off-site copies. |
| 6 Change settings | `scripts/vps-reconfigure.sh` | Web address, outgoing email or external bucket keys, rolled back automatically if the checks fail. |
| 7 Server security | `scripts/vps-harden.sh [--all]` | Firewall (SSH, HTTP, HTTPS only), automatic security updates, fail2ban. |
| 8 Automatic deploys | `scripts/install-runner.sh [--remove]` | See [Updates and rollback](#updates-and-rollback). |
| 9 Recover super-admin access | `scripts/vps-recover.sh` | Lost authenticator or password, through `scripts/admin.sh`. |
| 10 Support bundle | `scripts/vps-support.sh` | Report and logs with secrets redacted, in `support/`. |
| 11 Uninstall | `scripts/vps-uninstall.sh` | See [Uninstalling](#uninstalling). |

A release older than an option says so; update first (option 1).

## What runs

`scripts/spaceworks-compose.sh bundled` always uses `docker-compose.prod.yml`, the install's `.env`, the
project name `sworg`, and the overlays the settings select:

| Setting in `.env` | Overlay | Effect |
|---|---|---|
| `SWO_LAYER='none'` | none | Caddy serves `http://<host>` on port 80 (plain HTTP, LAN or trial). |
| `SWO_LAYER='tls'` | `docker/compose.tls.yml` | Caddy obtains Let's Encrypt certificates and also serves 443 (TCP and QUIC). |
| `SWO_LAYER='proxy'` | `docker/compose.proxy.yml` | No Caddy; the app listens on `127.0.0.1:8080` for your proxy. |
| `SWO_STORAGE='external'` | `docker/compose.external-storage.yml` | No Silo; files go to the `S3_*` bucket. |
| `SWO_COMPOSE_BUILD_LAYER=1` (shell) | `docker/compose.build.yml` | Builds the backend image from the checkout. |

| Service | Image | Role |
|---|---|---|
| `db` | `postgres:16-alpine` | TLS only (`hostnossl … reject`), owner role `sworg`, runtime role `sworg_app` with data rights only |
| `redis` | `redis:7-alpine` | TLS only, password, append-only file |
| `minio` | `pgsty/silo` | TLS only, private bucket `spaceworks-organization`, versioning on |
| `createbuckets` | `pgsty/silo` | Creates the bucket and the `sworg-app` identity limited to it, then exits |
| `migrate` | backend, `--role migrate` | `prisma migrate deploy` as the owner role, then exits |
| `backend` | backend, `--role backend` | The app and API (Next.js) as `sworg_app` |
| `worker` | backend, `--role worker` | BullMQ worker (`dist/worker.js`): email and chat delivery, the membership sweep, payment checks, retention and every job in `lib/queue/registry.ts`; health on `:3460/health` |
| `beat` | backend, `--role beat` | BullMQ beat (`dist/beat.js`): keeps the repeatable schedules in Redis (outbox and membership sweep every minute); health on `:3460/health` |
| `backup`, `backup-storage` | `postgres:16-alpine`, `pgsty/silo` | Scheduled database dumps and bucket mirror into `backups/` |
| `caddy` | `caddy:2-alpine` | The web edge; blocks `/api/internal/*`; overwrites `X-Real-IP` |
| `ops` (profile `tools`) | backend, `--role ops` | Operator checks, run on demand |

The data services sit on an internal network with no route to the internet. The backend, worker and beat also
join the edge network, so they can reach SMTP relays, payment gateways and chat services. Only Caddy publishes
ports.

```bash
scripts/spaceworks-compose.sh bundled ps
scripts/spaceworks-compose.sh bundled logs -f backend worker beat
scripts/spaceworks-compose.sh bundled run --rm ops      # TLS, roles, migrations, Redis, bucket, readiness
```

## Files on the server

| Path | Contents |
|---|---|
| `/opt/spaceworks-organization/` | The installed release (compose files, `deploy/`, `scripts/`) |
| `.env` | Every setting and secret (mode 600). Back it up encrypted, off the server. |
| `tls/` | The private CA (`ca.key` never leaves this folder) and the service certificates |
| `backups/` | Database dumps, the bucket mirror, settings archives, replaced host files, `offsite-status` |
| `backup.env` | Backup encryption and off-site settings (mode 600; written by menu option 5) |
| `support/` | Support bundles (menu option 10) |
| `.spaceworks-version`, `.spaceworks-previous-version` | The running release and the one before it |

## Backups and restore

- **Scheduled:** the `backup` service dumps the database every `BACKUP_INTERVAL_HOURS` (24) to
  `backups/scheduled-<time>.sql.gz` and keeps `BACKUP_RETENTION_DAYS` (14); `backup-storage` mirrors the bucket
  to `backups/storage`.
- **On demand:** `bash scripts/backup.sh` (also the installer's menu option 2) writes a dump, refreshes the
  bucket mirror and archives `.env` and `tls/` to `backups/config-<time>.tar.gz`.
- **Before every update:** `backups/pre-update-<time>.sql.gz`.

Backups contain every secret. Copy them off the server, encrypted: menu option 5 does it every night.

The backup service's interval and retention are `BACKUP_INTERVAL_HOURS` and `BACKUP_RETENTION_DAYS` in `.env`;
option 5 changes them and restarts the services that read them.

### Encrypted off-site copies

Option 5 first makes an [age](https://age-encryption.org) key: the public half is saved in `backup.env`, the
private half is shown once and never stored on the server. Keep it in a password manager. Then it asks for an
S3-compatible bucket at another provider (endpoint, optional private CA, bucket, folder, a key limited to that
bucket, days to keep), checks the bucket is reachable and schedules `sworg-offsite-backup.timer` (every night at
about 03:30 UTC). Each run of `scripts/vps-offsite-backup.sh` uploads a folder named after its UTC time:

| File | Contents |
|---|---|
| `database.sql.gz.age` | A fresh dump, taken while the stack runs |
| `settings.tar.gz.age` | `.env`, `tls/` and `backup.env` |
| `storage.tar.age` | The bucket mirror (bundled Silo only; back up an external bucket with its provider) |

Every file is encrypted on the way out; nothing unencrypted leaves the server. Local `backups/` stay as they are
(owner-only). Copies older than the chosen days are removed from the bucket. Option 4 shows the last result.

```bash
bash scripts/vps-offsite-backup.sh --fetch 20261029T033012Z      # into backups/offsite/20261029T033012Z/
cd backups/offsite/20261029T033012Z
age -d -i key.txt database.sql.gz.age > ../../offsite-20261029T033012Z.sql.gz
age -d -i key.txt settings.tar.gz.age | tar -xz -C /somewhere/private
age -d -i key.txt storage.tar.age | tar -x -C /somewhere/private   # files for backups/storage
```

Then restore the dump with `bash scripts/restore.sh backups/offsite-20261029T033012Z.sql.gz`. Remove `key.txt`
from the server afterwards.

```bash
bash scripts/restore.sh backups/scheduled-20261020T020000Z.sql.gz                 # database only
bash scripts/restore.sh backups/manual-20261020T090000Z.sql.gz --with-storage     # and the files
```

Restore asks you to type `RESTORE`, takes a fresh `pre-restore` dump, stops the app, worker, beat and edge,
replaces the schema in one transaction, optionally copies the files back, and starts everything again;
migrations bring an older dump up to the running release.

### Restore on a new server

Install with the same answers, stop the stack, put the old `.env` and `tls/` back from the settings archive
(or an off-site `settings.tar.gz.age`), start it, then restore the dump (and `backups/storage` with
`--with-storage`).

### Uninstalling

Option 11 asks you to type `UNINSTALL`, then whether to erase everything (`DELETE DATA`). By default it takes a
final backup, removes the runner registration, the timers, the containers, the images and the install
directory, and keeps the data volumes (`sworg_*`) and `.env`, `tls/`, `backup.env`, `.spaceworks-version` and
`backups/` in `/opt/spaceworks-organization.kept-<time>`. Docker and any server hardening stay.

**Reinstall after uninstalling** with the kept data: download the kept release into the install directory, put
the kept files back and start it.

```bash
kept=$(ls -d /opt/spaceworks-organization.kept-* | tail -n 1)
version=$(cat "$kept/.spaceworks-version")
sudo mkdir /opt/spaceworks-organization && sudo chown "$(id -u):$(id -g)" /opt/spaceworks-organization
curl -fsSL "https://github.com/SpaceWorks-Labs/SpaceWorks-Organization/archive/refs/tags/v$version.tar.gz" \
  | tar -xz --strip-components=1 -C /opt/spaceworks-organization
sudo mv "$kept"/.env "$kept"/tls "$kept"/backups "$kept"/.spaceworks-version /opt/spaceworks-organization/
cd /opt/spaceworks-organization && sudo chown -R "$(id -u):$(id -g)" .env tls .spaceworks-version
scripts/spaceworks-compose.sh bundled up -d --wait && scripts/spaceworks-compose.sh bundled run --rm ops
```

For a clean start instead, remove the volumes
(`docker volume rm $(docker volume ls -q --filter label=com.docker.compose.project=sworg)`) and follow
[Restore on a new server](#restore-on-a-new-server).

## Super admins

Super admins sign in with their email and password only. Their accounts and passwords are managed on the
server, never by email and never in the app:

```bash
bash scripts/admin.sh create --email you@example.org          # make (or promote) a super admin; asks for a password
bash scripts/admin.sh set-password --email you@example.org    # change a super admin's password; signs them out everywhere
bash scripts/admin.sh reset-mfa --email you@example.org       # remove an authenticator from a super-admin account
bash scripts/admin.sh revoke --email you@example.org          # take super-admin access away
bash scripts/admin.sh list
```

**Lost access** (menu option 9, `scripts/vps-recover.sh`) lists the super admins, then removes a lost
authenticator, sets a new password with hidden input on this terminal, does both, or creates a super admin,
all through `scripts/admin.sh`. It never sends or prints a reset link; each change signs the account out and is
audited.

The installer creates the first one from the email and password you give. On an upgrade from 0.6 or earlier,
the existing `SUPER_ADMIN_EMAIL` account is kept as super admin automatically. Without Docker
(`npm run admin -- …`) the same commands run against `DATABASE_URL`.

## Updates and rollback

```bash
bash scripts/update.sh --force                                   # newest main release
bash scripts/update.sh --force --version 0.8.0-main.42.a1b2c3d4e5f6
bash scripts/update.sh --rollback                                # the release before the last update
```

The updater takes a lock (`flock`, or a PID lock on Git Bash; `--override-lock` clears a verified stale one),
resolves a published, non-prerelease `main` release, downloads its source and hands over to that release's own
updater. It dumps the database, checks the new image can be pulled, installs the release's host files (keeping
the old ones in `backups/host-config-*`), pulls the images, runs migrations and waits for every service to be
healthy, then runs the operator checks.

- **Automatic rollback:** if the new release does not become healthy, the previous host files and images come
  back with `--no-deps`, so older migrations never run against the newer schema.
- **Manual rollback:** `--rollback` returns to the release recorded in `.spaceworks-previous-version`, again
  without running migrations. Database changes stay; to return the data too, restore the pre-update dump the
  command prints.

The installer menu offers both (options 1 and 3), and the release workflow's `deploy` job runs
`update.sh --force --version <release>` on a server with the runner (`scripts/install-runner.sh`).

## Certificates

The service certificates of PostgreSQL, Redis and Silo last 825 days (the private CA ten years). On Linux with
systemd the installer schedules `sworg-certificates.timer` (Mondays at about 04:00 UTC), which runs
`scripts/vps-renew-certs.sh --if-due`: within 60 days of expiry it reissues them from the same CA, recreates the
data services, the app, worker, beat and Caddy, and runs the operator checks. Option 4 shows the expiry date.

```bash
bash scripts/vps-renew-certs.sh                   # renew now
bash scripts/vps-renew-certs.sh --install-timer   # schedule the weekly check (installs made without the installer)
```

Caddy renews the public certificates by itself.

## Changing settings

Option 6 (`scripts/vps-reconfigure.sh`) changes the web address (host name or domain for the HTTPS mode chosen
at install, and the Netlify website origin for a backend-only server), outgoing email (sender, SMTP host, port,
login, password) or an external bucket's keys. It takes a `pre-settings` database dump, keeps `.env.previous`,
writes the new values, recreates the services and runs the operator checks; if anything fails, the previous
`.env` comes back and the stack restarts. Changing the address signs everyone out, and links already sent keep
the old one. Changing the HTTPS mode or the storage is in [Moving between modes](#moving-between-modes).

## Server security

Option 7 (`scripts/vps-harden.sh`, `--all` without questions) asks for each step: ufw (Debian/Ubuntu) or
firewalld allowing only the SSH ports `sshd` listens on, HTTP and HTTPS (left alone if the SSH port cannot be
found); unattended-upgrades or dnf-automatic for security fixes; and fail2ban banning an address for an hour
after five failed SSH logins. Docker publishes its own ports past ufw; this stack publishes only 80 and 443, or
`127.0.0.1:8080` behind your proxy.

## Moving between modes

- **Plain HTTP to automatic HTTPS:** point DNS at the server, then in `.env` set `SWO_LAYER='tls'`,
  `SITE_ADDRESS='<domain>'`, `TLS_EMAIL='<you>'`, `PUBLIC_APP_BASE_URL='https://<domain>'` and remove
  `ALLOW_PLAIN_HTTP`, then `scripts/spaceworks-compose.sh bundled up -d`.
- **Website on Netlify:** set `DEPLOYMENT_MODE='backend'`, a 64-hex `FRONTEND_GATEWAY_SECRET` and
  `PUBLIC_APP_BASE_URL` to the website's origin; see [DEPLOYMENT_NETLIFY.md](DEPLOYMENT_NETLIFY.md).

## Troubleshooting

- Start with option 4 (`bash scripts/vps-status.sh`): it names every failing service and check. Option 10
  (`bash scripts/vps-support.sh`) collects the same with the last 500 log lines of each service, secrets
  redacted, into `support/`; read it before sharing, as logs can hold email and IP addresses.

- `scripts/spaceworks-compose.sh bundled logs migrate` shows a failed migration; the app never starts on a
  half-migrated database.
- The worker and beat are healthy only while their Redis heartbeat is fresh; `logs worker beat` shows a
  Redis or database connection problem. A worker that is up but sends nothing usually means beat is down:
  check `ps` for both.
- `run --rm ops` names the failing check without printing any connection detail; it also checks the worker's
  and beat's `/health` on `JOBS_HEALTH_PORT`.
