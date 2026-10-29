<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/banner-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="docs/readme/banner.png" />
  <img src="docs/readme/banner.png" width="100%" alt="Space Works Organization. Your members. In good standing. Free, open-source membership software for clubs, associations and alumni bodies. With Patch, the Space Works painted wolf." />
</picture>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-AGPL--3.0--or--later-006E63?style=flat-square&labelColor=142C2A" alt="Licence: AGPL-3.0-or-later" /></a>
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-B5CDFF?style=flat-square&labelColor=142C2A&logo=nextdotjs&logoColor=FFF4E8" alt="Next.js 16" /></a>
  <a href="#development"><img src="https://img.shields.io/badge/Node-22-DFFF8F?style=flat-square&labelColor=142C2A&logo=nodedotjs&logoColor=FFF4E8" alt="Node 22" /></a>
  <a href="#install-in-one-line"><img src="https://img.shields.io/badge/deploy-one--line%20installer-FFF4E8?style=flat-square&labelColor=142C2A&logo=docker&logoColor=FFF4E8" alt="Deploy: one-line installer" /></a>
  <a href="https://github.com/SpaceWorks-Labs/SpaceWorks-Organization/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/SpaceWorks-Labs/SpaceWorks-Organization/release.yml?branch=main&style=flat-square&label=release&labelColor=142C2A&color=FFD447" alt="Release" /></a>
</p>

<p align="center">
  <a href="#install-in-one-line">Host on a VPS</a> ·
  <a href="#cloud-mode">Cloud hosting</a> ·
  <a href="#website-on-netlify">Website on Netlify</a> ·
  <a href="#development">Develop locally</a> ·
  <a href="#documentation">Documentation</a>
</p>

**Space Works Organization is free, open-source membership software from Space Works for clubs,
associations, societies and alumni bodies.** Publish your plans, take join applications, approve members,
collect fees online or by UPI, issue GST-correct receipts and member cards anyone can check with a scan,
chase renewals and read the year at a glance, all from one self-hosted app you control. It is built for the
secretaries and treasurers who run all of this by hand today, with spreadsheets, UPI screenshots and receipt
books, and for Indian organisations first: the April–March year, GST and UPI are built in.

