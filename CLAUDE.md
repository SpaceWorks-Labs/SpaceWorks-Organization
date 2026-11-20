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
  - S3-compatible storage (Silo on a VPS, R2 or any S3 in the cloud), through the one client in `lib/storage/client.ts`
  - Nodemailer with a database outbox
- **Origins:** platform and ID-card code is derived from SpaceWorks-Events `origin/dev` @ `03186e0`. Copy it from
  there with `git show`, then remove anything event-specific.
- **Design:**
  - **Brand:** the Space Works Design System (`SpaceWorks-Labs/SpaceWorks-Design-System`, cloned at
    `../SpaceWorks-Design-System`, v2.6.0) is the only source of brand truth. Its `docs/current-rules.md` (CR-*) and
    `docs/ux-rules.md` bind. Resync with `npm run design:sync`; `brand/SOURCE.json` records the commit.
  - **UX:** Space Works UX, from the kit's `docs/ux-spec.md`.
  - **Controls:** 10 px radius (`--radius-control`, CR-RADIUS-01); cards and panels 16 px; tags and status pills
    fully round.
  - **Fonts (CR-TYPE-01):** Outfit 400–700 for body and UI; Outfit 600 for product heading roles; Gilroy ExtraBold
    800 for display headings (`.sw-display-headings` on public pages); Unbounded for one accent phrase per layout.
    IDs and code use Outfit tabular figures (`.code-text`). Never request Gilroy 400–700. Receipt PDFs still embed
    Gilroy (the kit's Outfit is a variable font whose default instance is Thin).
  - **Themes:** Light (default) and Dark only, owner decision 2026-11-19, overriding CR-THEME-01's System option
    (never read `prefers-color-scheme`; an old `system` value reads as Light). From the `swo.theme` cookie mirrored
    to localStorage; the server paints it and the nonce'd boot script in `app/layout.tsx` re-applies it before first
    paint. Every control (`ColorModeToggle`, `ColorModeMenuItem`, the `/account` Appearance card) switches through
    `useAppColorMode`, which plays the kit's theme reveal (`lib/themeTransition.ts`). Dark is the neutral black
    family (CR-DARK-01).
  - **Colour:** text is opaque (`text-muted`, never `/80`); small status marks use `bg-*-mark text-on-*-mark` in both
    themes, `*-bg/*-fg` only for large callouts; disabled is `bg-surface text-muted border-line`; charts use
    `--chart-1…5` with `--chart-edge`, five slots at most.
  - **Motion (CR-MOTION-01):** tokens `--sw-dur-fast/base/slow` (120/180/240) and `ease-sw`/`ease-sw-enter`/
    `ease-sw-exit`; transform and opacity only; reduced motion honoured. The Space Works mark opens on hover and
    focus (`SpaceWorksLogo` → `AnimatedLogoMark`); the box loader (`LogoLoader`, `BoxSpinner`) is the only loading
    indicator; route transitions move content only (`template.tsx`); overlays and toasts share `components/ui`
    motion. Tenant logos never animate. The one loop outside a loader is the landing page's sample cards, which
    drift (owner decision 2026-11-19: `components/marketing/CardDeck.tsx`, Pause button, paused on hover, focus,
    off screen and hidden tabs, still under reduced motion). Shared parts: `components/motion/*` (Collapse, StaggerGroup, Skeleton,
    SlidingNav, RouteAnnouncer). Details in `docs/DESIGN.md`.
  - **Delight:** Patch, confetti and card tilt respect `Organisation.delightEnabled` ("Playful touches", default on,
    `app/actions/delight.ts`); reduced motion still wins.
  - **Landing, features and docs (§12.1):** `/` is the landing page (`LANDING_ENABLED`, default on; off → `/`
    follows the data, §12.2), `/features` is built from `lib/features/catalog.ts`, and `/docs` serves
    `docs/features/*.md`, `docs/guides`, `docs/manuals`, `docs/reference` and the operator docs through the
    generated `lib/docs/content.ts` and `lib/docs/search-index.ts` (`node scripts/build-docs.mjs` with
    `scripts/docs/*`, run by `dev`, `build` and `frontend:prepare`). The audit-action and environment-variable
    reference pages are generated from the code; docs follow design-system rule §12.7.
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
npm run build:jobs     # bundle the worker and beat (dist/); then npm run worker / npm run beat
npm run docs:build     # regenerate lib/docs/content.ts and lib/docs/search-index.ts from docs/
npm run landing:cards  # redraw the landing showcase cards with the real card renderer (lib/marketing/sampleCards.ts)
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
bash scripts/vps-status.sh       # installer menu tools: vps-{status,backup-settings,offsite-backup,reconfigure,harden,recover,support,uninstall,renew-certs}.sh
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
- **Units (hierarchy)** (`docs/plans/2026-10-29-hierarchy-roles-analytics.md`):
  - Each organisation names up to four levels (`Organisation.unitLevels`, e.g. Area → Unit) and builds an
    `OrgUnit` tree. `path` is the ancestor ids joined by "/"; `code` is 1–6 of A–Z0–9, unique per organisation, used
    in join links (`?unit=CODE`) and card numbers. Never hard-code an organisation's levels or names.
  - Unit actions live in `app/actions/units.ts` and take `lockOrganisationStructure` (`lib/structure/access.ts`)
    first. Units move only between parents on the same level (paths rewrite; levels and card numbers never change).
  - Staff limited to a unit (`TeamMember.unitId`) see and act only inside its subtree: filter with `teamScope`,
    `memberWhere` and `unitInScope` (`lib/membership/scope.ts`), next to the organisation scope, in every query.
    A plan limited to units admits their whole subtrees (`planOffersUnit`, `lib/membership/planUnits.ts`).
- **Groupings** (`docs/plans/2026-11-19-org-landing-and-groupings.md`, `docs/features/groupings.md`):
  - Extra dimensions beyond units: `OrgGrouping` (list or tree, `multiple`), `OrgGroupingValue` (`path` is ancestor ids joined by "/", ending with the value's own id; `code` 1–12 of A–Z0–9 per grouping) and `MemberGroupingValue`, all with composite tenant FKs. Edit them only through `lib/groupings/service.ts` (under `lockGroupings`) and `lib/groupings/memberValues.ts` (`replaceMemberValues`, replace semantics, archived values refused for new answers). Needs `groupings.manage` (● org-wide only).
  - A plan question of type `GROUPING` (`PlanField.groupingId`) is never stored in `fieldValues`: `resolvePlanAnswers` skips it and `lib/groupings/answers.ts` validates and saves it inside the member row lock. Imports take `grouping:<key>` columns (`lib/groupings/importValues.ts`).
  - Staff limited by grouping (`TeamMemberScope`, `TeamInviteScope`): `teamScope(organisationId, membership)` takes the team member (never a bare unit id) and builds `limits`; `memberWhere` ANDs the unit subtree with one `groupingValues.some` per limited grouping (under `AND`, so nest it when you add your own `AND`). Judge a single member with `memberInScope`/`memberWhere` in the query, never `unitInScope` on a fetched unit path; `ReportScope.limits`, `isLimited` and `limitsKey` (cache keys) carry it through reports. `can`/`canGrant` treat any limit as scoped (`isScopedActor`), and `mayGrant` takes the grant's `limits` so a giver grants only inside their own.
  - Smart groups (`lib/groups/*`): a zod-validated AND/OR/NOT tree compiled to a Prisma filter, never SQL. `smartGroupWhere`, `memberInSmartGroup` (organisation only) and `smartGroupWhereInScope` (with the viewer's reach); filters on the members list, member and card exports use `lib/groupings/filters.ts`. Reports break down by grouping with `lib/reports/groupingBreakdown.ts` (counts only).
- **Money:**
  - Amounts are integer paise.
  - Receipt numbers are gapless per organisation per financial year (April–March, in the organisation's timezone).
  - Paid rows are never edited or deleted; reverse them with credit notes.
  - Payments live in `lib/payments/*` (see `docs/PAYMENTS.md` and `docs/GST.md`). Settle money only through
    `settlePayment` (lock order payment → term → counter); triggers in migration 0005 enforce immutability.
    Gateway secrets need `PAYMENT_SECRETS_KEY`.
  - Refunds go through `createRefund` then `sendRefundToGateway` (`lib/payments/refundGateway.ts`). Member refund
    requests, the policy and approve/decline live in `lib/payments/refundRequests.ts` and `refundPolicy.ts`;
    `reconcileGatewayRefunds` follows up pending gateway refunds from the worker.
  - Other receipts and expenses are `LedgerEntry` rows (`app/actions/accounts.ts`), voided once and never
    deleted (trigger in migration 0009). The receipts and payments account is pure in `lib/accounts/statement.ts`.
  - Offline collection through units: payment instructions resolve per unit then organisation
    (`lib/payments/unitInstructions.ts`); the collection sheet records one transaction per member
    (`lib/payments/collection.ts`); a member's own "I've paid" claim is `Payment.memberClaim` and never counts as
    cash a collector holds (`lib/reports/finance/cashInHand.ts`).
  - Payment modes (`MembershipPlan.paymentMode`, `lib/payments/paymentMode.ts`, `docs/PAYMENTS.md`): `FREE` takes
    no payment (no Payment row, no receipt number); `IN_HAND_ONLY` never uses the gateway (`startCheckout` refuses it,
    `loadPaymentGuidance` gets the mode) and settles from a member's claim and staff confirmation; `ONLINE_OR_IN_HAND`
    uses a usable gateway, else in hand. Renewal conditions live in `MembershipPlan.renewalPolicy`
    (`lib/membership/renewalPolicy.ts`) and are evaluated only inside `startRenewal` (`lib/membership/renewalRules.ts`).
- **Accounts and sign-in** (`docs/SECURITY.md`):
  - Super admins sign in with email and password only, and are created, revoked and given passwords only on
    the server (`docker/ops/admin.mjs` through `scripts/admin.sh`). Never add an in-app or emailed way to make
    a super admin or reset their password; `requireSuperAdmin` checks only `User.isSuperAdmin`.
  - Staff (any `TeamMember`) need an authenticator before the dashboard opens: `requireOrgTeam`,
    `orgActionAccess` and the export and document routes check `hasAuthenticator`. Members never need one.
  - Platform access (owner decision): a verified super admin with an authenticator acts in any organisation as its
    owner (`platformAccess` in `lib/permissions.ts`, `membership.superAdmin`), is never on the team, and is audited
    (`SUPER_ADMIN_ORG_ENTERED`, `SUPER_ADMIN_ORG_ACTION`). Code that needs a real team row must check `superAdmin`.
- **Staff roles** (custom, per organisation):
  - Each organisation defines `OrgRole`s from the fixed permission list in `lib/permissionRoles.ts`
    (`CAPABILITY_LIST`). Owner (`isOwner`) holds every permission and is never edited or given by invite. Starter
    roles (Owner, Manager, Treasurer, Viewer; `starterKey`) reproduce the old fixed roles exactly
    (`tests/unit/permission-roles.test.ts`).
  - Check permissions only with `can(membership, capability, { write })`: views read through
    `requireOrgCapability`, actions change through `orgActionAccess` (write). ◆ `ORG_WIDE_TO_CHANGE` is read-only
    for staff limited to a unit, ● `ORG_WIDE_ONLY` is refused to them, ★ `OWNER_ONLY` is the Owner's alone. Pick
    notification recipients by permission (`staffWithCapability` in `lib/team/roles.ts`), never by role name.
  - Granting goes through `canGrant`/`mayGrant` (`lib/team/granting.ts`): strictly less than the giver holds,
    inside their reach, never their own role. Write a grant with `roleColumns`, which also writes the old
    `TeamMember.role`/`TeamInvite.role` (kept for update rollbacks; migration 0017's triggers keep the previous
    release working). Those columns and triggers go in a later release.
  - New browsers: `lib/loginSecurity.ts` (known-device cookie, emailed code for accounts without an
    authenticator, new-device alert). Failed sign-ins feed `lib/ipBlock.ts`. Every new password passes
    `isBreachedPassword` (`lib/breachedPassword.ts`). Sign-in, sign-out, recovery code use and identity link rows go through
    `lib/authAudit.ts` (method and reason only, never a credential).
- **Phone codes by SMS** (`lib/sms/*`, `lib/authMethods/phone.ts`, `docs/SECURITY.md`): codes, limits and `SmsCode` rows live in `lib/sms/codes.ts` (every request leaves a row, even for unknown numbers, so limits and answers never reveal an account); sends are outbox kind `sms-code` through `platformSmsSender`; providers Twilio and MSG91 sit behind `SmsSender` (`lib/sms/providers/*`), configured like email providers (`lib/sms/config.ts`, Super admin → Auth → SMS). Never put a phone number in audit metadata, a reply or a log.
- **Notifications** (`docs/NOTIFICATIONS.md`):
  - Member-facing emails pass `organisationId` to `sendBrandedEmail`, which uses the organisation's own SMTP
    (`OrgEmailSettings`) or the platform's in its name. Account emails never pass it.
  - Email goes through one `Mailer` interface (`lib/email/providers/*`): SMTP, Amazon SES, Resend or Postmark, for the platform
    (`InstanceSetting.emailProvider`, env `EMAIL_PROVIDER`) and per organisation (`OrgEmailSettings`). Provider secrets are one
    encrypted JSON (`lib/email/providerConfig.ts`), write-only. Every send passes `withSuppression`; provider webhooks
    (`app/api/email/webhooks/[provider]`) are verified before the body is read and feed `EmailSuppression`.
  - Team chat alerts (Slack, Discord, Mattermost, Telegram, WhatsApp, signed webhook) are queued with `queueChatAlerts` in the
    event's transaction (`lib/chat/*`). Organisation secrets use `encryptOrgSecret`; hosts an organisation types
    in must pass `assertPublicHost`.
  - An organisation's own wording for member emails is `OrgEmailTemplate` (`lib/email/templates.ts`): plain text
    with placeholders, escaped into paragraphs, never HTML. Without a row, the platform's wording is used.
- **Join forms and answers** (`docs/plans/2026-10-29-custom-join-form.md`): questions are `PlanField`s; answers
  live on `Member.fieldValues` by key. Validate and save them only through `lib/membership/planAnswers.ts`
  (visibility from validated parents, multi-select stored as LONG_TEXT + `multiple` joined with "; ", sections never
  answered, `answerableKeys` over every plan of the organisation, replace not merge), inside the member row lock
  (`lib/membership/memberLock.ts`). A plan's `joinPhoto` and `joinFields` govern joining only; join photos go through
  `prepareMemberPhoto` before the transaction and `replaceMemberPhoto(..., { onlyIfEmpty: true })` after it.
- **Web analytics** (product rules §8, `docs/features/web-analytics.md`):
  - Outside providers (Plausible, Umami, GA4, Firebase Analytics and Performance, PostHog, Clarity, Sentry; Mixpanel
    from env only) live in `lib/telemetry/*`. They stay off until configured *and* consented per purpose, run only
    for signed-out visitors on approved route templates (`lib/telemetry/routes.ts`), and take public ids only.
  - The platform config is `InstanceSetting.webTelemetry` (super admin, `app/actions/web-telemetry.ts`); each
    organisation's is `Organisation.webTelemetry` (Owner, `app/actions/org-web-telemetry.ts`), used only on its
    `/o/<slug>` pages. Origins must be in `WEB_TELEMETRY_ALLOWED_ORIGINS`.
  - The CSP widens from env only, on public template paths only (`lib/pageSecurity.ts`).
  - In-house visit counts (`WebVisitDaily`, `POST /api/visits`) are counts per organisation, day and route
    template, never people. Platform rows upsert through the partial unique index with raw SQL.
- **Staff invites:** single-use `TeamInvite` links (`/join/org/<token>`). A signed-out visitor can create an
  account (password or OAuth) there; a signed, 30-minute `swo.invite-signup` cookie (`lib/inviteLink.ts`) lifts
  "new sign-ups off" for that flow only, always re-checked against the database (`lib/inviteSignup.ts`), and
  email-bound invites accept only that address. Creating the account claims the invite for that email
  (`TeamInvite.signupEmail`, one account per invite). It never makes a super admin.
- **Sessions and linking** (`docs/SECURITY.md`): every sign-in writes a `UserSession` row whose id (`sid`) is in the JWT and checked on every request (`lib/userSessions.ts`); an outside identity is linked only from a live session with a signed link intent (`lib/linkIntent.ts`, `oauthSessionGate`, `linkExternalIdentity`); unlinking must leave `countWorkingMethods` at 1 or more (passkeys and phone add their counter there).
- **Supabase and Firebase sign-in** (`lib/bridgeTokens.ts`, `lib/bridgeSignIn.ts`) verify the provider token against
  its JWKS and never link to an existing account by email: a bridge signs in only the account it created, by `sub`.
  Sign-in methods are switches on `InstanceSetting` (`lib/loginMethods.ts`), fixed by env `LOGIN_METHODS` from install.
  **Only password is on by default** (product rules §15); every other method is off until switched on, hidden everywhere
  when off, and refuses with `method_disabled` (`lib/authMethods/gate.ts`, `authorize`). Provider assembly lives in
  `lib/authMethods/` (one module per method family, built by `index.ts`; a new method is one module and one line).
  **OIDC** (`OidcProvider`, any number) and **SAML** (`SamlProvider`, `@node-saml/node-saml`, `docs/decisions.md`,
  routes under `app/api/auth/saml/[slug]`, one-time ticket into the `saml` Credentials provider) never link to an existing
  account by email: `link_from_account` (`identityRefusal(..., { linkByEmail: false })`); only Google, Apple and GitHub link
  by verified email. Client secrets are write-only. Per-email growing delay: `lib/signInBackoff.ts`. Without an email
  service (`lib/emailAvailability.ts`) "Forgot?" is hidden and the emailed new-browser code is skipped. Audit rows:
  `lib/authAudit.ts`.
  **Passkeys** (WebAuthn; `@simplewebauthn`, `docs/decisions.md`; `lib/passkeys/*`, `lib/authMethods/passkey.ts`) are registered only from a signed-in session, need user verification, and never replace the authenticator for staff or the password for super admins.
- **Member messaging** (`docs/NOTIFICATIONS.md`, "Member messages on every channel"): every member message is a `MemberMessageKind` (`lib/messages/kinds.ts`) queued with `queueMemberMessage(tx, …)` (`lib/notify/send.ts`) and delivered once by `deliverMemberMessage` (`lib/notify/deliver.ts`) through the organisation's per-kind route (email, SMS, WhatsApp, Telegram, Slack, Discord, Mattermost) on the first channel the member has linked and opted into; never send a member channel message any other way. Connections resolve organisation, then platform (`lib/notify/store.ts`); secrets are write-only (`encryptOrgSecret` purpose `messaging`, `assertPublicHost` for Mattermost); webhooks are verified before reading (`lib/notify/verify.ts`); WhatsApp goes only through approved templates; every text carries the stop link; logs and audit rows never hold text, numbers or addresses. Reminder kinds are queued once per term from `lib/membership/sweep*.ts` through `ReminderLog`.
- **Member limit:** creating a member (join, import, add) calls `hasRoomForMember` (`lib/membership/memberLock.ts`) after `lockMemberByEmail`, inside the creating transaction, so concurrent creates can't pass `memberLimit`.
- **Public page PDFs:** the downloads section takes the organisation's own `page-images` or `page-files` keys. A PDF is stored only through `uploadFile` (`%PDF-` sniff, 5 MB cap, `lib/storage/pageFiles.ts`) and served by `/api/uploads` only as an attachment with a safe name.
- **Member accounts switch:** `Organisation.memberPortal`. Off, portal queries skip the organisation, member
  emails link to the public page or a signed pay link (`lib/payments/payLink.ts`, `/pay/<token>`), and `/verify`
  is unaffected.
- **Member cards** (`lib/cards/*`):
  - One live card per member and plan. The verify token (in the QR) is 32 random bytes; reissuing revokes the old card. Renewals keep the card, because `/verify` reads `deriveStatus` live.
  - Designs: a card uses its member's primary role design, else its plan's, else the organisation default (`designFor`). Read designs through `withOwnArtwork` so only the organisation's own `member-id-artwork` uploads draw.
  - Built-in designs (`lib/cards/design/presets.ts`, `templates.ts`, `sides.ts`): fronts caption the QR (`showQrCaption`, off for designs saved before it); backs print `{contact}` (the organisation's website, email and phone, loaded in `holderFor`), a signature line and how to check the card. Template decoration never runs along the card's edges; `tests/unit/card-templates.test.ts` checks fit, overlap and 4.5:1 for every template.
  - Approval: owners and managers save drafts (`CardDesign.draft`, `lib/cards/draft.ts`); only the owner (`cards.approve`) approves one (`approveCardDraft`), which copies it into the live columns. Cards, numbering and `/verify` read live rows only (`design` not null); never draw a draft on a member's card.
  - Cards are drawn on demand from the live design (wallet, `/verify`, downloads, emails, bulk downloads) and never stored. The PDF and the PNG must match: `tests/unit/card-pdf-png-parity.test.ts` rasterises both.
  - Card numbers (`lib/cards/numbering.ts`): a pattern with `{SEQ}` per organisation default and per role design, numbered from an `OrgCounter`. A number belongs to a membership: renewals, reinstatements and reissues keep it; a primary role change reissues live cards (`reissueCardsForRoleChange`) with the same number; a `NEW` term on a plan the member had a card for gets a new number and ends the old card (`MEMBERSHIP_ENDED`).
  - Card fonts: Gilroy plus the library in `public/fonts/card` (`lib/cards/fontCatalog.ts`). Change the library only through `scripts/sync-card-fonts.mjs`, which checks licences and rewrites `LICENSES.md`.
  - Editor (`docs/DESIGN.md` "Member cards"): layers (`lib/cards/design/layerTypes.ts`, at most `MAX_LAYERS` per side) are text, image, shape, icon, qr, barcode and photo, normalised strictly by `layerNormalize.ts` (unknown kinds, icons and bad paths dropped; old designs read unchanged). The front and back are edited the same way. Pure editor operations live in `lib/cards/design/editor/*`, the element library in `lib/cards/design/library/*`, and the canvas in `components/cards/designer/**` and `components/cards/layerArt/*`. New kinds draw from shared outlines (`path.ts`, `shapes.ts`, `paint.ts`) in both `svgVector.ts` and `pdfVector.ts`; image crop, mask and adjustments go through sharp first (`artPrepare.ts`) so both formats get the same pixels (`tests/unit/card-parity-layer-kinds.test.ts`). Brand kit (`CardBrandKit`, `lib/cards/brandKit.ts`): logos go on a card only as copies in `member-id-artwork` (`app/actions/card-artwork.ts`). Versions (`CardDesignVersion`, 30 per design, `lib/cards/versions.ts` under the design row lock) and `CardTemplate`s are organisation-scoped; "preview with a member" loads only members inside the viewer's `teamScope`.
  - A card is issued from `activateTerm` on first activation; managers issue, reissue, revoke and email it from the member page.
  - Card text is shaped with fontkit (Gilroy, then Noto for extended Latin, ₹, Malayalam and Devanagari) and drawn as outlines in both the PDF and the PNG. Never draw card text with pdf-lib's `drawText`.
  - Bulk downloads stream from `app/api/exports/cards/[orgSlug]` (`lib/cards/bulk.ts`): a ZIP written one PDF at a time (`BULK_ZIP_LIMIT`) or one combined PDF (`BULK_PDF_LIMIT`), under the one-at-a-time render slot (busy → 429). `CardExportJob` is no longer written; `lib/storage/cleanup.ts` deletes old stored files, and the table goes in a later release.
  - Member photos live per member at `organisations/<org>/members/<member>/photo-<uuid>.webp` (`lib/storage/memberPhotos.ts`), saved only through `replaceMemberPhoto` (`lib/membership/photo.ts`), by managers or, with `Organisation.memberPhotoUpload`, by the member from `/account`. Erasure deletes the member's whole prefix through a `member-photo-purge` outbox job queued in the erasure transaction (retried until storage agrees).
  - Scanning a card (`/verify/<token>`, `lib/views/app__verify__token__page.ts`): staff of the card's organisation who read members, with an authenticator and the member inside their unit scope (`staffScanAccess`, `lib/cards/staffScan.ts`), get that organisation's record only, through the member page's loaders and panels (so the existing actions and checks apply), audited as `CARD_SCANNED`. Everyone else, including other organisations' staff and staff limited to another unit, gets the public check, which also draws the card (`app/api/verify/[token]/card`, `loadPublicCard` in `lib/cards/publicCard.ts`) only while it is live and valid or in grace, the member is not erased and the organisation is active. Like `/verify`, this ignores `memberPortal`.
- **Member portal (`/account`):**
  - A person's member records are found only by their account's verified email, lowercased, matched to
    `Member.email` (`lib/portal/member.ts`). Never by a member id alone. Anonymised records never match.
  - Members change memberships only through `lib/membership/service.ts` (`startRenewal`, `decideTerm` with
    the `withdraw` action), so every change writes a status event and an audit row.
  - Erasure anonymises in one place, `anonymiseMember` in `lib/portal/erasure.ts`; money rows are never deleted.
- **User content on public pages** is rendered from parsed trees as React text (`lib/publicPage/markdown.ts`),
  never as HTML strings. Links must pass `isSafeLink`; page images must be this organisation's
  `page-images` uploads. The page document schema lives in `lib/publicPage/sections.ts` (20 section types and
  templates). Live counts are aggregates only with counts under 5 suppressed (`lib/publicPage/counts.ts`); the
  sample card uses fictional or team sample data, never a real member (`lib/publicPage/sampleCard.ts`); video
  embeds are YouTube (nocookie) and Vimeo (do-not-track) only, and the CSP widens for them on `/o/*` only.
- **Reports:** definitions live in `docs/REPORTS.md`; the engine in `lib/reports/*` is pure over rows and unit-tested. Finance reports read only `lib/reports/finance/source.ts`. Never add money across currencies. Super-admin analytics (`app/super-admin/analytics`, per organisation under `orgs/[orgId]/analytics`) show aggregates only, never member names or contact details.
- **Read cache** (`lib/cache.ts`, `docs/ARCHITECTURE.md` "Read cache"): Redis read-through for aggregates only
  (platform and organisation analytics, the public page's plans and content), fail-open to the loader. Build keys
  only with `orgCacheKey`/`analyticsCacheKey`/`platformCacheKey` (organisation id always; analytics keys carry the
  viewer's unit scope), keep permission checks outside `cached`, and call `invalidateOrg` where the source rows
  change. Never cache money state, permissions, member records, cards, `/verify`, pay pages or write paths.
- **File size:** no source file over 300 lines (owner rule). Split by responsibility; `tests/unit/file-length.test.ts` enforces it, skipping generated files.
- **Operations:**
  - Two images from one `Dockerfile`: `spaceworks-organization-backend` (`runner`; every backend role through
    `scripts/docker-entrypoint.sh --role backend|migrate|worker|beat|ops`) and `spaceworks-organization-frontend`
    (`frontend`). Public origins are placeholders replaced at start; never bake an installation's key or origin.
  - **Background jobs** (BullMQ, `lib/queue/`): named queues `outbox` and `scheduled` (`definitions.ts`); Redis
    carries ids and registry names only, and the SQL outbox (`enqueueOutbox` in the business transaction) stays
    the record. Periodic work is a `JobDefinition` in `lib/queue/registry.ts` (`SCHEDULED_JOBS`) and nowhere else.
    The `beat` role (`scripts/queue/beat.ts`) upserts the repeatable schedules; the `worker` role
    (`scripts/queue/worker.ts`) runs them and delivers outbox rows one id at a time. Both are bundled by
    `scripts/build-jobs.mjs` into `dist/` and expose `/health` on `JOBS_HEALTH_PORT`. Hosts without a beat can
    call `POST /api/internal/jobs` and `/api/internal/outbox` with `CRON_SECRET`. Hosts with no worker at all have an
    online cron (`deploy/cloudflare-cron`) call `POST /api/internal/run-jobs`, which runs the due registry jobs and
    the outbox in the request (`runDueJobsInline`, `lib/queue/inline.ts`, each occurrence claimed once in Redis); use it
    or a worker, never both. Local development without
    Redis may set `JOBS_INPROCESS=true` (`runOutboxScheduler` in `lib/outboxWorker.ts` on a one-minute timer).
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
