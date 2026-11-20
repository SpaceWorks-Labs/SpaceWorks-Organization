# Design System v2.5.1, landing and features pages, docs, motion and web analytics (0.9.0)

Status: approved by the owner on 2026-11-19 ("yes proceed").

Resolved decisions (recommended defaults, which the owner may overrule):

- **D1:** 10 px controls.
- **D2 (owner overruled, 2026-11-19): analytics is configured both for the platform and per organisation.**
  - **Outside providers:**
    - The platform config runs on platform public pages.
    - Each organisation's own config (`Organisation.webTelemetry`) runs only on its `/o/<slug>` pages and join
      template.
    - Origins must still be on the operator's env allow-list.
    - Owners edit their organisation's config. The super admin sees and edits every organisation's config through
      platform access, plus a platform overview of which organisations use which providers.
  - **In-house counts (§8.1, always on):**
    - `WebVisitDaily` holds counts per organisation (null for the platform) per day, route template and channel,
      and stores no people.
    - Counts are recorded by a same-origin beacon from public pages. The template is checked against the allow-list,
      the visitor is rate-limited by IP through Redis, and the IP is never stored.
    - Organisation reports and analytics show the organisation's own visits (owners and staff who read reports,
      within their unit scope where relevant).
    - Super-admin analytics shows the platform total and every organisation.
  - **Work split:** this is B4c (Sonnet), after B4a.
- **D3:** en-GB only, recorded as a gap.
- **Auth:** Auth.js stays in every deployment mode (VPS, hybrid, cloud). Supabase Auth is the preferred managed
  option if one is ever wanted, but it is not in this release.

## Ask (owner, 2026-11-19)

- Adopt the new Space Works Design System (v2.5.1, `SpaceWorks-Labs/SpaceWorks-Design-System`) everywhere: colour,
  type, theme, motion, loader and components.
- A proper landing page that follows every rule (product rules §12.1), with docs and GitHub links. Per-organisation,
  per-area (units) and staff detail goes on a separate **Features** page, the way SpaceWorks does it (decision 340a),
  not on the landing page.
- All the animations, including on organisations' public pages.
- Analytics: Microsoft Clarity, Firebase and the rest of the providers named in product rules §8.2, plus Mixpanel
  (§8.3).
- Use Sonnet subagents for feature work and Opus subagents for UI work.

## Sources

The kit is at `../SpaceWorks-Design` (main, `d92ffc1`, VERSION 2.5.1). The app last synced from `c9bf941`.

- **Binding rules:** `docs/current-rules.md`, `docs/ux-rules.md`, and `docs/product-rules.md` §8, §11 and §12.1.
- **Implementation guides:** `docs/theming.md` and `docs/motion.md`.
- **Motion templates:** `motion/*`.
- **Reference ports:**
  - Hub landing and docs viewer: SpaceWorks worktree `int-stage-r2final` (`frontend/src/features/hub`,
    `features/docs`, `components/brand`, `lib/motion`).
  - Telemetry: SpaceWorks `dev` (`frontend/src/lib/telemetry/*`, `backend/apps/makerspaces/telemetry_schema.py`).

## Decisions needed from the owner

- **D1, control radius.**
  - The kit's CR-RADIUS-01 is 10 px controls, and it notes "no later owner switch to pill controls is recorded".
  - This app records an owner decision for pills (J1).
  - "Follow it everywhere" suggests 10 px. It is a one-token change (`--radius-control`), plus docs.
- **D2, analytics scope.**
  - Option 1 is the platform only: the operator configures it for the public site.
  - Option 2 also lets each organisation configure page analytics for its own public page `/o/<slug>`. It would
    still never run on dashboard, account, pay or verify pages.
  - Recommendation: platform only now (option 1), with per-organisation support as a follow-up.

- **D3, translations.** Product rules §11 says every string can be translated. The app is en-GB only today, with
  no i18n library. The options are to add Lingui now (a large, separate piece of work) or to record en-GB-only as
  a known gap for this release. Recommendation: record it as a gap now, and do i18n as its own release.