One deployment hosts **many organisations**. Each owns its plans, members, money and pages, fully isolated
from the others. Organisations apply at `/start` and a platform admin reviews them, or the platform admin sets
one up and invites its owner. It is part of the [Space Works](https://github.com/SpaceWorks-Labs/SpaceWorks)
family.

> **Status:** in active development, phase by phase. See
> [`docs/plans/2026-10-19-membership-rebuild.md`](docs/plans/2026-10-19-membership-rebuild.md).

## What you can do

Grouped the way an organisation's year actually goes.

### Plans and joining

- Fixed (financial year) or rolling plans with prices in integer paise, joining fees, renewal prices and other
  currencies.
- A public page per organisation, edited in Settings, with every plan and a **Join** or **Apply to join** button.
- Join forms with your own questions, open, approval-only or invitation-only, with consent recorded.

### Members and units

- A member register with search, filters (active, waiting, in grace, lapsed, ending soon) and bulk approvals.
- Districts, chapters or branches as **units**, with managers scoped to their own unit.
- Member roles that print on the card, CSV or Google Sheets import, and an export of everything.
- A membership sweep that moves people through grace and lapse, with renewal reminders by email.

### Payments and GST receipts

- Razorpay or Stripe on the organisation's own account, or **UPI, bank transfer and cash** with a UPI QR for the
  exact amount.
- Maker-checker: a member or one staff member records a payment, another confirms it.
- **Gapless receipt numbers** per organisation per financial year; tax invoices with CGST and SGST or IGST,
  bills of supply, and credit notes. Paid rows are never edited, only reversed.

### ID cards and /verify

- One card per member and plan, issued when the membership starts, in your colours, with photo and role.
- A **verify QR** on every card that opens a public check page: Valid, Expired, Revoked or Replaced, read live.
- Scanned outside the app, the page also shows the card itself while the membership is current. Staff who scan it
  see the member in their own organisation and can verify, renew, record a payment, extend or revoke there.
- PDF and PNG downloads, and bulk exports for printing.

### Member portal

- Members sign in once and see every organisation they belong to: status, history, cards and receipts.
- Pay what is due, renew, update their details, ask for a refund, export their data or ask to be erased.
- Optional per organisation: with **Member accounts** off, the organisation just keeps records and payments;
  "Pay now" emails carry a secure pay link, and card checks on `/verify` keep working.

### Public pages

- A directory of organisations, and a page for each one with its own accent colour, sections and images.

### Reports and analytics

- Membership change, renewal rate, churn, joins and lapses, applications, renewals due, money by plan and
  GST summaries, for the platform, each organisation and each unit. PDF snapshots and CSV exports.

### Self-hosting

- A one-line installer, automatic deploys from GitHub Actions, backups, updates and rollback, cloud mode and a
  Netlify website split. Details below.

## A look around

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/home.webp" alt="The Space Works Organization home page: Your members. In good standing." />
      <p><strong>Home.</strong> What it is, in one screen.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/org-page.webp" alt="An organisation's public page with its three membership plans" />
      <p><strong>Public page.</strong> Every plan, and one clear way to join.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/join-form.webp" alt="The join form for an annual membership" />
      <p><strong>Join form.</strong> Name and email from the account, then your questions.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/members.webp" alt="The member register with filters and membership status" />
      <p><strong>Members.</strong> Who is active, waiting, in grace or lapsed.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/member-card.webp" alt="A member's page with an active membership, a paid receipt and their ID card" />
      <p><strong>Member and card.</strong> Membership, receipt and a card with a verify QR.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/payments.webp" alt="The payments list with UPI references and gapless receipt numbers" />
      <p><strong>Payments.</strong> Confirmed, receipted and numbered without gaps.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/pay-upi.webp" alt="A member's pay page with the amount due, GST and a UPI QR code" />
      <p><strong>Pay by UPI.</strong> A QR for the exact amount, then the reference.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/reports.webp" alt="The reports overview with membership change, renewal rate and charts" />
      <p><strong>Reports.</strong> The year at a glance, for the committee.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/settings.webp" alt="Payment settings with the UPI ID, payee name and other ways to pay" />
      <p><strong>Settings.</strong> Gateways, UPI and GST, per organisation.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/wallet-dark.webp" alt="A member's view of their membership, history and receipts, in dark mode" />
      <p><strong>Member portal, dark mode.</strong> History, receipts and details.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/org-page-phone.webp" alt="An organisation's public page on a phone" width="60%" />
      <img src="docs/readme/screens/pay-upi-phone.webp" alt="The UPI QR on a phone" width="38%" />
      <p><strong>On a phone.</strong> The public page and the UPI QR.</p>
    </td>
    <td width="50%" valign="top">
      <img src="docs/readme/screens/not-found.webp" alt="The 404 page, with Patch the painted wolf trotting along the bottom" />
      <p><strong>404.</strong> Patch is out looking for it too.</p>
    </td>
  </tr>
</table>

Screenshots come from the demo data (`npm run db:seed-demo` and `npm run db:seed-reports`); every name, email,
UPI ID and GSTIN in them is made up.

## Quick start

### Install in one line

On a 64-bit Linux server (or macOS / Windows with Docker Desktop running), as a user with `sudo`:

```bash
curl -fsSL https://raw.githubusercontent.com/SpaceWorks-Labs/SpaceWorks-Organization/main/install.sh | bash
```

It asks every question first, shows a summary, and changes nothing until you confirm. Run the same command
again later to update, back up, roll back, check health, set up encrypted off-site backups, change settings,
harden the server, recover super-admin access, collect a support bundle or uninstall: the whole product runs
and is operated on one server. Details, requirements and options follow below.

### Full install guide

Everything runs through Docker Compose: **PostgreSQL 16, Redis 7 and Silo object storage** (the maintained,
S3-compatible fork of the archived MinIO), each speaking TLS signed by the install's own private CA, plus the
**migrations, the app, the background worker and beat, scheduled backups and the Caddy web edge**. Every application process
runs from one published image, `ghcr.io/spaceworks-labs/spaceworks-organization-backend`, in a different role.

**Before you start, you need:**

- a 64-bit (x86_64 or arm64) Linux server (Debian/Ubuntu, Fedora/RHEL/Alma/Rocky, Arch or openSUSE), macOS, or
  Windows Git Bash/WSL with Docker Desktop;
- on Linux, root or a user with `sudo`: the installer installs Docker, Docker Compose and curl after
  confirmation; curl (or wget) and tar must already exist;
- internet access to `github.com` and `ghcr.io`, and at least 8 GiB free disk;
- for HTTPS, a domain whose DNS points at the server, with ports 80 and 443 open;
- an SMTP relay on a verified sending domain (Brevo, Amazon SES, Postmark…), and the email and password for
  your super admin (passwords are only ever set on the server, never by email).

All deployment decisions come first, in this order:

1. **GitHub repository** to install and update from (`SpaceWorks-Labs/SpaceWorks-Organization`, or your fork).
2. **Website here?** Yes (default), or backend only with the website on Netlify
   ([docs/DEPLOYMENT_NETLIFY.md](docs/DEPLOYMENT_NETLIFY.md)).
3. **HTTPS:** plain HTTP for a LAN or trial (default), automatic HTTPS with Caddy and Let's Encrypt (domain and
   certificate email), or an existing reverse proxy forwarding to `127.0.0.1:8080`. A Netlify backend requires
   HTTPS.
