# Architecture

## Application

One Next.js 16 application (App Router, React Server Components, Server Actions) with Prisma 6 on
PostgreSQL 16. Organisations are tenants: every tenant row carries `organisationId`, every query is scoped
through the organisation resolved for the request, and cross-tenant access returns 404. There is no database
row-level security; isolation is enforced in the application.

| Area | Where |
|---|---|
| Pages and Server Actions | `app/`, `components/`, `lib/views/` |
| Domain logic (memberships, money, receipts) | `lib/membership/`, `lib/money/` |
| Sign-in | Auth.js v5 (`lib/auth.ts`), email + password, authenticator MFA, Google, GitHub, Apple |
| Email | Nodemailer behind a database outbox (`lib/outbox.ts`) |
| Files | S3-compatible storage (`lib/storage/`), served through `/api/uploads/...` |
| Rate limits | Redis (`lib/rateLimit.ts`) |
| Read cache | Redis (`lib/cache.ts`), see "Read cache" below |
| Start-up validation | `lib/env.ts`, called from `instrumentation.ts` |
| Background jobs | BullMQ on Redis (`lib/queue/`), see "Background jobs" below |

### Background jobs

Background work runs on BullMQ in two processes built from the backend image:

- **`beat`** (`scripts/queue/beat.ts`, `dist/beat.js`) upserts the repeatable schedules from
  `SCHEDULED_JOBS` in `lib/queue/registry.ts` once per start, and removes schedules whose entry is gone.
- **`worker`** (`scripts/queue/worker.ts`, `dist/worker.js`) runs every queue: registry entries by name, and
  outbox rows one id at a time.

| Queue | Carries | Default concurrency |
|---|---|---|
| `outbox` | Email and chat outbox rows, by id, and the `outbox-relay` entry | 5 |
| `scheduled` | Every other periodic registry entry | 2 |

| Registry entry | Every | Work |
|---|---|---|
| `outbox-relay` | minute | Queue due outbox rows (and stale claims) by id |
| `membership-sweep` | minute | Term statuses, renewal reminders, the report rollup |
| `payment-reconcile`, `refund-reconcile` | 5 minutes | Ask Razorpay or Stripe about open gateway payments and refunds |
| `monthly-digest` | hour | The monthly summary, once per organisation and month |
| `expired-backfill`, `storage-cleanup` | minute | One-off clean-ups in small chunks; idle once done |
| `operational-retention` | minute | Expired tokens, sessions and invites; old outbox rows |
| `worker-heartbeat` | minute | The worker's own heartbeat row |

- New periodic work is an entry in the registry and nowhere else. A failing entry is retried by BullMQ and
  never stops the others.
- Redis carries only row ids and registry names, never email content, links or personal data. PostgreSQL is
  the durable outbox and owns delivery retry timing (`docs/NOTIFICATIONS.md`).
- Jobs retry eight times with exponential backoff; the failed set is the dead-letter store (30 days, at most
  5,000). Stored error messages are stripped of URLs, bodies and credentials.
- Both processes validate the environment at start and answer `GET /health` on `JOBS_HEALTH_PORT` (3460),
  healthy only while their Redis heartbeat is fresh.
- Hosts that cannot keep a beat process call `POST /api/internal/jobs` (the registry) and
  `POST /api/internal/outbox` once a minute with `Authorization: Bearer $CRON_SECRET`; a worker still runs the
  jobs. Time-bucket job ids make repeated calls in the same minute harmless.
- Local development without Redis may set `JOBS_INPROCESS=true`: the web process then runs every periodic job
  from a one-minute timer (`runOutboxScheduler` in `lib/outboxWorker.ts`). Production never does this.

`npm run build:jobs` (`scripts/build-jobs.mjs`, esbuild) bundles both entry points into `dist/`.

### Read cache

`lib/cache.ts` is a small read-through cache on the rate limiter's Redis client (`REDIS_URL`; no setting of its
own). `cached(key, ttlSeconds, load)` returns the stored value or runs `load` and stores the result. It is
fail-open: with no Redis, a Redis error or a value that won't serialise, the loader's result is returned, so
pages work the same without it. Values are JSON; Dates are tagged and revived, Maps and Sets are never stored.

