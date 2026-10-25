# Deploying with managed services (cloud)

The cloud topology runs only the application processes, all from the backend image, and leaves the data to
managed services: PostgreSQL with TLS, Redis over TLS, an S3-compatible bucket and an SMTP relay. It mirrors
SpaceWorks' `docker-compose.cloud.yml` and `scripts/spaceworks-compose.sh cloud`.

## What you need

| Service | Examples | Notes |
|---|---|---|
| PostgreSQL 16 | Supabase, Neon, RDS, Cloud SQL | `sslmode=require` (or `verify-full`). Behind a transaction pooler (Supabase `:6543`) add `pgbouncer=true` to `DATABASE_URL` and give the direct or session URL as `DIRECT_URL` for migrations. |
| Redis 7 | Upstash, ElastiCache, Redis Cloud | Must be `rediss://` (TLS). |
| Object storage | Cloudflare R2, Amazon S3, Backblaze B2 | A **private** bucket and a key limited to it. `S3_FORCE_PATH_STYLE=1` works with all of them. |
| SMTP | Brevo, Amazon SES, Postmark | A verified sending domain. |
| HTTPS | Your platform's load balancer, Cloudflare, or a reverse proxy | Terminates TLS in front of `APP_PORT` and overwrites the client-IP header named in `TRUSTED_PROXY_IP_HEADER`. |

### Harden the database connection

`sslmode=require` encrypts the connection but doesn't check who is at the other end. In production:

- **Verify the server.** Use `sslmode=verify-full` with your provider's CA (`sslrootcert=/path/to/ca.pem`, mounted
  read-only into the app and scheduler containers). Supabase, Neon and RDS all publish their CA bundles.
- **Run the app as a data-only role.** Migrations need the schema owner; the running app doesn't. Create a second
  role with `CONNECT`, `USAGE` on the schema and `SELECT, INSERT, UPDATE, DELETE` on its tables (plus
  `USAGE, SELECT` on sequences and `ALTER DEFAULT PRIVILEGES` so new tables follow), put that role in
  `DATABASE_URL`, and keep the owner only in `DIRECT_URL`, which only the `migrate` role uses. This is how the
  bundled VPS stack runs (`sworg_app`), and it means a compromised app process can't alter the schema or the
  payment triggers.

## Docker host with Compose

```bash
git clone https://github.com/SpaceWorks-Labs/SpaceWorks-Organization.git /opt/spaceworks-organization
cd /opt/spaceworks-organization
sudo install -D -m 600 .env.production.example /etc/spaceworks-organization/cloud.env
sudoedit /etc/spaceworks-organization/cloud.env      # fill every value; see docs/CONFIGURATION.md
export SWO_IMAGE_TAG=0.7.0-main.42.a1b2c3d4e5f6     # a published release, or latest
scripts/spaceworks-compose.sh cloud pull
scripts/spaceworks-compose.sh cloud up -d --wait
scripts/spaceworks-compose.sh cloud run --rm ops     # TLS, migrations, Redis, bucket, readiness
```

Generate the keys with `openssl rand -base64 32` (`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY`,
`PAYMENT_SECRETS_KEY`) and `openssl rand -base64 48` (`AUTH_SECRET`, `CRON_SECRET`, `HEALTHCHECK_SECRET`).
Keep an offline copy: without `MFA_ENCRYPTION_KEY` and `PAYMENT_SECRETS_KEY`, saved authenticator seeds and
gateway keys cannot be read. `SWO_STATIC_ENV_FILE` points the wrapper at another settings file.

| Service | Role |
|---|---|
| `migrate` | `--role migrate`: `prisma migrate deploy` on `DIRECT_URL` (falls back to `DATABASE_URL`), then exits |
| `backend` | `--role backend`: the app and API on `${APP_BIND:-127.0.0.1}:${APP_PORT:-8080}` |
| `scheduler` | `--role scheduler`: one scheduler pass a minute through `POST /api/internal/outbox` |
| `ops` (profile `tools`) | `--role ops`: operator checks on demand |

Block `/api/internal/*` at your edge; the endpoint also refuses any request without `CRON_SECRET`.

**Updating:** back up the database with your provider (point-in-time recovery or a snapshot), then set the new
`SWO_IMAGE_TAG` and run `pull` and `up -d --wait` again. `scripts/update.sh` is for the bundled topology.

## Render

[`render.yaml`](../render.yaml) defines a Docker web service (`sworg-backend`, health check `/api/health`,
`MIGRATE_ON_START=1`) and a worker (`sworg-scheduler`, `--role scheduler`) sharing the `sworg-prod`
environment group. Render builds the Dockerfile's last stage with your real `NEXT_PUBLIC_BASE_URL` and
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` as build arguments. Set `SWO_SCHEDULER_TARGET` on the worker to
`https://<web service host>/api/internal/outbox`. Render's own Key Value is plain `redis://`, which production
refuses, so use a TLS Redis such as Upstash.

## Other platforms

Any container platform works with the published image:

- web: `ghcr.io/spaceworks-labs/spaceworks-organization-backend:<version>` with the default command
  (`--role backend node server.js`), the variables in [CONFIGURATION.md](CONFIGURATION.md) and
  `SCHEDULER_MODE=external`;
- a release or pre-deploy job: the same image with `--role migrate`;
- a worker: the same image with `--role scheduler node docker/ops/scheduler.mjs` and `SWO_SCHEDULER_TARGET`
  set to the web service's internal URL, or leave `SCHEDULER_MODE` unset to run the scheduler inside the web
  process instead.

## Website on Netlify

Set `DEPLOYMENT_MODE=backend` and `FRONTEND_GATEWAY_SECRET` here, and `PUBLIC_APP_BASE_URL` to the website's
origin; see [DEPLOYMENT_NETLIFY.md](DEPLOYMENT_NETLIFY.md).
