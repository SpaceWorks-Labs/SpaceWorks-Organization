# CLAUDE.md

Guidance for Claude Code (and other agents, via `AGENTS.md`) in this repository.

## Project

**Space Works Organization** is a self-hostable (AGPL-3.0-or-later), multi-tenant platform for running an
organisation's **memberships**: plans, join forms and approvals, members, renewals, payments (Razorpay, Stripe
and offline), GST receipts, ID cards and reports. Organisations are tenants. The platform super-admin creates
them, or reviews the ones that sign up. There are **no events** in this product.

- **Rebuild in progress:** the phased plan is in `docs/plans/2026-10-19-membership-rebuild.md`. Follow it phase
  by phase. Commit each phase once its gates pass.
- **Legacy app:** the old Express + Vite + Supabase app lives only in git history, at commit
  `1194cb4` and earlier.

## Stack

- **App framework:** Next.js 16 (App Router, React Server Components, Server Actions), React 19, TypeScript
  strict, with `@/*` as the path alias for the repo root.
- **Data:** PostgreSQL 16 through Prisma 6 (`prisma/schema.prisma`). `DATABASE_URL` is the runtime/pooled
  connection; `DIRECT_URL` is for migrations. `scripts/prisma.mjs` defaults it to `DATABASE_URL`.
- **Services:**
  - Redis (ioredis) for rate limits and pub/sub
  - S3-compatible storage (Silo on a VPS, R2 or any S3 in the cloud)
  - Nodemailer with a database outbox
- **Origins:** platform and ID-card code is derived from SpaceWorks-Events `origin/dev` @ `03186e0`. Copy it from
  there with `git show`, then remove anything event-specific.
- **Design:**
  - **Brand:** SpaceWorks-Design is the only source of brand truth (tokens, logos, fonts).
  - **UX:** Space Works UX, from SpaceWorks-Design `docs/ux-spec.md`.
  - **Buttons and controls:** pill-shaped (`--radius-control: 9999px`).
  - **Fonts:** only the free Gilroy weights (Light 300 for text, ExtraBold 800 for headings), plus Unbounded for
    one accent phrase per layout.
  - **Patch (mascot):** `components/brand/Patch.tsx` (idle, sneeze, walk), artwork from SpaceWorks-Design via
    `scripts/sync-patch.mjs`. Never recolour, mirror or resize it past native size, never beside the box logo, and
    it counts as a layout's one bold moment. Where it appears and every easter egg are in `docs/DESIGN.md`.
- **Operations:** releases, Actions, installer and compose layout mirror the main SpaceWorks repo (see
  "Operations" below and `docs/DEPLOYMENT_VPS.md`).

## Commands

```bash
npm ci                 # install (runs prisma generate)
npm run dev            # dev server on :3000
npm run lint           # ESLint (next core-web-vitals + typescript)
npm run typecheck      # next typegen + tsc --noEmit
npm run test:unit      # Vitest unit tests (tests/unit)
npm run test:integration   # needs TEST_DATABASE_URL pointing at a disposable Postgres
npm run test:e2e       # Playwright (tests/e2e); signed-in journeys need db:seed-demo, db:seed-reports and DEMO_PASSWORD
npm run build          # production build (standalone output)
npm run db:migrate     # create/apply a migration in development
npm run db:deploy      # apply migrations
```

Operations (bash; see `docs/DEPLOYMENT_VPS.md`, `docs/DEPLOYMENT_CLOUD.md`, `docs/CONFIGURATION.md`):

```bash
bash setup.sh [--build]                                  # guided install from a checkout (setup.ps1 on Windows)
scripts/spaceworks-compose.sh bundled up -d              # the only way to run docker-compose.prod.yml
scripts/spaceworks-compose.sh bundled run --rm ops       # operator checks
scripts/spaceworks-compose.sh cloud up -d                # docker-compose.cloud.yml with /etc/spaceworks-organization/cloud.env
bash scripts/update.sh --force [--version V | --rollback]
bash scripts/backup.sh && bash scripts/restore.sh backups/<dump>.sql.gz [--with-storage]
bash scripts/admin.sh create|set-password|reset-mfa|revoke|list --email <address>   # super admins (server only)
SWO_COMPOSE_BUILD_LAYER=1 bash scripts/compose-smoke.sh  # bundled stack end to end (disposable)
```