Keys are built only by `orgCacheKey` (`swo:cache:v1:org:<organisationId>:<scope>[:<extra>]`),
`analyticsCacheKey` (the same, with the viewer's unit scope, a unit id or `org`, always next) and
`platformCacheKey` (`swo:cache:v1:platform:<scope>`). Permission checks run before `cached`, and a cached value
never holds per-viewer data that isn't in its key. `invalidateOrg(organisationId, ...scopes)` drops every key
of those scopes for one organisation.

| What | TTL | Key | Dropped when |
|---|---|---|---|
| Platform analytics (page and CSV export) | 5 min | `platform:analytics` | TTL only |
| One organisation's super-admin analytics | 5 min | `org:<id>:analytics:org:platform` | its rollup rewrites days |
| Dashboard home charts (membership, money) | 5 min | `org:<id>:analytics:<unit>:home-members` / `home-money` | its rollup rewrites days |
| Units league | 5 min | `org:<id>:analytics:<unit>:units:<plan>:<from>-<to>:<money/members>` | its rollup rewrites days |
| Public page plans, published page, units | 10 min | `org:<id>:public-page` | plans created, changed or archived; page published or unpublished |

The organisation behind `/o/<slug>` (status, name, logo, branding) is read live, so suspending or rebranding
shows at once. Money state, permissions, member records, cards, `/verify`, pay pages and write paths are
never cached.

## Images and roles

Two images come from the one `Dockerfile` and are published to GHCR by `.github/workflows/release.yml`:

| Image | Target | Roles (`scripts/docker-entrypoint.sh --role …`) |
|---|---|---|
| `spaceworks-organization-backend` | `runner` | `backend` (web app and API), `migrate` (`prisma migrate deploy`), `worker` (`node dist/worker.js`), `beat` (`node dist/beat.js`), `ops` (operator checks) |
| `spaceworks-organization-frontend` | `frontend` | `frontend`: the website alone for split hosting (the `frontend/` workspace) |

Release images are identical for every installation. The public origins compiled into Next.js are placeholders
(`spaceworks-organization-origin.invalid`, `spaceworks-organization-backend.invalid`) that the entrypoint
replaces at start from `NEXT_PUBLIC_BASE_URL` and `NEXT_PUBLIC_BACKEND_ORIGIN`. The Server Actions key used to
build is a throwaway; web roles refuse to start without the installation's own key. PostgreSQL, Redis, Silo and
Caddy run from their own upstream images.

## Deployment topologies

```
Bundled (docker-compose.prod.yml)                       Cloud (docker-compose.cloud.yml)

 internet ── caddy :80/:443 ──┐  edge network            platform TLS ── backend :8080
                              ▼                                          │
            backend   worker   beat                  worker, beat ───┘
               │  (TLS, private CA)    data network          migrate (one-shot)
   ┌───────────┼───────────┐  (internal, no egress)              │
   db        redis       minio ◄─ createbuckets             managed PostgreSQL, Redis (TLS),
   ▲ migrate (owner role)  ▲ backup-storage                 S3/R2 bucket, SMTP relay
   └ backup (pg_dump)
```

- **Bundled:** everything on one server through `scripts/spaceworks-compose.sh bundled`, with overlays for
  automatic HTTPS (`docker/compose.tls.yml`), an existing proxy (`docker/compose.proxy.yml`), an external
  bucket (`docker/compose.external-storage.yml`) and source builds (`docker/compose.build.yml`).
  PostgreSQL, Redis and Silo accept TLS only, with certificates from the install's private CA
  (`deploy/certificates.sh`). Migrations run as the owner role `sworg`; the app runs as `sworg_app`, which can
  read and write data but cannot change the schema or roles.
- **Cloud:** the backend image's roles on any Docker host (`scripts/spaceworks-compose.sh cloud`) or on Render
  (`render.yaml`), with managed services.
- **Split:** the website on Netlify (or the frontend image) and the backend in either topology above; the
  website reaches the backend only through the signed gateway (`frontend/catalog.json`,
  `FRONTEND_GATEWAY_SECRET`). See [DEPLOYMENT_NETLIFY.md](DEPLOYMENT_NETLIFY.md).

## Releases

`VERSION` selects the series. Every push to `main` runs the tests, publishes both images (amd64 and arm64)
tagged `<VERSION>-main.<run>.<sha>` and `sha-<sha>`, creates a GitHub release with that tag, promotes the
images to `latest`, `main` and the series, prunes superseded image versions (keeping the previous release for
rollback) and, with `SWO_DEPLOY=true`, deploys through a self-hosted runner. Pushes to `dev` publish images
tagged `dev` and `<VERSION>-dev.<run>.<sha>` only. The installer and updater accept only published,
non-prerelease `main` releases.
