# Changelog

Releases are published from `main` and titled **`Space Works Organization <version>`**. The root `VERSION`
file selects the series; each build is tagged `v<series>-main.<run>.<sha>`, which is what a deployment pins
to. Pushes to `dev` publish staging images tagged `dev` without a release.

## 0.8.0 (2026-10-29)

Each organisation's own hierarchy and staff roles, offline fee collection through units, analytics, and ID cards
drawn on demand with photos stored per member.

- **Units:** the owner names up to four levels (for example Area → Unit) and builds the tree. Each unit has a short
  code used in join links (`?unit=CODE`) and card numbers, its own page and its own payment instructions. Units
  move between parents on the same level. A plan open to an area also admits members of its units.
- **Custom staff roles:** Settings → Staff roles defines each organisation's roles from a fixed permission list, given
  for the whole organisation or one unit. Nobody can give more access than they hold. The Owner, Manager,
  Treasurer and Viewer roles become editable starters that behave exactly as before. Ownership moves in two
  steps: the new owner accepts.
- **Offline fees through units:** unit secretaries record fees on a collection sheet with receipt-book numbers,
  members can say "I've paid", and the Cash in hand report shows what each collector holds.
- **Cards:** the member's units print on cards (`{units}`, `{unit}`, `{level1}`…), unit codes go in card numbers
  (`{U1}`…`{U4}`, `{UNIT}`), two standard templates, and card designs for chosen roles. Cards are never stored:
  bulk downloads stream a ZIP or one PDF on demand.
- **Card scans:** staff who scan a member's card QR see that member in their own organisation only, inside their
  unit, and can verify, renew, record a payment, change the end date or revoke from there. Anyone else sees the
  card itself beside the check while the membership is current.
- **Member photos** are stored per member in Silo or Cloudflare R2; members can upload their own when the
  organisation allows it, and erasure deletes every stored version.
- **Sheet onboarding:** an imported sheet is checked row by row before saving, the unit's lead can verify the new
  members, and each verified member is emailed their card in wording the organisation can change (Settings →
  Email).
- **Analytics:** charts on the dashboard home and a unit league table you drill into level by level; super admins
  get a platform comparison, a page per organisation (totals only) and a CSV.
- **Platform access:** a super admin with an authenticator can act in any organisation as its owner, under a
  banner, with every action in the organisation's activity log. They can't transfer ownership.
- **Background jobs on BullMQ:** a `worker` and a `beat` role (`npm run build:jobs`, `dist/worker.js` and
  `dist/beat.js`) replace the scheduler pass. Email and chat alerts go out several at a time
  (`QUEUE_OUTBOX_CONCURRENCY`, 5), and each periodic job (membership sweep, payment and refund checks, monthly
  summary, clean-ups, retention) is its own entry in `lib/queue/registry.ts` with its own schedule, so a slow one
  never holds up the rest. The SQL outbox stays the record: Redis carries only ids. `/health` on
  `JOBS_HEALTH_PORT`. New settings `JOBS_QUEUE_PREFIX`, `JOBS_HEALTH_PORT`, `JOBS_INPROCESS` (development only),
  `QUEUE_OUTBOX_CONCURRENCY` and `QUEUE_SCHEDULED_CONCURRENCY`. `POST /api/internal/jobs` joins
  `/api/internal/outbox` as the `CRON_SECRET` fallback for hosts without a beat. The `scheduler` role, its
  Compose service, `docker/ops/scheduler.mjs`, `SWO_SCHEDULER_TARGET` and `SCHEDULER_MODE` are removed.
- **Run and operate it all from the one-line installer:** run it again on an installed server for status and
  health (every service including the worker, beat, Redis, Silo and Caddy, disk, newest backups, and operator
  checks that now include the worker's and beat's `/health`), backup schedule and retention, an `age` key kept
  off the server with nightly encrypted off-site copies to an S3 bucket, settings changes (web address, email,
  bucket keys) put back automatically if the checks fail, a firewall with automatic security updates and
  fail2ban, the automatic-deploy runner, super-admin recovery through `scripts/admin.sh` only, a redacted support
  bundle, and an uninstall that keeps data unless you type `DELETE DATA`. A weekly timer renews the internal
  certificates before they expire.
- **Read cache on Redis:** analytics and the public organisation page are cached for a few minutes per
  organisation (and per unit for unit-limited staff), cleared when plans, the page or units change, and read
  straight from the database when Redis is unavailable. Money state, permissions and members are never cached.
