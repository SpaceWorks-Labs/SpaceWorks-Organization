# Deploying with managed services (cloud)

The cloud topology runs only the application processes, all from the backend image, and leaves the data to
managed services: PostgreSQL with TLS, Redis over TLS, an S3-compatible bucket and an SMTP relay. It mirrors
SpaceWorks' `docker-compose.cloud.yml` and `scripts/spaceworks-compose.sh cloud`.

## What you need

| Service | Examples | Notes |
|---|---|---|
| PostgreSQL 16 | Supabase, Neon, RDS, Cloud SQL | `sslmode=require` (or `verify-full`). Behind a transaction pooler (Supabase `:6543`) add `pgbouncer=true` to `DATABASE_URL` and give the direct or session URL as `DIRECT_URL` for migrations. |
| Redis 7 | Upstash, ElastiCache, Redis Cloud | Must be `rediss://` (TLS). Holds rate limits and the BullMQ queues, so choose a plan without eviction (`noeviction`) and with room for steady polling by the worker. |
| Object storage | Cloudflare R2, Amazon S3, Backblaze B2 | A **private** bucket and a key limited to it. `S3_FORCE_PATH_STYLE=1` works with all of them. |
| SMTP | Brevo, Amazon SES, Postmark | A verified sending domain. |
| HTTPS | Your platform's load balancer, Cloudflare, or a reverse proxy | Terminates TLS in front of `APP_PORT` and overwrites the client-IP header named in `TRUSTED_PROXY_IP_HEADER`. |

### Harden the database connection

`sslmode=require` encrypts the connection but doesn't check who is at the other end. In production:

- **Verify the server.** Use `sslmode=verify-full` with your provider's CA (`sslrootcert=/path/to/ca.pem`, mounted
  read-only into the app, worker and beat containers). Supabase, Neon and RDS all publish their CA bundles.
- **Run the app as a data-only role.** Migrations need the schema owner; the running app doesn't. Create a second
  role with `CONNECT`, `USAGE` on the schema and `SELECT, INSERT, UPDATE, DELETE` on its tables (plus
  `USAGE, SELECT` on sequences and `ALTER DEFAULT PRIVILEGES` so new tables follow), put that role in
  `DATABASE_URL`, and keep the owner only in `DIRECT_URL`, which only the `migrate` role uses. This is how the
  bundled VPS stack runs (`sworg_app`), and it means a compromised app process can't alter the schema or the
  payment triggers.

### Object storage on Cloudflare R2

Create a bucket (keep public access off) and an R2 API token with **Object Read & Write** for that bucket only, then:

```bash
S3_ENDPOINT='https://<account-id>.r2.cloudflarestorage.com'
S3_REGION='auto'
S3_BUCKET='spaceworks-organization'
S3_ACCESS_KEY_ID='<token access key id>'
S3_SECRET_ACCESS_KEY='<token secret access key>'
S3_FORCE_PATH_STYLE='1'
```

Files are served through the application (`/api/uploads`), so the bucket needs no public URL or CORS rules. Member
photos sit under `organisations/<org>/members/<member>/`; cards are drawn on demand and never stored. Any other
S3-compatible store works the same way (see [Configuration](CONFIGURATION.md#object-storage)).

## Docker host with Compose

```bash
git clone https://github.com/SpaceWorks-Labs/SpaceWorks-Organization.git /opt/spaceworks-organization
cd /opt/spaceworks-organization
sudo install -D -m 600 .env.production.example /etc/spaceworks-organization/cloud.env
sudoedit /etc/spaceworks-organization/cloud.env      # fill every value; see docs/CONFIGURATION.md
export SWO_IMAGE_TAG=0.8.0-main.42.a1b2c3d4e5f6     # a published release, or latest
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
| `worker` | `--role worker node dist/worker.js`: runs every queued job (email and chat delivery, the membership sweep, payment checks, retention, the registry in `lib/queue/registry.ts`); health on `:3460/health` |
| `beat` | `--role beat node dist/beat.js`: keeps the repeatable schedules in Redis; health on `:3460/health` |
| `ops` (profile `tools`) | `--role ops`: operator checks on demand |

Block `/api/internal/*` at your edge; the endpoints also refuse any request without `CRON_SECRET`. One
beat is enough; more workers share the load, and a second beat does no harm.

**Updating:** back up the database with your provider (point-in-time recovery or a snapshot), then set the new
`SWO_IMAGE_TAG` and run `pull` and `up -d --wait` again. `scripts/update.sh` is for the bundled topology.

## Render

[`render.yaml`](../render.yaml) defines a Docker web service (`sworg-backend`, health check `/api/health`,
`MIGRATE_ON_START=1`) and two background workers, `sworg-worker` (`--role worker node dist/worker.js`) and
`sworg-beat` (`--role beat node dist/beat.js`), sharing the `sworg-prod` environment group. Render builds the
Dockerfile's last stage with your real `NEXT_PUBLIC_BASE_URL` and `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` as build
arguments. Render's own Key Value is plain `redis://`, which production refuses, so use a TLS Redis such as
Upstash.

Render background workers need a paid plan. Without them, keep at least the worker (it does the delivery) and
replace beat with the cron fallback below.

## Without a beat process (cron fallback)

Hosts that cannot keep a long-running beat call two endpoints once a minute from any cron service (a Render cron
job, GitHub Actions, a systemd timer):

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<backend>/api/internal/jobs
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<backend>/api/internal/outbox
```

`/api/internal/jobs` queues the registry's due jobs and `/api/internal/outbox` queues due outbox rows; a worker
still has to run to do the work. Repeated calls within the same minute are harmless. Both answer 404 without
the secret, so the calls must reach the backend directly, not through an edge that blocks `/api/internal/*`.

## Other platforms

Any container platform works with the published image:

- web: `ghcr.io/spaceworks-labs/spaceworks-organization-backend:<version>` with the default command
  (`--role backend node server.js`) and the variables in [CONFIGURATION.md](CONFIGURATION.md);
- a release or pre-deploy job: the same image with `--role migrate`;
- a background worker: the same image with `--role worker node dist/worker.js`;
- a second background process: the same image with `--role beat node dist/beat.js`, or the cron fallback above.

The worker and beat need the same settings as the web service (database, Redis, SMTP, storage, keys); they
listen on `JOBS_HEALTH_PORT` (3460) for `GET /health`, which a platform health check can use.

## Website on Netlify

Set `DEPLOYMENT_MODE=backend` and `FRONTEND_GATEWAY_SECRET` here, and `PUBLIC_APP_BASE_URL` to the website's
origin; see [DEPLOYMENT_NETLIFY.md](DEPLOYMENT_NETLIFY.md).