## Review changes (v2, after the Claude plan review)

Where this section and the phases below disagree, this section wins. For example, the delight field moves to
Phase A, `LANDING_ENABLED` off follows the data, and docs are a generated module rather than
`outputFileTracingIncludes`.

- **One migration (0022), made in Phase A:** `InstanceSetting.webTelemetry Json?` and
  `Organisation.delightEnabled Boolean @default(true)`. CR-MOTION-01 requires delight to be on by default with each
  space's opt-out. Every B branch starts from Phase A's commit, and nothing else touches `schema.prisma`.
- **All new dependencies are installed once in Phase A:** `posthog-js`, `@sentry/browser`, `firebase`,
  `react-markdown` and `remark-gfm`, plus `jsdom` as a dev dependency. Phase A also checks they resolve in the
  frontend build. No B agent edits `package.json` or the lockfile; script hooks are Phase C.
- **Files reserved for Phase C (integration), never edited by B agents:**
  - Routing: `components/chrome/ChromeSwitch.tsx` (add `/features` and `/docs` to the site prefixes) and
    `app/sitemap.ts`.
  - Root shell: `app/layout.tsx` and `components/providers.tsx`.
  - Generated: `lib/frontend/registry.ts` and `frontend/catalog.json` (`npm run frontend:catalog` once).
  - Release: `frontend/package.json`, `VERSION` and `CHANGELOG.md`.
  - B agents list what they need wired in their report.
- **B1 keeps names and props:** `SpaceWorksLogo`, `BrandLoader` and `Spinner` keep their exports. Only what they
  render changes, so callers in B2 and B3 need no edits.
- **Ownership:** `template.tsx` under `app/o` belongs to B3, and `components/about/*` belongs to B2. B3's cleanup
  covers the explicit list in the visual audit (DeployTabs and LandingSections go to B2, and the rest go to B3).
- **CSP:**
  - Both `proxy.ts` files are edited by hand, and widening comes from env only (`WEB_TELEMETRY_ALLOWED_ORIGINS`,
    plus the Mixpanel hosts while `WEB_TELEMETRY_MIXPANEL_TOKEN` is set). That env is set on the frontend and the
    backend; it is runtime env, never `NEXT_PUBLIC_`.
  - `connect-src` becomes `'self'` plus `NEXT_PUBLIC_BACKEND_ORIGIN` plus the Razorpay hosts on `/account` and
    `/pay/`.
  - Fix the existing bug: `/pay/<token>` needs the Razorpay `frame-src`.
  - Because of `'strict-dynamic'`, `script-src` host lists don't limit anything. The real limits are the controller's
    consent gate and `connect-src`.
  - `img-src`/`font-src https:` beacons are a known gap, recorded in `docs/SECURITY.md` (tenant images need
    `https:`).
- **Anonymous only:**
  - The server decides per request: the telemetry view reader returns config only when there is no session, so
    signed-in pages never receive it.
  - A soft navigation after sign-in or sign-out (server action) runs a `useSession` status change listener that
    stops the providers and does a full reload.
  - Also port `boundary`, `replayRoutes`, `runtime`, `scope` and `webAnalytics` (`analyticsTemplate`, `isBearerUrl`).
    `sessionFence` is replaced by the server rule above.
- **Docs in split hosting:** `scripts/build-docs.mjs` generates a typed content module (`lib/docs/content.ts`, which
  is generated and skipped by the file-length test) from `docs/features/*.md` and the operator docs. Both builds
  import it, so no `fs` is used at runtime. `proxy.ts` needs no change. Every feature doc links the API reference
  (or states that there is no public API yet).
- **Markdown safety:** `react-markdown` plus `remark-gfm`, no `rehype-raw`, and links filtered by `isSafeLink`.
- **§12.2:**
  - With `LANDING_ENABLED` off, `/` follows the data: one public organisation opens `/o/<slug>`, several open
    `/organisations`, and none opens sign-in.
  - `/o/<slug>` keeps the product links (features, docs, GitHub) in its footer credit (B3).