4. **Storage:** bundled Silo (default), or an external S3-compatible bucket (endpoint, region, bucket, keys).
5. **Super-admin email and password** (asked twice, hidden), then **email**: sender, SMTP host, port, login and
   password. The installer creates the super admin; later password changes happen only on the server with
   `bash scripts/admin.sh set-password --email …`.
6. **Sign-in options** besides email and password: Google, Apple, GitHub as a comma list, or none. Google and
   GitHub ask for their client ID and secret (blank adds them later); Apple is set up in Super admin → Settings.
7. **Install a GitHub Actions runner on this server for automatic deploys? [y/N]** (Linux with systemd only).

Enter accepts each displayed default; invalid answers are asked again. One summary shows every choice, the
services and host actions before **Proceed? [Y/n]**. Answering no leaves the install directory absent. Secrets
(database, Redis, storage and application keys, including `PAYMENT_SECRETS_KEY`) are generated, saved in the
install's owner-only `.env`, and never printed. Production contains no demo or example data.

**One command for everyone, forks included.** Pass a fork up front to skip the repository question:

```bash
curl -fsSL https://raw.githubusercontent.com/SpaceWorks-Labs/SpaceWorks-Organization/main/install.sh | bash -s -- --repo YourName/SpaceWorks-Organization
```

A fork must have published a release first (run its **Continuous Release** workflow on `main` once) and its
`spaceworks-organization-backend` package must be public. Run the installer as your normal user (it asks for
`sudo` when needed and adds you to the `docker` group), or with `curl … | sudo bash` to keep the install owned
by root. It installs to `/opt/spaceworks-organization`; set `SWO_DIR` on the `bash` side of the pipe to change
that. `bash install.sh --help` prints the checklist without changing anything.

Run the same curl command later and an existing install shows a menu:

1. **Update to the latest release**: backs up the database, moves to the newest main release, runs
   migrations and restarts.
2. **Back up now**: the database, the uploaded files and the settings, into `backups/`.
3. **Roll back to the previous release**: the release that ran before the last update.
4. **Check status and health**: every service (backend, worker, beat, PostgreSQL, Redis, Silo, Caddy, backups),
   disk, the newest backups, certificates, the public address and the operator checks.
5. **Backups**: how often the database is backed up and how long dumps stay, an `age` encryption key kept off
   the server, and nightly encrypted copies to an off-site S3-compatible bucket.
6. **Change settings**: the web address, outgoing email or external bucket keys; the previous settings come back
   automatically if the checks fail.
7. **Server security**: a firewall allowing only SSH, HTTP and HTTPS, automatic security updates and fail2ban.
8. **Automatic deploys**: install or remove the GitHub Actions runner.
9. **Recover super-admin access**: remove a lost authenticator or set a new password, with
   `scripts/admin.sh` on the server only (never a reset link).
10. **Support bundle**: checks and logs with secrets redacted, in `support/`.
11. **Uninstall**: keeps the data, secrets and backups unless you type `DELETE DATA`.

**0** cancels and is the default. On Linux with systemd the installer also schedules a weekly check that renews the internal certificates two
months before they expire. Each option is a script in `scripts/` (`vps-status.sh`, `vps-backup-settings.sh`…)
you can also run as the install owner; see [docs/DEPLOYMENT_VPS.md](docs/DEPLOYMENT_VPS.md).

**Desktop or local install.** From a checkout: `bash setup.sh` (Linux, macOS, Git Bash) or
`powershell -ExecutionPolicy Bypass -File setup.ps1` (Windows with Docker Desktop). Add `--build` to build the
image from source instead of pulling it.

### Updating

Every merge to `main` builds a release: `.github/workflows/release.yml` runs the tests, publishes the images
and a GitHub release titled `Space Works Organization <VERSION>` and tagged `v<VERSION>-main.<run>.<sha>`,
then promotes the images to `latest`. Pushes to `dev` publish images tagged `dev` for staging, never `latest`.

#### Automatic deploys with GitHub Actions

A runner on your server receives a `deploy` job after each release and runs the updater locally; nothing is
pushed into the server and no port is opened. Answer yes during setup, or run `bash scripts/install-runner.sh`
as the install owner (it asks for a short-lived registration token from the repository's
**Settings → Actions → Runners**). Then add the repository variable `SWO_DEPLOY=true`, require approval for
fork workflows, and protect `main`. The deploy job runs:

```bash
bash "$SWO_DIR/scripts/update.sh" --force --version <that release>
```

#### Manual updates

```bash
bash scripts/update.sh --force
# Or deploy an exact published main release:
bash scripts/update.sh --force --version 0.8.0-main.42.a1b2c3d4e5f6
# Return to the release that ran before the last update:
bash scripts/update.sh --rollback
```

