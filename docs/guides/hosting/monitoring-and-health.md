# Monitoring and health

The health endpoints, the job processes' health checks, the operator checks and status script, and the super-admin pages that show whether the platform is working.

## Health endpoints

| Endpoint | Checks | Who may call it | Answers |
|---|---|---|---|
| `GET /api/health` | The app process is alive. It never touches the database or Redis. | Anyone | `200` with `ok`, `uptimeMs` and `time` |
| `GET /api/health/db` | The app can query the database (`SELECT 1`). | Callers with `Authorization: Bearer <HEALTHCHECK_SECRET>` | `200` with `ok` and `time`; `404` without the secret; `500` if the database query fails |
| `GET /health` on the worker and beat | The process is running and its Redis heartbeat is fresh. | Inside the stack, on `JOBS_HEALTH_PORT` (3460) | `200` with `{"ok":true,"role":"worker"}` (or `beat`); `503` when unhealthy |

Neither app endpoint returns database names, versions or connection details. The secret is compared in constant
time, and a missing or wrong secret gets the same `404` as a route that does not exist.

```bash
curl -fsS https://members.example.org/api/health
curl -fsS -H "Authorization: Bearer $HEALTHCHECK_SECRET" https://members.example.org/api/health/db
```

> **Tip:** Point an external uptime monitor at `/api/health` for liveness. Use `/api/health/db` only from a monitor
> that can keep the secret private.

### How the containers use them

- The backend image's Docker health check calls `/api/health` every 30 seconds.
- The worker and beat containers call their own `/health`. They report healthy only while their Redis heartbeat
  succeeded in the last 30 seconds; the heartbeat runs every 10 seconds. The worker also needs every queue
  consumer running and connected.
- Platforms that run the worker and beat separately (see
  [Deploying with managed services](../../DEPLOYMENT_CLOUD.md)) can use `GET /health` on port 3460 as their health
  check.

## Operator checks

The `ops` role checks a running stack and prints only `ok` or `FAIL` per line, never a connection detail or
response body:

```bash
scripts/spaceworks-compose.sh bundled run --rm ops
scripts/spaceworks-compose.sh cloud run --rm ops
```

| Check | Fails when |
|---|---|
| Database connection uses TLS | The app's connection is not encrypted |
| Runtime database role cannot change schema or roles | The app's role is a superuser, can create databases or roles, or owns a table (bundled only) |
| Every migration is applied | A migration is unfinished or rolled back |
| Redis answers over TLS with its password | `REDIS_URL` is not `rediss://` or Redis does not answer |
| Private bucket is reachable | The S3 bucket cannot be reached with the app's key |
| App readiness (`/api/health/db`) | The backend is not ready or the health secret is wrong |
| Worker and beat are healthy (`/health`) | Either process's heartbeat is stale |
| Internal job endpoint refuses requests without the secret | `/api/internal/outbox` answers anything but `404` without `CRON_SECRET` |
| SMTP relay is configured | `SMTP_HOST` is missing or still `CHANGE_ME` |

The source is [`docker/ops/check.mjs`](../../../docker/ops/check.mjs). The updater runs it after every update, and
`setup.sh` after installing.

## Status script (bundled)

```bash
bash scripts/vps-status.sh
```

This is menu option 4. It changes nothing and shows:

- the release, the previous release and the public address;
- free disk for the install and for Docker;
- the newest scheduled dump, with a warning when it is older than the backup interval plus two hours;
- the last off-site copy result, the off-site and certificate timers, and whether automatic deploys are on;
- when the internal certificates expire;
- every long-running service's state and health;
- whether the public address answers `/api/health` (skipped behind your own proxy or for a backend-only server);
- the operator checks.

It exits with an error if anything needs attention. For help from someone else, menu option 10
(`scripts/vps-support.sh`) collects the same report with the last 500 log lines of each service, secrets redacted,
into `support/`. Read it before sharing: logs can hold email and IP addresses.

## Logs