Run one unit test file:

```bash
npx vitest run tests/unit/health.test.ts
```

## Conventions

- **Tenant isolation is enforced in the application** (there is no RLS):
  - Every tenant row carries `organisationId`, with composite FKs to its parent.
  - Every query is scoped through the organisation resolved for the request.
  - Cross-tenant access returns 404.
- **Money:**
  - Amounts are integer paise.
  - Receipt numbers are gapless per organisation per financial year (April–March, in the organisation's timezone).
  - Paid rows are never edited or deleted; reverse them with credit notes.
  - Payments live in `lib/payments/*` (see `docs/PAYMENTS.md` and `docs/GST.md`). Settle money only through
    `settlePayment` (lock order payment → term → counter); triggers in migration 0005 enforce immutability.
    Gateway secrets need `PAYMENT_SECRETS_KEY`.
  - Refunds go through `createRefund` then `sendRefundToGateway` (`lib/payments/refundGateway.ts`). Member refund
    requests, the policy and approve/decline live in `lib/payments/refundRequests.ts` and `refundPolicy.ts`;
    `reconcileGatewayRefunds` follows up pending gateway refunds from the scheduler.
  - Other receipts and expenses are `LedgerEntry` rows (`app/actions/accounts.ts`), voided once and never
    deleted (trigger in migration 0009). The receipts and payments account is pure in `lib/accounts/statement.ts`.
- **Accounts and sign-in** (`docs/SECURITY.md`):
  - Super admins sign in with email and password only, and are created, revoked and given passwords only on
    the server (`docker/ops/admin.mjs` through `scripts/admin.sh`). Never add an in-app or emailed way to make
    a super admin or reset their password; `requireSuperAdmin` checks only `User.isSuperAdmin`.
  - Staff (any `TeamMember`) need an authenticator before the dashboard opens: `requireOrgTeam`,
    `orgActionAccess` and the export and document routes check `hasAuthenticator`. Members never need one.
  - New browsers: `lib/loginSecurity.ts` (known-device cookie, emailed code for accounts without an
    authenticator, new-device alert). Failed sign-ins feed `lib/ipBlock.ts`. Every new password passes
    `isBreachedPassword` (`lib/breachedPassword.ts`).
- **Notifications** (`docs/NOTIFICATIONS.md`):
  - Member-facing emails pass `organisationId` to `sendBrandedEmail`, which uses the organisation's own SMTP
    (`OrgEmailSettings`) or the platform's in its name. Account emails never pass it.
  - Team chat alerts (Slack, Discord, Mattermost, Telegram, WhatsApp) are queued with `queueChatAlerts` in the
    event's transaction (`lib/chat/*`). Organisation secrets use `encryptOrgSecret`; hosts an organisation types
    in must pass `assertPublicHost`.
- **Member accounts switch:** `Organisation.memberPortal`. Off, portal queries skip the organisation, member
  emails link to the public page or a signed pay link (`lib/payments/payLink.ts`, `/pay/<token>`), and `/verify`
  is unaffected.
- **Member cards** (`lib/cards/*`):
  - One live card per member and plan. The verify token (in the QR) is 32 random bytes; reissuing revokes the old card. Renewals keep the card, because `/verify` reads `deriveStatus` live.
  - Designs: a card uses its member's primary role design, else its plan's, else the organisation default (`designFor`). Read designs through `withOwnArtwork` so only the organisation's own `member-id-artwork` uploads draw.
  - Approval: owners and managers save drafts (`CardDesign.draft`, `lib/cards/draft.ts`); only the owner (`cards.approve`) approves one (`approveCardDraft`), which copies it into the live columns. Cards, numbering and `/verify` read live rows only (`design` not null); never draw a draft on a member's card.
  - Cards are drawn on demand from the live design (wallet, `/verify`, downloads, emails); only bulk export files are stored, privately, for seven days. The PDF and the PNG must match: `tests/unit/card-pdf-png-parity.test.ts` rasterises both.
  - Card numbers (`lib/cards/numbering.ts`): a pattern with `{SEQ}` per organisation default and per role design, numbered from an `OrgCounter`. A number belongs to a membership: renewals, reinstatements and reissues keep it; a primary role change reissues live cards (`reissueCardsForRoleChange`) with the same number; a `NEW` term on a plan the member had a card for gets a new number and ends the old card (`MEMBERSHIP_ENDED`).
  - Card fonts: Gilroy plus the library in `public/fonts/card` (`lib/cards/fontCatalog.ts`). Change the library only through `scripts/sync-card-fonts.mjs`, which checks licences and rewrites `LICENSES.md`.
  - A card is issued from `activateTerm` on first activation; managers issue, reissue, revoke and email it from the member page.
  - Card text is shaped with fontkit (Gilroy, then Noto for extended Latin, ₹, Malayalam and Devanagari) and drawn as outlines in both the PDF and the PNG. Never draw card text with pdf-lib's `drawText`.
  - Bulk exports are `CardExportJob` rows run by the scheduler pass and stored privately through `lib/storage/private.ts`.
- **Member portal (`/account`):**
  - A person's member records are found only by their account's verified email, lowercased, matched to
    `Member.email` (`lib/portal/member.ts`). Never by a member id alone. Anonymised records never match.
  - Members change memberships only through `lib/membership/service.ts` (`startRenewal`, `decideTerm` with
    the `withdraw` action), so every change writes a status event and an audit row.
  - Erasure anonymises in one place, `anonymiseMember` in `lib/portal/erasure.ts`; money rows are never deleted.
- **User content on public pages** is rendered from parsed trees as React text (`lib/publicPage/markdown.ts`),
  never as HTML strings. Links must pass `isSafeLink`; page images must be this organisation's
  `page-images` uploads. The page document schema lives in `lib/publicPage/sections.ts`.
- **Reports:** definitions live in `docs/REPORTS.md`; the engine in `lib/reports/*` is pure over rows and unit-tested. Finance reports read only `lib/reports/finance/source.ts`. Never add money across currencies.
- **File size:** no source file over 300 lines (owner rule). Split by responsibility; `tests/unit/file-length.test.ts` enforces it, skipping generated files.
- **Operations:**
  - Two images from one `Dockerfile`: `spaceworks-organization-backend` (`runner`; every backend role through
    `scripts/docker-entrypoint.sh --role backend|migrate|scheduler|ops`) and `spaceworks-organization-frontend`
    (`frontend`). Public origins are placeholders replaced at start; never bake an installation's key or origin.
  - Periodic work belongs in `runOutboxScheduler` (`lib/outboxWorker.ts`); Compose stacks run it from the
    `scheduler` role (`SCHEDULER_MODE=external`).
  - Every new environment variable goes into `.env.example`, `.env.production.example`, the compose
    `x-app-env` blocks and `docs/CONFIGURATION.md`.
  - Shell scripts are bash or POSIX sh, LF, and pass `shellcheck -S warning -x`. Host files an update must
    replace are listed in `scripts/install-host-bundle.sh`.
- **Copy:** sentence case, en-GB, buttons named after their action, and no "Oops" or exclamation marks on errors.
- **Line endings:** LF everywhere (see `.gitattributes`). Never commit `.env*` files except the `*.example` ones.
- **Commit trailers:**
  ```
  Co-Authored-By: Shaan-Shoukath <shaanshoukath4522@gmail.com>
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
