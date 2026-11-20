# Choose your hosting

Space Works Organization runs on one server, on managed cloud services, split with Netlify, or free behind Cloudflare. This page compares them.

## The four routes

Every route runs the same images and the same code. They differ in who runs the database, Redis, file storage and
the web edge.

| Route | What you run | What you need | Cost shape | Who it suits |
|---|---|---|---|---|
| [One server (VPS)](../../DEPLOYMENT_VPS.md) | The whole stack on one Linux machine with Docker Compose: app, worker, beat, PostgreSQL, Redis, Silo storage, Caddy and the backup services | A 64-bit Linux server (x86_64 or arm64), at least 8 GiB free disk, ports 80 and 443, a domain and an SMTP relay | One server bill; everything else is included | Most organisations and anyone who wants the menu-driven installer, backups and updates |
| [Managed services (cloud)](../../DEPLOYMENT_CLOUD.md) | Only the app processes (`backend`, `worker`, `beat`, `migrate`) from the backend image | Managed PostgreSQL 16 with TLS, Redis 7 over TLS (`rediss://`), an S3-compatible bucket, an SMTP relay and an HTTPS edge | A small app host plus one bill per managed service | Teams that already use managed databases and want backups and scaling handled by providers |
| [Website on Netlify (split)](../../DEPLOYMENT_NETLIFY.md) | A backend server (either route above) with `DEPLOYMENT_MODE=backend`; the website on Netlify or the frontend image | Everything the backend route needs, a Netlify site and a shared `FRONTEND_GATEWAY_SECRET` | The backend's cost plus the Netlify plan | Hosts who want the public pages served from a CDN and kept up while the backend restarts |
| [Free behind Cloudflare](../../DEPLOYMENT_CLOUDFLARE.md) | The bundled stack on one always-free VM or a machine at home, reached through a Cloudflare Tunnel | A Cloudflare account and domain, an R2 bucket and an email provider's free tier | Free tiers only, within each provider's current limits | Small organisations, trials and home labs that want no open ports |

> **Note:** Cloudflare Workers alone cannot host the app: it needs a long-running Node process, PostgreSQL, Redis and
> background jobs. The free route runs the normal stack and puts Cloudflare in front of it.

## Pick this if

### One server (VPS)

- You want one command to install, and a menu for updates, backups, restores, settings and recovery.
- You are happy for one machine to hold the database, files and backups, with an encrypted off-site copy each night.
- You want the internal services locked down for you: TLS between every service, a data-only database role and no
  route to the internet from the data network.

Install with the curl installer on Linux, or from a checkout with `bash setup.sh` (`setup.ps1` on Windows, which
needs Docker Desktop and Git for Windows and runs the same `setup.sh` through Git Bash). Run the stack only through
the wrapper:

```bash
scripts/spaceworks-compose.sh bundled up -d
scripts/spaceworks-compose.sh bundled run --rm ops
```

### Managed services (cloud)

- Your provider already gives you point-in-time recovery for PostgreSQL and versioned buckets.
- You want to run more workers for load; one beat is enough and a second does no harm.
- You can run the cron fallback if your platform cannot keep a long-running beat process.

Settings live in `/etc/spaceworks-organization/cloud.env`, created from `.env.production.example`:

```bash
scripts/spaceworks-compose.sh cloud pull
scripts/spaceworks-compose.sh cloud up -d --wait
scripts/spaceworks-compose.sh cloud run --rm ops
```

> **Warning:** `scripts/update.sh` and the installer menu are for the bundled stack only. On the cloud route you back
> up with your provider and update by changing `SWO_IMAGE_TAG`, then running `pull` and `up -d --wait` again.

### Website on Netlify (split)

- You want the landing page to render even while the backend is down.
- You accept that sign-in, `/start`, dashboards and member pages still need the backend.
- You keep secrets off the website: Netlify holds no database URL or payment secret, only the gateway secret it
  signs requests with.

The backend sets `DEPLOYMENT_MODE=backend`, a 64-hex-character `FRONTEND_GATEWAY_SECRET` and `PUBLIC_APP_BASE_URL`
(the website's origin). The website can also run as the `spaceworks-organization-frontend` container image instead of
Netlify.

### Free behind Cloudflare

- You have a spare always-free VM or a machine at home.
- You want no inbound ports except SSH: the `cloudflared` connector dials out (`SWO_LAYER='cloudflared'`).
- You keep files in R2, so they survive the loss of the VM, and send nightly encrypted backups to a second bucket.

> **Tip:** Free tiers change. Check each provider's current limits before you rely on them, and watch for rules that
> reclaim idle always-free machines.

## Moving between routes

You are not locked in. On a VPS you can move from plain HTTP to automatic HTTPS, or turn the server into a backend
for a Netlify website, by changing `.env` and restarting (see
[Moving between modes](../../DEPLOYMENT_VPS.md#moving-between-modes)). To move to new hardware or another route,
restore a backup into the new install (see [Backups and restore](backups-and-restore.md)).

## Read next

- [Self-hosting](../../features/self-hosting.md): what the self-hosted platform includes.
- [Operator quickstart](../start/quickstart-operator.md): install and sign in for the first time.
- [Configuration reference](../../CONFIGURATION.md) and [Environment variables](/docs/environment-variables): every
  setting.
- [Architecture](../../ARCHITECTURE.md): how the processes, queues and images fit together.
- [Security](../../SECURITY.md): sign-in, secrets and the server's defences.
- [Backups and restore](backups-and-restore.md), [Updates and rollback](updates-and-rollback.md) and
  [Monitoring and health](monitoring-and-health.md).
- [Limits](../../reference/limits.md): sizes, rate limits and retention defaults.