- **Binding rules made explicit in Phase A:**
  - CR-SIDEBAR-01: Citron in light, `#0B0B0B` in dark, 256 px, 20 px inset, 44 px items, filled teal current item.
  - CR-LOGO-01: four flap colours, through B1's box-open port.
  - CR-CONTENT-01: copy pass in B2 and B3.
- **Screenshots:** capture them once for 0.9.0 with a short Playwright script (`scripts/capture-screens.mjs`).
  Light and dark are required.

## Phase A: foundation (sequential, one Opus agent, then reviewed)

1. **`scripts/sync-design.mjs`.**
   - Copy `Outfit-Variable.woff2` and `LICENSES/OFL-Outfit.txt`.
   - Parse every `:root` and `:root.dark` block, so chart tokens, motion tokens, `--color-scrim`, the reduced-motion
     rule and `.sw-kiosk`/`.sw-tv` come through.
   - Rename `var(--color-*)` references inside those blocks.
   - Rerun it, then update `brand/SOURCE.json` to `d92ffc1`.
2. **Type (CR-TYPE-01).**
   - Outfit 400–700 for body and UI (body weight 400).
   - Gilroy has real weights only (300 and 800): ExtraBold for the display roles and public h1/h2.
   - Product heading roles (`.text-h1…h4`, base h1–h4, `.text-title`, `.text-overline`) become Outfit 600.
   - Drop `--font-mono` and `.text-mono` for Outfit tabular figures plus `.code-text`.
   - Emails (`lib/email/brand.ts`) and the receipt PDF (`lib/payments/pdf.ts`) move to Outfit.
   - Organisation-designed cards keep their own font catalogue. Outfit is added to the card font library through
     `scripts/sync-card-fonts.mjs`, and existing card designs are not changed.
3. **Colour (CR-DARK-01, CR-STATUS-01, CR-OPACITY-01, CR-DISABLED-01, CR-CHART-01).**
   - **Dark theme:** the neutral black dark family comes from the resynced tokens. Re-derive `semantic.css` emphasis
     and danger-bg against black. Scope `.sw-dark-band` to light pages.
   - **Scrims:** use the `scrim` token in `ui/dialog.tsx` and `SiteHeader.tsx`.
   - **Status chips:** solid fill plus `on-*` in both themes; soft fills only for large callouts in dark.
   - **Text and disabled states:** replace every translucent-text and opacity-dimmed text use (about 30 places in the
     audit) with `muted` plus a status word.
   - **Disabled controls:** `bg-surface text-muted border-line`; `aria-disabled` also blocks keyboard activation.
   - **Charts:** `app/styles/charts.css` moves to `--chart-1…5` plus `--chart-edge`: a 1 px edge on filled marks and a
     4 px casing under lines, a 5-slot cap, and danger never used as a series.
   - **Sidebar:** 20 px inset; the organisation switcher stays text-only (no logos in nav rows).
4. **Theme (CR-THEME-01).**
   - Light, Dark and System, with Light as the fallback.
   - A nonce'd pre-paint boot script reads the saved choice (cookie, mirrored to localStorage). It checks the OS only
     for System, sets `html.dark` and updates `meta[name=theme-color]`.
   - Cross-tab updates through the `storage` event, and OS changes followed only while System is chosen.
   - A picker in the user menu and the public header replaces the two-state toggles.
   - Keep the existing 720 ms circle reveal and align it with `motion/theme-reveal`.
5. **Motion tokens (CR-MOTION-01).**
   - `--sw-dur-*` 120/180/240 and the standard, enter and exit curves replace `--ease-sw` and the 360/420 ms values.
   - Hover is colour only, with a 0.98 press sink.
6. **Radius:** per D1.

## Phase B: parallel agents, disjoint files

**B1 (Opus): shared motion components.**
- **Files:** `components/brand/*` (new `AnimatedLogoMark`, `LogoLoader`, `BoxSpinner`, `boxOpen/*`), the
  `components/ui/*` primitives, `components/feedback/ToastProvider.tsx`, new `components/motion/*`,
  `app/styles/motion*.css`, and `loading.tsx` files.