- **Fixes from the release audit:**
  - **Unit-limited staff:**
    - can no longer take over a member from another unit by adding their email;
    - plan unit limits now apply to staff adds, renewals and imports.
  - **Settling payments:**
    - a late gateway capture on a membership that overlaps a newer one is now receipted and flagged instead of failing;
    - a fixed-end plan is no longer renewed past its last day;
    - a Razorpay retry after a failed attempt is no longer flagged;
    - two refunds in the same second are no longer merged;
    - the gateway can't be switched while payments are in flight.
  - **Payment emails:**
    - payment-request emails state the amount with tax;
    - "Not received" on a payment the team recorded no longer emails the member;
    - members are told how to pay offline whenever online payment isn't usable.
  - **Contact details and roles:**
    - exports and searches hide contact details from roles without contact access;
    - a deputy can no longer edit a peer's equal role.
  - **Cards:**
    - lifetime cards read "Lifetime";
    - A4 sheets keep each back beside its front and never overlap mixed card sizes;
    - a stalled bulk download frees the render slot;
    - card numbers are made safe in file names.
  - **Member accounts switched off:** the wallet and pay pages respect the switch.
- **Upgrade notes:** run migrations 0013–0020 (the update does this). Super admins need an authenticator app to
  open organisation dashboards. Self-managed buckets need the two version permissions in `docs/CONFIGURATION.md`.
  Keep the database pool at two connections or more. Bundled installs: `scripts/update.sh` starts the new
  `worker` and `beat` services and removes the old `scheduler` container. Cloud Compose installs: `pull` and
  `up -d --wait --remove-orphans`. Render and other platforms: replace the scheduler worker with two background
  workers, `--role worker node dist/worker.js` and `--role beat node dist/beat.js` (or the cron fallback in
  `docs/DEPLOYMENT_CLOUD.md`), and drop `SCHEDULER_MODE` and `SWO_SCHEDULER_TARGET`. A web process no longer
  sends email on its own in production. The old role columns and the card export table stay for
  one release so an update can be rolled back.

Also in 0.8.0, first published in later 0.7.0 builds from `main`: a card designer that works like a design tool,
and card designs and numbers per member role.

- **Layers on cards:** add text, images, rectangles, ellipses and lines; drag, resize, turn, fade, lock, hide and
  stack them with the built-in items, with undo and redo. Text fills in the member's name, role, plan, card number
  and valid-until date.
- **66 fonts** for card text, including Malayalam and Devanagari families, for layers and for every built-in text
  item.
- **Six ready-made templates**, any colour of your own, and a background picture per side.
- **Designs per member role:** a member's primary role design comes before their plan's and the organisation's.
- **The owner approves card designs:** managers' changes are drafts until the owner publishes them, so every
  member's card changes only with the owner's say-so.
- **PDF and PNG cards match:** tests rasterise both for every design and template.
- **Card number patterns** per organisation and per role, such as `{PREFIX}-{SEQ:4}` or `SEC/{YYYY}/{SEQ:3}`. A
  renewal, a reissue or a new role keeps the number; a new registration after a membership ended gets a new one.
  Existing cards keep their numbers, and new ones continue above every member number.
- **Release pipeline:** the image clean-up no longer deletes images a concurrent run is still publishing.

## 0.7.0 (2026-10-21)

Safer sign-in, organisations in their own voice, and the option to keep records without member accounts.

- **Super admins on the server only.** The installer creates the super admin with a password; afterwards
  `bash scripts/admin.sh` creates, revokes and sets passwords. Super admins sign in with email and password only:
  no emailed resets, no in-app password changes, no Google, GitHub or Apple sign-in, and no separate super-admin
  authenticator step. Signing up with `SUPER_ADMIN_EMAIL` no longer grants anything (an existing account is
  kept on upgrade).
- **Staff need an authenticator app** before the dashboard opens; members never do.
- **Sign-in protections:** an emailed code for sign-ins from a new browser (accounts without an authenticator),
  new-device alert emails, automatic blocking of addresses with repeated failed sign-ins (super admins can lift
  blocks), and refusal of passwords found in known data breaches (`PWNED_PASSWORDS_CHECK`).
- **Organisation email:** each organisation can send member emails through its own SMTP and sender; without
  it they come from the platform in the organisation's name with replies to its contact address.
- **Chat alerts** to Slack, Discord, Mattermost, Telegram and WhatsApp per organisation, with per-channel alerts,
  test sends and optional member names.
