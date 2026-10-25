# Changelog

Releases are published from `main` and titled **`Space Works Organization <version>`**. The root `VERSION`
file selects the series; each build is tagged `v<series>-main.<run>.<sha>`, which is what a deployment pins
to. Pushes to `dev` publish staging images tagged `dev` without a release.

## Unreleased

A card designer that works like a design tool, and card designs and numbers per member role.

- **Layers on cards:** add text, images, rectangles, ellipses and lines; drag, resize, turn, fade, lock, hide and
  stack them with the built-in items, with undo and redo. Text fills in the member's name, role, plan, card number
  and valid-until date.
- **66 fonts** for card text, including Malayalam and Devanagari families, for layers and for every built-in text
  item.
- **Six ready-made templates**, any colour of your own, and a background picture per side.
- **Designs per member role:** a member's primary role design comes before their plan's and the organisation's.
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