- **Logo:** the logo hover/focus box-open replaces the static `SpaceWorksLogo` everywhere the Space Works mark
  appears. It plays once, never on touch or under reduced motion, and tenant logos stay still.
- **Loaders:** the box loader replaces the hopping-dots `BrandLoader` and the ring spinner.
- **Page motion:**
  - Route transition on the content area only, via `template.tsx` per shell.
  - Scroll restoration and a route announcer.
  - Overlays (dialog, menu, sheet) with exit animations through `usePresence`.
  - A sliding indicator on tabs and the sidebar.
  - `Collapse`/`Disclosure` and a stagger rise (first 8 items).
  - Skeleton, and a progress bar driven by transform.
- **Toasts:** 8 s, paused on hover and focus, errors persist.
- **Port:** from the kit `motion/*` React folders, replacing react-router and Lingui.

**B2 (Opus): landing page, features page, header and footer.**
- **Files:** `app/page.tsx`, `components/marketing/*`, new `app/features/*` and `lib/features/catalog.ts`,
  `components/chrome/SiteHeader.tsx`, `SiteFooter.tsx` and `lib/openSource.ts`.
- **Landing (§12.1):**
  - Hero with the name and a one-line promise.
  - Box splash on a cold load, and the logo hover.
  - A scroll-reveal story with `data-reveal`, 640 ms, once (no scrubbing replays).
  - A section per feature area at headline level only, linking to `/features`.
  - The kit's quiet symbol pattern and a rounded Deep Ink island.
  - Screenshots in light and dark.
  - Links in the header and footer: GitHub repository, latest release (from `VERSION`) with the install one-liner,
    `/docs`, AGPL licence and changelog.
  - No loops outside a loader (the card strip pauses by default or goes).
- **`LANDING_ENABLED`** (default on): when it is off, `/` follows the data (§12.2): one public organisation opens
  `/o/<slug>`, several open `/organisations`, and none, or a failed lookup, opens sign-in. It goes through env and
  the compose blocks, and is documented.
- **`/features`:**
  - Built from one catalogue (`lib/features/catalog.ts`) so it cannot drift.
  - Covers per-organisation tenancy; units and areas (levels, the unit tree, join links by unit code); staff and
    custom roles with unit scope; plans and join forms; renewals; payments (Razorpay, Stripe, offline, unit
    collection); GST receipts and refunds; ID cards and verify; member portal; public page; reports and analytics;
    notifications and chat alerts; and self-hosting.
  - Each area states what it does, who can use it, and how to switch it on.
- **Screenshots:** `scripts/capture-screens.mjs` (Playwright, seeded demo) writes `public/screens/*-{light,dark}.webp`.

**B3 (Opus): public organisation pages and an app-wide cleanup.**
- **Files:** `app/o/*`, `components/public/*`, `app/organisations/*`, `app/verify/*`, `app/pay/*` and the visual
  side of `(auth)` (BrandFacets entrance only). It does not touch `app/join/org/*` or the login logic, which belong
  to B5. Plus the colour-cleanup files the audit listed outside B1 and B2's lists.
- **Motion on public pages:**
  - Route transition with the tenant header still.
  - Stagger on plan cards and the directory grid; the directory gets the kit's `SearchField`.
  - The FAQ uses `Disclosure`; long pages get `data-reveal`.
  - The verify stamp (`PassState`) on verify, and the success arrival on the join outcome.
  - `BrandFacets` entrance on sign-in.
- **Delight:** Patch, confetti and card tilt respect the per-organisation opt-out (`Organisation.delightEnabled`,
  default true). The field and migration 0022 come from Phase A. B3 owns the toggle in organisation settings and
  its action, written like the existing organisation-settings actions: `orgActionAccess` (write), audited, and
  `invalidateOrg`.