The updater locks, dumps PostgreSQL to `backups/pre-update-*.sql.gz`, downloads the target release, installs
its host files (keeping the replaced ones in `backups/host-config-*`), pulls the pinned images, runs
migrations, waits for every service to be healthy, runs the operator checks and records `.spaceworks-version`.
A failed update restores the previous host files and images automatically. Forward migrations stay applied; to
return the data as well, restore the pre-update dump with `bash scripts/restore.sh backups/<dump>.sql.gz`.

### SECURITY

This repository is public. A self-hosted runner controls Docker, effectively root on the server: require
approval for **all external contributors'** workflow runs, restrict the runner to this repository, never add
its label to a `pull_request` workflow, and keep runner auto-updates on. See [docs/SECURITY.md](docs/SECURITY.md).

## Cloud mode

Run the app, worker and beat on any Docker host with managed PostgreSQL, Redis (TLS), S3/R2 and SMTP:

```bash
sudo install -D -m 600 .env.production.example /etc/spaceworks-organization/cloud.env   # then fill it in
scripts/spaceworks-compose.sh cloud up -d
```

Or use the Render Blueprint in [`render.yaml`](render.yaml). See [docs/DEPLOYMENT_CLOUD.md](docs/DEPLOYMENT_CLOUD.md).

## Website on Netlify

The website can render on Netlify while every database, payment and email operation stays on your server.
Choose "backend only" in the installer, then follow [docs/DEPLOYMENT_NETLIFY.md](docs/DEPLOYMENT_NETLIFY.md).
The same website also ships as a container, `ghcr.io/spaceworks-labs/spaceworks-organization-frontend`.

## Design system

Space Works Organization follows the [Space Works design system](https://github.com/SpaceWorks-Labs/SpaceWorks-Design):
Gilroy Light and ExtraBold, pill-shaped controls, one Unbounded phrase or one bold moment per layout, light and
dark modes, and reduced motion respected everywhere. The details are in [docs/DESIGN.md](docs/DESIGN.md).

| | Colour | Hex | | Colour | Hex |
|---|---|---|---|---|---|
| <img src="docs/readme/swatch-deep-ink.svg" width="48" height="24" alt="" /> | Deep Ink | `#142C2A` | <img src="docs/readme/swatch-citron.svg" width="48" height="24" alt="" /> | Citron | `#DFFF8F` |
| <img src="docs/readme/swatch-maker-teal.svg" width="48" height="24" alt="" /> | Maker Teal | `#006E63` | <img src="docs/readme/swatch-sky-blue.svg" width="48" height="24" alt="" /> | Sky Blue | `#B5CDFF` |
| <img src="docs/readme/swatch-workshop-orange.svg" width="48" height="24" alt="" /> | Workshop Orange | `#FF7447` | <img src="docs/readme/swatch-warm-yellow.svg" width="48" height="24" alt="" /> | Warm Yellow | `#FFD447` |
| <img src="docs/readme/swatch-warm-cream.svg" width="48" height="24" alt="" /> | Warm Cream | `#FFF4E8` | | | |

**Patch**, the Space Works painted wolf, is the friendly face of the product; the box symbol stays the logo.
Patch walks the 404 page, keeps first-time empty lists company, trots while pages load, and sneezes its vote
when an organisation or a member is approved. The README art is drawn by `node scripts/generate-readme-art.mjs`.

## Documentation

- [Deploying on a server (VPS)](docs/DEPLOYMENT_VPS.md): installer, layout, backups, restore, update and rollback
- [Deploying with managed services (cloud)](docs/DEPLOYMENT_CLOUD.md)
- [Website on Netlify (split hosting)](docs/DEPLOYMENT_NETLIFY.md)
- [Configuration reference](docs/CONFIGURATION.md): every environment variable
- [Architecture](docs/ARCHITECTURE.md) and [security](docs/SECURITY.md)
- [Design](docs/DESIGN.md), including Patch and every easter egg
- [Payments](docs/PAYMENTS.md), [GST](docs/GST.md) and [reports](docs/REPORTS.md)

## Development

Node 22 and Docker:

```bash
cp .env.example .env
docker compose up -d        # PostgreSQL and Redis for development
npm ci
npm run db:migrate
npm run dev                 # http://localhost:3000
```

`npm run lint`, `npm run typecheck`, `npm run test:unit` and `bash scripts/compose-smoke.sh` (the bundled stack
end to end) are what CI runs. See [CLAUDE.md](CLAUDE.md) for conventions.

## Licence

Copyright © 2026 Space Works.

Space Works Organization is free software under the
[GNU Affero General Public License v3.0 or later](LICENSE) (`AGPL-3.0-or-later`). If you run a modified
version for other people over a network, you must offer them its source code too. See [NOTICE](NOTICE) for
attribution. The fonts in `public/brand/fonts` and Patch's artwork keep their own terms and are not covered by
the AGPL.