```bash
scripts/spaceworks-compose.sh bundled ps
scripts/spaceworks-compose.sh bundled logs -f backend worker beat
scripts/spaceworks-compose.sh bundled logs migrate
scripts/spaceworks-compose.sh bundled logs backup
```

Each container keeps up to five log files of 10 MB. Caddy writes no access log, because application URLs can carry
bearer links (invites, receipts).

| Symptom | Look at |
|---|---|
| The site does not load | `logs caddy` (or `cloudflared` behind a Cloudflare Tunnel), then `logs backend` |
| The app never starts after an update | `logs migrate`: the app never starts on a half-migrated database |
| Email or chat alerts are not sent | `ps` for both `worker` and `beat`: a running worker sends nothing while beat is down |
| Worker or beat unhealthy | `logs worker beat` for a Redis or database connection problem |
| No recent scheduled dump | `logs backup` |

## Super-admin pages

| Page | Shows |
|---|---|
| **Overview** | Items needing attention: applications waiting over 7 days, suspended organisations, failed emails, emails queued over 15 minutes, staff without an authenticator, users with unverified email |
| **Monitoring** | Whether the database is reachable and key settings are present, plus request counts, 5xx errors and latency per API route (in memory: reset on restart and not shared between instances) |
| **Operations** | Recorded backup status and the last restore drill; whether Redis, `CRON_SECRET`, `HEALTHCHECK_SECRET` and email are configured; queued, failed and sent outbox counts; the outbox scheduler's last run (healthy within 3 minutes); and the latest 25 failed deliveries with redacted errors |
| **Email** | The email provider's state and messages in the outbox by kind |
| **Security** | Sign-in methods, sensitive actions from the audit log, blocked addresses and super admins |
| **Audit log** | Every recorded action, searchable (see [Audit actions](/docs/audit-actions)) |

## Outbox failures and requeue

Member and account emails, chat alerts and some storage work go through the SQL outbox and are delivered by the
worker. A failed delivery is retried with a growing delay (up to an hour, or 8 minutes for short-lived links). After
8 attempts, or at once for a malformed job or a recipient the provider refuses, the row is marked failed. Durable
storage work keeps retrying until storage agrees. Messages that carry a reset, verification or invite link are
deleted rather than kept once they are sent or fail for good.

**Super admin → Operations** has four controls, each audited:

| Control | Does | Audit action |
|---|---|---|
| **Deliver queued email** | Delivers up to 50 due outbox rows now | `INSTANCE_OUTBOX_DELIVERED` |
| **Retry failed email** | Puts every failed row back in the queue | `FAILED_OUTBOX_MESSAGES_REQUEUED` |
| **Purge expired tokens** | Removes expired verification tokens | `EXPIRED_VERIFICATION_TOKENS_PURGED` |
| **Record restore drill** | Records that a backup restore was tested | `BACKUP_RESTORE_VERIFIED` |

Sent and failed rows are removed after `OUTBOX_RETENTION_DAYS` (30) by the hourly retention job. See
[Notifications](../../NOTIFICATIONS.md) for what is sent and [Limits](../../reference/limits.md) for retention
defaults.

> **Note:** Fix the cause before you retry: a wrong SMTP login or a suspended sending domain fails every message
> again. Send a test message from **Super admin → Settings** first.

## Without a beat process

Hosts that cannot keep beat running call the internal endpoints once a minute with `CRON_SECRET`; a worker must still
run. See [Without a beat process](../../DEPLOYMENT_CLOUD.md#without-a-beat-process-cron-fallback). The bundled Caddy
answers `404` for `/api/internal/*`, so those calls must reach the backend directly.

## Read next

- [Webhooks and internal endpoints](../../reference/webhooks-and-endpoints.md)
- [Backups and restore](backups-and-restore.md) and [Updates and rollback](updates-and-rollback.md)
- [Architecture](../../ARCHITECTURE.md#background-jobs): the queues and scheduled jobs.
- [Deploying on a server](../../DEPLOYMENT_VPS.md#troubleshooting)