- **Product links:** the `/o/<slug>` footer credit keeps the features, docs and GitHub links (§12.2.4).

**B4a (Sonnet): web telemetry.**
- **Files:** new `lib/telemetry/*`, `components/telemetry/*`, `lib/pageSecurity.ts`, `frontend/proxy.ts` and its
  hand-written CSP (edited by hand), `app/super-admin/settings` (a new "Web analytics" section), new
  `app/actions/web-telemetry.ts` (the schema field comes from Phase A; no schema edits), `app/privacy/page.tsx`,
  both `proxy.ts` files, env files and docs.
- **Sign-in fence:** sign-in, sign-out and account switching end with a full page load (`window.location.assign`),
  so no provider survives into a signed-in page. A Playwright test proves it: sign in from a public page with
  telemetry consented, then no vendor request follows.
- **Port:** from SpaceWorks `dev`:
  - `policy`, `controller`, `providers`, `consentScope`, `boundary`, `replayRoutes`, `runtime`, `scope` and
    `webAnalytics` (`analyticsTemplate`, `isBearerUrl`), with a segment matcher in place of react-router's
    `matchRoutes`.
  - `sessionFence` is not ported. Instead, the telemetry view reader returns config only when there is no session,
    and the sign-in fence below handles the rest.
  - Adapters for Plausible, Umami, GA4, Firebase Analytics, Firebase Performance, PostHog (analytics and replay),
    Clarity, Sentry and Mixpanel.
  - `client = "web"` on every event.
- **Rules:**
  - Off unless configured *and* the visitor consented to that purpose (analytics, replay, diagnostics). No script,
    request, cookie or storage key before consent. Withdrawing stops the provider at once.
  - At most one page-analytics provider, and GA4 or Firebase, not both.
  - Settings take public ids only, validated by zod (a port of `telemetry_schema.py`). Endpoints must be in the env
    `WEB_TELEMETRY_ALLOWED_ORIGINS`.
  - Changes are audited by field name (`WEB_TELEMETRY_UPDATED`).
  - Mixpanel stays env only (`WEB_TELEMETRY_MIXPANEL_TOKEN`, API and SDK hosts).
- **Routes:**
  - Templates only, on an allow-list: `/`, `/about`, `/features`, `/docs`, `/docs/:slug`, `/organisations`,
    `/o/:orgSlug`, `/privacy` and `/terms`. The join form template is allowed for analytics only.
  - Everything else returns null and fails closed: tokens, pay, verify, auth, dashboard, account, super-admin.
  - Query strings and hashes are dropped.
  - Providers run only for anonymous sessions; any session change stops them and reloads.
- **Replay:** only on anonymous public routes, masked: Clarity on `/about` and `/features`, PostHog on the public set.
- **CSP:**
  - `connect-src` becomes `'self'` plus `NEXT_PUBLIC_BACKEND_ORIGIN` plus the Razorpay hosts on `/account` and
    `/pay/`. Uploads are same-origin `/api/uploads`.
  - Fix `/pay/<token>`: it needs the Razorpay `frame-src`.
  - Widening comes from env only, in both proxies: `WEB_TELEMETRY_ALLOWED_ORIGINS` are added to connect-src (and
    script-src) only on public template paths, and only when the env is set. Mixpanel hosts are added only while
    `WEB_TELEMETRY_MIXPANEL_TOKEN` is set. The proxies never read the database.
  - `'strict-dynamic'` makes script-src host lists inert. The real limits are the controller's consent gate and
    `connect-src`. The `img-src`/`font-src https:` beacon gap is recorded in `docs/SECURITY.md`.
- **Consent UI:** a "Privacy preferences" panel (three purposes) shown on public pages when something is configured,
  with a footer link to reopen it. The privacy page wording becomes conditional.
- **Dependencies:** installed in Phase A (see below). B4a does not edit `package.json`. The SDKs load through
  dynamic imports only.
- **Tests:** a provider matrix (nothing before consent, withdrawal stops it), the controller, routes, proxy headers
  (no widening on private paths or when unconfigured), and Playwright with `page.route` (no vendor request, cookie
  or storage before consent).

