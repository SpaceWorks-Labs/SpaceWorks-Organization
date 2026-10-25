# Security

How Space Works Organization protects an installation, and what an operator must do. Report a vulnerability
privately through GitHub's **Security → Report a vulnerability** on
[SpaceWorks-Labs/SpaceWorks-Organization](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization), not in a
public issue.

## Data in transit

- **Bundled stack:** PostgreSQL (`hostnossl … reject`), Redis (`port 0`, TLS only) and Silo accept TLS only,
  with certificates from a private CA created on the server (`deploy/certificates.sh`). Clients verify the
  hostname (`sslaccept=strict`, `rediss://`, `NODE_EXTRA_CA_CERTS`). The data network is internal: the data
  services have no route to the internet and publish no ports.
- **Public edge:** Caddy with automatic HTTPS (Let's Encrypt), HSTS from the app, and `/api/internal/*`
  blocked. Plain HTTP exists only for a LAN or trial and needs `ALLOW_PLAIN_HTTP=1`; the app refuses an
  `http://` origin otherwise.
- **Cloud:** production refuses database URLs without `sslmode=require|verify-ca|verify-full`, Redis without
  `rediss://`, and a non-HTTPS `S3_ENDPOINT`.

## Least privilege

- The app connects as `sworg_app`, which can read and write rows but owns no table and cannot create
  databases, roles or schema objects. Migrations run separately as the owner role `sworg`. The operator check
  (`--role ops`) verifies this on every install and update.
- The app's storage identity `sworg-app` can list, read, write and delete only in the private bucket; the
  bucket has no anonymous access.
- The backend and frontend images run as an unprivileged user; operator scripts and the Prisma CLI are
  root-owned and read-only inside the image.

## Secrets

- The installer generates every secret on the server and writes them to the install's `.env` (mode 600).
  Nothing secret is printed, passed on a command line, or baked into an image.
- Release images are built with a throwaway Server Actions key and placeholder origins; web roles refuse to
  start without the installation's own key.
- Authenticator seeds (`MFA_ENCRYPTION_KEY`), payment gateway secrets (`PAYMENT_SECRETS_KEY`) and provider
  secrets saved in Super admin → Settings are encrypted at rest. Losing those keys makes the saved values
  unreadable: keep an encrypted, off-server copy of `.env` and `tls/` (`bash scripts/backup.sh` archives them).
- Backups contain personal data and every secret. Copy them off the server encrypted, and restrict who can
  read `backups/`.
- Scheduler (`CRON_SECRET`) and readiness (`HEALTHCHECK_SECRET`) endpoints answer 404 without their bearer
  secret.

## Releases and automatic deploys

- The installer and updater accept only published, non-prerelease `main` releases whose tag matches
  `v<VERSION>-main.<run>.<sha>`, and pin the images to that exact version.
- This repository is public, and GitHub recommends self-hosted runners only for private repositories. The
  deploy runner controls Docker, which is root on the server. Before setting `SWO_DEPLOY=true`:
  - require approval for **all external contributors'** workflow runs;
  - protect `main` so only maintainers can merge;
  - in an organisation, limit the runner group to this repository (and to `release.yml` on
    `refs/heads/main` where your plan allows);
  - never add the `spaceworks-organization-prod` label to a `pull_request` workflow.
  The deploy job uses no checkout and no third-party actions. Keep runner auto-updates on.
- `scripts/install-runner.sh` verifies the runner download against GitHub's published SHA-256 and never echoes
  or stores the registration token.

## Application

- Tenant isolation in every query; cross-tenant access returns 404.
- Rate limits on sign-in and sensitive actions (Redis), with the client address taken only from the header
  your edge overwrites (`TRUSTED_PROXY_IP_HEADER`).
- Money rows are never edited or deleted; reversals use credit notes, and receipt numbers are gapless.

### Sign-in

- **Staff need an authenticator.** Anyone on an organisation's team (owner, manager, treasurer, viewer) must
  turn on an authenticator app before the dashboard, its actions or its exports open (`hasAuthenticator` in
  `lib/permissions.ts`). Members never need one.
- **Super admins** sign in with email and password only. Their accounts and passwords are created and changed
  only on the server (`scripts/admin.sh`); password-reset emails, in-app password changes and Google, GitHub or
  Apple sign-in are refused for them.
- **Unusual sign-ins.** Each browser that signs in is remembered by a long-lived random cookie, stored only as a
  hash (`KnownDevice`). An account without an authenticator signing in from a new browser must enter a six-digit
  code emailed to it (valid 10 minutes, single use), unless it verified its email in the last hour.
- **New-device alerts.** Every first sign-in from a new device emails the account its browser, address and time.
- **Automatic address blocking.** Twenty failed sign-ins (wrong password or code) from one address within
  15 minutes block it from signing in, signing up and requesting password resets for an hour; again within a
  week, for a day. Super admin, Security lists blocks and lifts them (`lib/ipBlock.ts`).
- **Breached passwords.** New passwords (sign-up, change, reset, the server command) found in known breaches are
  refused, via Have I Been Pwned with k-anonymity: only the first five characters of the SHA-1 hash leave the
  server. `PWNED_PASSWORDS_CHECK=0` turns it off for offline installs.
- **Organisation-entered hosts** (an organisation's SMTP relay, a self-hosted Mattermost) must resolve to public
  addresses, checked when saved and again when used, so they can't reach the server's own network.
