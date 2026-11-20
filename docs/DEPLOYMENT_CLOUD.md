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

## Background jobs: BullMQ or Inngest

Pick one per installation.

1. **BullMQ worker and beat** (servers; the default in `docker-compose.cloud.yml`, `render.yaml` and the bundled
   stack): two long-running processes from the backend image, with Redis carrying the queues. Messages go out within
   seconds. Without a beat, keep the worker and use the [cron fallback](#without-a-beat-process-cron-fallback).
2. **Inngest** (fully cloud): no worker or beat at all. Inngest calls the app on a schedule and the due jobs run
   there. See [Fully cloud with Inngest](#fully-cloud-with-inngest).

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

## Fully cloud with Inngest

On a host that runs only the web service (a free container plan, for example), [Inngest](https://www.inngest.com)
does the worker's and the beat's job. Its `run-due-jobs` function (`lib/queue/inngest.ts`) calls the app once a
minute; the app runs every scheduled job that is due (membership sweep, reconciles, digests, clean-ups) and delivers
the outbox, about five batches of 20 messages per run. Each occurrence runs once even when runs overlap: Redis claims
it, and production already needs Redis (Upstash's free plan works).

1. Create a free Inngest account and an app, and copy its **signing key**.
2. On the web service, set `INNGEST_SIGNING_KEY` (and optionally `INNGEST_JOBS_CRON` for a slower schedule). Don't
   run the worker or beat roles.
3. Deploy, then in the Inngest dashboard sync the app at `https://<your-site>/api/inngest`. The function
   **Run due background jobs** appears and runs every minute.

The SDK verifies every call from Inngest with the signing key; without the key `/api/inngest` answers 404. One run
a minute with no steps and no retries is about 44,000 executions a month, inside the free plan (check Inngest's
pricing page, which changes); `INNGEST_JOBS_CRON='*/2 * * * *'` halves it. A failed job fails that run in the
Inngest dashboard and runs again at its next occurrence. Messages go out up to a minute later than with a worker, and
a host that sleeps when idle is woken by the call.

For local testing, run `npx inngest-cli dev` and set `INNGEST_DEV=1` (never in production; the app refuses to start
with it).

### Without an Inngest account

Any online cron can do the same by calling the app once a minute:

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<backend>/api/internal/run-jobs
```

The answer is `200` with the jobs that ran, `500` when one failed, and `404` without the secret.
[`deploy/cloudflare-cron`](../deploy/cloudflare-cron) is a ready Cloudflare Worker with a one-minute cron trigger
and no public address. Set `SITE_URL` in its `wrangler.toml`, then from that folder:

```bash
npx wrangler secret put CRON_SECRET    # the app's CRON_SECRET
npx wrangler deploy
```

| Scheduler | Every minute on the free plan | Notes |
|---|---|---|
| Inngest | Yes, about 44,000 of the monthly executions | The supported fully cloud option, with a dashboard of runs |
| Cloudflare Workers cron trigger | Yes | One of five free cron triggers; code in this repository |
| cron-job.org | Yes | No code; paste the URL and add the `Authorization` header |
| Upstash QStash | No: the free plan's daily messages run out | Fine every five minutes or slower |
| Trigger.dev | No: the free plan's monthly runs run out | Fine for slower schedules |
| GitHub Actions `schedule` | No: five minutes at best, often delayed | Fine as a backup |

Use one scheduler or a worker and beat, never two at once.

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

## Sign-in options

Set the sign-in variables in the settings file or the platform's environment (see `docs/CONFIGURATION.md`):
`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`/`AUTH_GITHUB_SECRET`, `AUTH_APPLE_ID`, `AUTH_APPLE_TEAM_ID`,
`AUTH_APPLE_KEY_ID`, `AUTH_APPLE_PRIVATE_KEY`, `AUTH_SUPABASE_URL`, `AUTH_SUPABASE_ANON_KEY`, `AUTH_SUPABASE_PROVIDERS`,
`AUTH_FIREBASE_API_KEY`, `AUTH_FIREBASE_AUTH_DOMAIN`, `AUTH_FIREBASE_PROJECT_ID`, `AUTH_FIREBASE_APP_ID`,
`AUTH_FIREBASE_PROVIDERS` and, to fix the list of methods, `LOGIN_METHODS`. On Netlify set the bridge variables on
the website too: its bridge pages and content security policy read them there.