**B4b (Sonnet): `/docs` viewer and feature docs.**
- **Files:** new `app/docs/*`, `components/docs/*`, `docs/features/*.md`, `scripts/build-docs.mjs`, and the
  generated `lib/docs/content.ts`. No schema, `package.json` or `proxy.ts` edits. Phase C hooks `build-docs` into
  the `build`, `dev` and `prepare-frontend` scripts, and adds the generated file to the file-length skip list.
- **Viewer:** `react-markdown` plus `remark-gfm` (no `rehype-raw`, links filtered by `isSafeLink`), reading the
  generated module with no `fs` at runtime. A slug allow-list covers `docs/features/*.md` and the operator docs
  (never `plans/`). It has a sidebar and a table of contents, and is built only from tokens in both themes.
- **API links:** every feature doc links the API reference, or states that there is no public API yet.
- **Feature docs:** one page per feature area, matching the `/features` catalogue: what it does, roles, how to switch
  it on or off, and screenshots in both themes.

**B5 (Sonnet): staff join by invite link (owner, 2026-11-19).**
- **What the owner wants:** "I will give a link with which he registers via email/password or Gmail auth".
- **What exists today:** single-use `TeamInvite` links (`/join/org/<token>`) with a role and an optional unit. A
  signed-out visitor gets only "Accept invite", which then fails. Sign-up is blocked when
  `allowNewUserSignups` is off, and email verification does not return to the invite.