- **Member accounts switch:** organisations that only keep records can turn member sign-in off; payment emails
  then carry secure pay links, and card checks keep working.

## 0.6.0 (2026-10-21)

Money in and out, refunds members can ask for, and a release pipeline that tests everything.

- **Accounts.** Managers record other receipts (donations, grants, sponsorship) and expenses, set opening
  balances, and get a receipts and payments account per financial year, split into cash and bank, built from
  membership payments, refunds and those entries. Entries are never deleted, only voided with a reason.
- **Refunds.** A refund policy per organisation (none, full, or the unused share of the membership fee, within a
  set number of days). Members can cancel and request a refund from their account; managers approve (refund and
  end the membership) or decline with a note from a new Refund requests queue, and both sides are emailed.
  Managers refunding by hand can end the membership too. The scheduler follows up refunds still pending at
  Razorpay or Stripe. Receipt lines no longer say "membership" twice for plans named "… membership".
- **GSTR-1 JSON** now carries the offline tool's `version` and `hash`, Table 13 (`doc_issue`), and keeps the
  B2CL place of supply on the group only.
- Profile pictures no longer fall back to Gravatar, so no member email hash leaves the server.
- The installer no longer offers an invalid default sender for `localhost` or IP addresses.
- **Tests.** CI now runs the PostgreSQL integration suite and a browser end-to-end suite (public pages,
  sign-in, accounts, roles, member portal) against real PostgreSQL and Redis. Stripe webhooks and the
  webhook route's size and signature checks gained integration tests. GSTR-1 JSON was checked against
  GSTN's "Save GSTR1" schemas v4.1 and v5.0.
- **Images.** amd64 and arm64 images are built on native runners and joined into one multi-platform image, so
  arm64 builds no longer run under emulation.

## 0.5.0 (2026-10-20)

The first release of the rebuilt platform.

- **Organisations as tenants.** Apply-and-review or platform-created organisations, several managers each,
  units (regions, districts, chapters) with unit-scoped managers, organisation-defined member roles, public
  listing and a customisable public page.
- **Memberships.** Plans with fixed, rolling, financial-year and lifetime terms; open, approval, invite-only
  and free joining; renewals with grace and reminders; CSV and Google Sheets import; member directory and export.
- **Payments.** Razorpay and Stripe on each organisation's own account, offline payments with maker-checker,
  members' "I've paid" UTR claims, refunds, and GST tax invoices, bills of supply, receipts and credit notes
  with gapless numbering; multiple currencies.
- **Member cards.** Designed per organisation or plan, issued on activation, PDF and PNG, with a live
  `/verify` page; bulk exports.
- **Member portal.** One wallet across organisations, pay, renew and leave, receipts, cards, profile,
  consent, data export and erasure requests.
- **Reports.** Membership, renewals, applications, money, tax (GSTR-1 tables and JSON, GSTR-3B), subscription
  income by financial year, platform reports, a daily rollup and a monthly summary email.
- **Sign-in.** Email and password, Google, GitHub and Apple; two-step verification for platform admins.
- **Patch**, the Space Works mascot, and a few easter eggs.


- **Deployment parity with SpaceWorks (P10).** One-line `curl … install.sh | bash` installer with `--repo`,
  `setup.sh`/`setup.ps1`, `scripts/update.sh` (pre-update `pg_dump`, `--version`, `--rollback`, automatic
  rollback of a failed update), `scripts/spaceworks-compose.sh bundled|cloud`, `docker-compose.prod.yml` with
  TLS-only PostgreSQL 16 (owner and least-privilege runtime roles), Redis 7 and Silo, a scheduler, scheduled
  backups and `scripts/restore.sh`, `docker-compose.cloud.yml`, `render.yaml`, and a Continuous Release
  workflow publishing `spaceworks-organization-backend` and `-frontend` to GHCR. The backend image runs every
  role (`--role backend|migrate|scheduler|ops`). New settings: `PAYMENT_SECRETS_KEY`, `SCHEDULER_MODE`,
  `ALLOW_PLAIN_HTTP`. CI is now `tests.yml` (with shellcheck, Compose validation and a bundled-stack smoke
  test) plus `security-audit.yml`.
- Rebuilt as a Next.js 16 membership-management platform for organisations. The legacy Express + Vite + Supabase
  app is kept in git history (commit `1194cb4`). The plan is in `docs/plans/2026-10-19-membership-rebuild.md`.
