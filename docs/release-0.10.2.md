# Space Works Organization 0.10.2

Released 2026-11-20. The full list of changes is in [CHANGELOG.md](../CHANGELOG.md#0102-2026-11-20).

## Upgrading

Nothing to do. No migrations; the new settings are optional. Rolling back to 0.10.1 works.

## What changed

- **Fully cloud background jobs with Inngest.** With `INNGEST_SIGNING_KEY` set, Inngest calls `/api/inngest` once a
  minute and the due scheduled jobs run there, outbox delivery included, so a host with only the web service needs
  no worker or beat. Servers keep the BullMQ worker and beat. See
  [Fully cloud with Inngest](DEPLOYMENT_CLOUD.md#fully-cloud-with-inngest).
- **Without an Inngest account**, `POST /api/internal/run-jobs` (behind `CRON_SECRET`) runs the same jobs, and
  `deploy/cloudflare-cron` calls it from a free Cloudflare Worker cron trigger.
- Each occurrence of a job runs once, claimed in Redis, whichever way it is driven.
- **README gallery:** light screenshots come first for every reader, with the dark versions in their own section.

## New settings

- `INNGEST_SIGNING_KEY` switches Inngest on; `INNGEST_JOBS_CRON` slows the schedule; `INNGEST_DEV` is for the local
  Inngest dev server only, and production refuses to start with it. See `docs/CONFIGURATION.md`.

## Behaviour to know

- Use one: BullMQ, Inngest or an online cron. Outbox delivery claims rows, so overlap is safe, but it is wasted work.
- The bundled stack's web edge still answers `404` for `/api/internal/*`; `/api/inngest` is reachable and verified by
  the signing key.
- Messages can go out up to a minute later than with a worker.