- **Files:** `app/join/org/*` (taken out of B3's list), `components/invites/*`, `app/actions/auth.ts`,
  `app/actions/invite-acceptance.ts`, `lib/inviteAcceptance.ts`, `lib/auth.ts` (the `signIn` callback only), the
  verify-email page and action return path, and the login page `callbackUrl` handling where needed.
- **Invite page for a signed-out visitor:**
  - Create account (name, email, password) inline.
  - Continue with Google, plus Apple and GitHub if the super admin enabled them.
  - Sign in, for people who already have an account.
  - The page states the organisation, role and unit as it does today.
- **Sign-ups switched off:**
  - A valid, unused, unexpired invite still allows creating an account, by password or OAuth.
  - It works through a short-lived httpOnly invite cookie (signed, `SameSite=Lax`, about 30 minutes) set from the
    invite page, which the `signIn` callback and `signUpWithPassword` re-check against the database.
  - An invite with `email` set accepts only that verified email.
  - The super-admin rule is unchanged: invites never make a super admin.
- **After sign-up:** the email verification link carries the invite return path (a same-origin
  `/join/org/<token>` only, validated). The visitor lands on the invite and accepts it in one step. The existing
  authenticator requirement still applies before the dashboard opens.
- **Security:**
  - Rate limits as they are today.
  - The invite cookie never grants anything on its own; it only lifts the sign-up switch for that one flow.
  - Expired, used or revoked invites refuse.
  - Every acceptance is audited as it is today.
- **Tests:** unit tests for the cookie and redirect validation; integration tests for sign-up while sign-ups are off
  (allowed with a valid invite, refused without one, refused for a used or expired invite, refused for the wrong
  email on an email-bound invite); and an e2e test for the signed-out invite page showing the account options.
- **UI:** uses only the existing `components/ui` primitives and tokens, and gets an Opus visual pass in the Stage 4
  review.

**B6 (Sonnet): sign-in methods chosen at install, plus the Supabase and Firebase bridges (owner, 2026-11-19).**
- **What the owner wants:** "proper auth: Apple, GitHub and email, an OAuth setup like SpaceWorks set up using the
  hosting, and Supabase and Firebase auth too, all types of auth".
- **Switches:** platform login-method switches on `InstanceSetting` (password, Google, Apple, GitHub, Supabase,
  Firebase), on by default and placed in front of each method's configuration, as SpaceWorks'
  `PlatformLoginMethods` does.
  - The env `LOGIN_METHODS` from install wins.
  - `setup.sh`/`setup.ps1` ask which options to offer and write the env.
  - `scripts/admin.sh login-methods` changes them later.
  - Super admin → Auth shows the status.
- **Supabase Auth and Firebase Auth:** identity bridges with public config from env only. The browser signs in with
  the provider's SDK, and the server verifies the token with jose against the provider's JWKS (verified email
  only). A user is created or linked by email under the existing `signIn` rules: super admins refused, the
  creation gate including invite cookies, the staff authenticator requirement, and known devices.
- **CSP:** widens only on auth paths and only when the env is set.
- **Existing providers:** Apple's form-post cookies, GitHub's private email and Google's `email_verified` are
  checked and fixed where needed.

## Phase D: Design System v2.6.0 rules (DS-10, published 2026-11-19 12:18 UTC)

The kit folder is now `../SpaceWorks-Design-System`, at `5225d59`. v2.6 adds rules only, with no token changes.

- **D6 (Claude): §8.4 shared event names.** `page_view` { route, client } in every adapter, defined in
  `lib/telemetry/events.ts`; vendor automatic page events stay off. Plausible and Umami use their built-in page-view
  call as the transport, carrying the same properties. A guard test covers it.
- **D5 (Sonnet): §16 outside services, email and chat.**
  - Email through SMTP, Amazon SES, Resend and Postmark, for the platform and each organisation.
  - Write-only secrets, test actions, the outbox with idempotency, signed webhooks feeding one suppression list,
    and an honest "unavailable" state.
  - A signed webhook as a chat destination.
  - Push (FCM, APNs) and AI (Anthropic) are not applicable: this product has no native apps and no AI feature.
- **D1a (Sonnet): the §15 core.**
  - Every method except password is off by default, with a backfill for providers already configured in the
    database, and "off means gone".
  - Generic OIDC and SAML 2.0, operator-level, linking only from a signed-in session.
  - An extensible `lib/authMethods/`.
  - The forgot-password link hidden when there is no email service.
  - Per-account growing delay, sign-in audit, and the P22 button order.
- **After D1a:**
  - D1b: linked methods (link and unlink) and a server-side session table with a signed-in devices list.
  - D2: passkeys (WebAuthn).
  - D4: SMS phone codes through Twilio or MSG91 (§16 SMS providers).
  - An Opus pass over the sign-in and account-security screens.

## Phase C: integration (Claude, in this session)

- **Wiring:** the footer privacy link (B4a) goes into the footer (B2). The motion components (B1) go into B2 and B3.
- **Release:** `VERSION` 0.9.0, `CHANGELOG.md`, `docs/release-0.9.0.md`.
- **Docs:** `docs/DESIGN.md`; `CLAUDE.md` and `AGENTS.md` kept identical (type, theme, radius, motion, telemetry,
  docs and landing flag); `docs/CONFIGURATION.md`, `.env*.example` and the compose `x-app-env` blocks for the new
  variables.
- **Gates:** lint, typecheck, unit tests (including `file-length`), integration tests, `npm run build`,
  `build:jobs`, e2e public, and a browser check in light, dark and System at phone and desktop widths with reduced
  motion.

## Risks

- **Outfit metrics:** Outfit has different metrics from Gilroy Light, so layouts may reflow. This needs a visual pass
  over every shell.
- **Narrowing `connect-src`:** it can break uploads, payments or the split backend. Verify with the e2e tests and
  manual payment-page checks.
- **Next.js App Router history:** it wraps `history`, so the reload-on-boundary guard needs Playwright proof.
- **Firebase bundle size:** the SDK is large. Dynamic imports keep it off every page until it is consented.
- **Card parity:** cards are not changed, and the card PDF/PNG parity test must stay green.
- **File length:** every new file stays at 300 lines or fewer.

## Out of scope

- Per-organisation analytics (D2 follow-up).
- Metabase and Grafana read-only views: these are server dashboards from §8.1, a separate piece of work.
- Lingui and translations: the app is en-GB only, stated in the docs.
- Native apps.
