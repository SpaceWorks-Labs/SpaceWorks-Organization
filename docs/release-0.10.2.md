# Space Works Organization 0.10.2

Released 2026-11-20. The full list of changes is in [CHANGELOG.md](../CHANGELOG.md#0102-2026-11-20).

## Upgrading

Nothing to do. No migrations and no new app settings. Rolling back to 0.10.1 works.

## What changed

- `POST /api/internal/run-jobs` (behind `CRON_SECRET`) runs the due scheduled jobs and delivers the outbox in the
  request, so a host with only the web service needs no worker or beat. Each occurrence runs once, claimed in Redis.
- `deploy/cloudflare-cron` calls it once a minute from a free Cloudflare Worker cron trigger. See
  [No worker at all](DEPLOYMENT_CLOUD.md#no-worker-at-all-online-scheduler).

## Behaviour to know

- Use the online scheduler or a worker and beat, not both. Outbox delivery claims rows, so overlap is safe, but it
  is wasted work.
- The bundled stack's web edge still answers `404` for `/api/internal/*`, so the scheduler must reach the app
  directly, as in the cloud layout.
- Messages can go out up to a minute later than with a worker.
