# Security

How Space Works Organization protects an installation, and what an operator must do. Report a vulnerability
privately through GitHub's **Security → Report a vulnerability** on
[SpaceWorks-Labs/SpaceWorks-Organization](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization), not in a
public issue.

## Data in transit

- **Bundled stack:** PostgreSQL (`hostnossl … reject`), Redis (`port 0`, TLS only) and Silo accept TLS only,
  with certificates from a private CA created on the server (`deploy/certificates.sh`). Clients verify the
  hostname (`sslaccept=strict`, `rediss://`, `NODE_EXTRA_CA_CERTS`). The data network is internal: the data
  services have no route to the internet and publish no ports.
- **Public edge:** Caddy with automatic HTTPS (Let's Encrypt), HSTS from the app, and `/api/internal/*`
  blocked. Plain HTTP exists only for a LAN or trial and needs `ALLOW_PLAIN_HTTP=1`; the app refuses an
  `http://` origin otherwise.
- **Cloud:** production refuses database URLs without `sslmode=require|verify-ca|verify-full`, Redis without
  `rediss://`, and a non-HTTPS `S3_ENDPOINT`.

## Least privilege

- The app connects as `sworg_app`, which can read and write rows but owns no table and cannot create
  databases, roles or schema objects. Migrations run separately as the owner role `sworg`. The operator check
  (`--role ops`) verifies this on every install and update.
- The app's storage identity `sworg-app` can list, read, write and delete only in the private bucket; the
  bucket has no anonymous access.
- The backend and frontend images run as an unprivileged user; operator scripts and the Prisma CLI are
  root-owned and read-only inside the image.

## Secrets

- The installer generates every secret on the server and writes them to the install's `.env` (mode 600).
  Nothing secret is printed, passed on a command line, or baked into an image.
- Release images are built with a throwaway Server Actions key and placeholder origins; web roles refuse to
  start without the installation's own key.
- Authenticator seeds (`MFA_ENCRYPTION_KEY`), payment gateway secrets (`PAYMENT_SECRETS_KEY`) and provider
  secrets saved in Super admin → Settings are encrypted at rest. Losing those keys makes the saved values
  unreadable: keep an encrypted, off-server copy of `.env` and `tls/` (`bash scripts/backup.sh` archives them).
- Backups contain personal data and every secret. Copy them off the server encrypted, and restrict who can
  read `backups/`.
- Internal job (`CRON_SECRET`: `/api/internal/jobs`, `/api/internal/outbox`) and readiness (`HEALTHCHECK_SECRET`) endpoints answer 404 without their bearer
  secret.

### Email providers and webhooks

- Email provider secrets (SES secret access key, Resend API key, Postmark server token, webhook secrets) and chat
  destinations, including a signed webhook's address and secret, are encrypted at rest and write-only: no reply,
  log line, audit row or URL carries one, and a saved value is only ever shown as "saved". Settings changes are
  audited by field name.
- Bounce and complaint reports arrive at `/api/email/webhooks/{ses|resend|postmark}` and are verified before the
  body is read: Resend's Svix HMAC-SHA256 signature (five-minute tolerance against replay), Postmark's basic auth
  password compared in constant time with the saved secret, and SES through Amazon SNS signature verification. We
  chose SNS verification over a secret URL token, and it needs two safeguards beyond the signature: the signing
  certificate may only come from an `sns.<region>.amazonaws.com` HTTPS address (no redirects), and the message must
  come from the one SNS topic pinned in settings, because any AWS account can produce a validly signed message
  from its own topic. Without a pinned topic SES reports are refused. Unverified requests get 401 and change nothing.
- Provider hosts are fixed (Resend, Postmark, the regional SES endpoint built from a validated region) and used only
  over HTTPS without redirects. Hosts an organisation types in (SMTP, a signed webhook, Mattermost) must resolve to
  public addresses, checked when saving and when connecting.

## Releases and automatic deploys

- The installer and updater accept only published, non-prerelease `main` releases whose tag matches
  `v<VERSION>-main.<run>.<sha>`, and pin the images to that exact version.
- This repository is public, and GitHub recommends self-hosted runners only for private repositories. The
  deploy runner controls Docker, which is root on the server. Before setting `SWO_DEPLOY=true`:
  - require approval for **all external contributors'** workflow runs;
  - protect `main` so only maintainers can merge;
  - in an organisation, limit the runner group to this repository (and to `release.yml` on
    `refs/heads/main` where your plan allows);
  - never add the `spaceworks-organization-prod` label to a `pull_request` workflow.
  The deploy job uses no checkout and no third-party actions. Keep runner auto-updates on.
- `scripts/install-runner.sh` verifies the runner download against GitHub's published SHA-256 and never echoes
  or stores the registration token.

## Application

- Tenant isolation in every query; cross-tenant access returns 404.
- Rate limits on sign-in and sensitive actions (Redis), with the client address taken only from the header
  your edge overwrites (`TRUSTED_PROXY_IP_HEADER`).
- Money rows are never edited or deleted; reversals use credit notes, and receipt numbers are gapless.

### Card scans (`/verify`)

- **Public check.** Anyone who scans a card's QR sees its verdict (current, renewal due, not started, not current,
  revoked) with the member's name, plan, card number and valid-until date, never contact details. While the card is
  live (not revoked or replaced), the membership is current or in grace, the member is not erased and the
  organisation is active, the page also shows the card itself, front and back. It is drawn on demand by
  `/api/verify/<token>/card` (`lib/cards/publicCard.ts`), never stored, sent `private, no-store`, limited per address
  (`verifyCardImage`), and any other token gets the same 404.
- **Staff scans.** Signed-in staff of the card's organisation who read members, with an authenticator and the
  member inside their unit scope, also see that organisation's record of the member: memberships, payments and
  cards, with contact details only for roles holding `members.contact`. The buttons call the dashboard's own server
  actions, which check the organisation, unit and permission again. Each scan writes `CARD_SCANNED` (throttled);
  a super admin's also writes `SUPER_ADMIN_ORG_ENTERED`. Staff of another organisation, or limited to another unit,
  see exactly the public check, so a scan never shows that someone is a member elsewhere. Staff without an
  authenticator are asked to set one up instead.

### Sign-in

- **Staff need an authenticator.** Anyone on an organisation's team (whatever their role) must
  turn on an authenticator app before the dashboard, its actions or its exports open (`hasAuthenticator` in
  `lib/permissions.ts`). Members never need one.
- **Super admins** sign in with email and password only. Their accounts and passwords are created and changed
  only on the server (`scripts/admin.sh`); password-reset emails, in-app password changes and Google, GitHub or
  Apple sign-in are refused for them.
- **Phone codes.** Off by default, and only with an SMS provider set up (`docs/NOTIFICATIONS.md`, "Text messages"). Only a number a signed-in person verified can sign in, and one number belongs to one account; the method never creates an account, refuses super admins, and an account with an authenticator also needs its code. Codes are six digits, valid ten minutes, single use, at most five tries, and kept only as an HMAC with `AUTH_SECRET` (as is the number, in the send log). Asking for a code is limited per number (3 in 15 minutes, 10 a day), per country calling code (`SMS_DAILY_COUNTRY_CAP`, default 500 a day, across the install) and per address; a number with no account is counted and answered exactly like one with an account, so the answer (200, or 429 with `Retry-After`) never shows whether an account exists. Wrong codes feed the same per-number delay and address block as passwords. Adding or removing a number needs a recent sign-in, writes `PHONE_ADDED` or `PHONE_REMOVED` without the number, and removal is refused when it is the last working way to sign in. It needs no email service.
- **Platform access.** By the owner's decision (2026-10-29), super admins have full owner-level access to every
  organisation's dashboard, with no session or time limit (`platformAccess` in `lib/permissions.ts`). Safeguards:
  - they need an authenticator before an organisation's dashboard opens, like all staff;
  - every action writes `SUPER_ADMIN_ORG_ACTION` and entering an organisation writes `SUPER_ADMIN_ORG_ENTERED`
    (throttled), and the organisation's activity report lists them as "Platform super admin";
  - a banner shows on every page they open there;
  - they are never on the team: not listed, not counted against limits, not emailed. Money stays under the payment
    triggers (paid rows are never edited or deleted).
  A compromised super-admin account reaches every organisation, so keep super admins few and their authenticators
  on.
- **Sign-in methods.** One platform switch per method (password, Google, Apple, GitHub, OpenID Connect, SAML,
  Supabase, Firebase, passkeys, phone codes) sits in front of that method's
  configuration. **Password is on by default and every other method is off until the operator switches it on**
  (product rules §15). A method works only when its switch is on and it is configured; switching one off never
  deletes its credentials. OpenID Connect and SAML count as configured when at least one provider is enabled; each
  provider's `enabled` flag is its own switch. `LOGIN_METHODS` in the environment overrides the switches
  (`lib/loginMethods.ts`). With password sign-in off, the sign-in page hides the password form and sign-up, and the
  server refuses a password sign-in from anyone but a super admin, who reaches the form at `/login?admin=1`.
  Changes are audited as `LOGIN_METHODS_UPDATED` (field names only).
- **Off means gone.** A method that is off is hidden on every screen and refuses with a typed error: the
  credentials-type methods (password, SAML, Supabase, Firebase, passkeys) throw `method_disabled` from `authorize`; the
  Google, Apple, GitHub and OpenID Connect start and callback URLs answer with `/login?error=method_disabled`
  (`lib/authMethods/gate.ts`). The provider modules live in `lib/authMethods/`, one per method family.
- **Passkeys** (WebAuthn; library choice in `docs/decisions.md`). Off by default; the switch is Auth in Super admin. A passkey is
  registered only from a signed-in session with a recent sign-in (account Security page), with user verification
  required and a discoverable credential preferred; the response is checked against our own challenge, the site's exact
  origin and its hostname as the relying party id (taken from `NEXT_PUBLIC_BASE_URL`, never the request). Only the public
  key is stored. Challenges (`PasskeyChallenge`) are random, last five minutes and are used exactly once; a sign-in
  challenge is named by an opaque httpOnly cookie. Sign-in asks for no email: the credential id finds the account. The
  signature counter must go up when either side counts; a counter that stands still or goes back is refused and audited
  as `PASSKEY_COUNTER_ROLLBACK` (a cloned authenticator). **A passkey never replaces the authenticator for staff**:
  anyone on a team who has an authenticator still gives its code (or a recovery code) after the passkey; for members a
  verified passkey counts as two steps. **Super admins have no passkeys** (password only, and a planted one is refused).
  A passkey is a working way to sign in only while the method is on, and the last working way cannot be removed
  (`countWorkingMethods`). Failures count towards the address block and the per-account delay. Adding and removing
  are audited as `PASSKEY_ADDED` and `PASSKEY_REMOVED`. WebAuthn runs in the browser against the device, so it needs no
  `connect-src` entry or other CSP change. Passkeys are tied to the domain: changing it makes them unusable, and
  people fall back to their other methods.
- **OpenID Connect.** Operators add any number of providers (Super admin, Auth): issuer (https), client id, a
  write-only client secret (encrypted like other instance secrets, never selected into a page, a log or an audit
  row), scopes. Auth.js does issuer discovery with PKCE, state and nonce, entirely through server-side redirects, so
  no `connect-src` entry is needed. The `email_verified` claim must be true. **An OpenID Connect identity never links to
  an existing account by email** (only Google, Apple and GitHub do): an email that already has an account and no link
  for that provider and subject is refused with `link_from_account`; otherwise the same rules as every outside
  identity apply (super admins refused, account creation gated by the sign-up switch or an invite). "Test
  connection" fetches the discovery document over TLS and checks that its issuer matches. Changes are audited as
  `OIDC_PROVIDER_CREATED`, `OIDC_PROVIDER_UPDATED` (field names) and `OIDC_PROVIDER_REMOVED`.
- **SAML 2.0** (library choice in `docs/decisions.md`). Sign-in starts at `/api/auth/saml/<name>/login` (an
  AuthnRequest by redirect; the RelayState is the same-site return path, signed and valid 10 minutes). The identity
  provider posts its response to `/api/auth/saml/<name>/acs`, where the library checks the signature (the assertion
  must be signed by default), issuer, audience, `NotBefore`/`NotOnOrAfter` and `InResponseTo` against a request id
  stored in the database (single use, 10 minutes, bound to the provider; identity-provider-initiated responses are
  refused), and we check the `Recipient`. The email is the NameID (email format) or a mail attribute. A valid response
  becomes a one-time ticket (random 32 bytes, stored hashed, two minutes, single use) in the URL fragment of
  `/login/saml`, which posts it to the Auth.js `saml` provider. The same linking rule as OpenID Connect applies: no
  email linking, `link_from_account`. Metadata is served at `/api/auth/saml/<name>/metadata` (public setup
  information, also while a provider is not yet enabled). The website's proxy lets only this one cross-site POST
  through (`lib/frontend/httpProxy.ts`). Super admins are refused, as with every outside identity.
- **Sign-in is bound to the browser that started it** (SAML and Supabase). The SAML login route sets `swo.saml-flow`
  (random, httpOnly, Secure in production, SameSite Lax, 10 minutes, path `/api/auth`) and stores its SHA-256 on the
  AuthnRequest row; the ACS copies that hash onto the ticket; `authorizeSaml` refuses (`saml_flow`, audited) when the
  cookie is missing and `consumeSamlTicket` takes the ticket only when the cookie's hash matches (a wrong cookie does
  not use the ticket up). A ticket or response planted in another browser therefore signs nobody in (login CSRF) and
  cannot link an identity through a live link intent. The Supabase bridge uses PKCE (`flowType: "pkce"`): the verifier
  lives in the starting browser's storage, a returning `?code=` is exchanged only where that verifier exists, and an
  implicit `#access_token=` is never finished (`components/auth/supabaseReturn.ts`). Server-side token checks are unchanged.
- **Identity-provider links belong to the provider row, not its name.** `Account.provider` is `oidc-<id>` or `saml-<id>`
  (the row's immutable id; the Auth.js OIDC provider id and callback use it too). Deleting a provider deletes its account
  links in the same transaction and audits the count (`linksRemoved`). Changing an OIDC issuer, or a SAML entity id or
  sign-on address, is refused while any account is linked ("Remove the linked accounts first, or add a new provider"), so a
  replaced identity provider's users can never reach the accounts of the old one. A newly added provider has a new id.
- **Saved secrets are reused only for the target they were saved with.** The organisation SMTP password is reused only
  when host, port and user all equal the saved values (otherwise it must be typed again, and a changed target without a
  user clears it); ports are limited to 25, 465, 587 and 2525 for test and save, and a test is audited as
  `ORG_EMAIL_TEST_SENT` (provider only). The platform SMTP password follows the same rule (service, host, port, user).
  A saved SES secret is not reused with another region or access key id, nor a Twilio auth token with another account
  SID or an API key secret with another key SID (`secretToRetype`, `smsSecretsToRetype`). Resend, Postmark, MSG91 and
  Twilio have fixed hosts, so their other secrets carry over.
- **Provider webhooks behind the split-hosting proxy.** `POST /api/email/webhooks/<provider>` and
  `/api/sms/webhooks/<provider>` are exempt from the Origin check (like the SAML ACS), and for those paths only the
  proxy forwards `svix-id`, `svix-timestamp`, `svix-signature`, `x-twilio-signature` and `x-amz-sns-*` (`authorization`
  is already forwarded for Postmark). The backend verifies every one. The Twilio signature is computed over
  `NEXT_PUBLIC_BASE_URL` + path + query, the address Twilio called.
- **Messaging webhooks.** `/api/messaging/webhooks/<telegram|slack|discord|mattermost|whatsapp-meta|twilio>?scope=<platform or organisation id>` is exempt from the Origin check and forwards only `x-hub-signature-256`, `x-telegram-bot-api-secret-token`, `x-slack-signature`, `x-slack-request-timestamp`, `x-signature-ed25519`, `x-signature-timestamp` and `x-twilio-signature`. Each handler verifies before it reads the body: Meta HMAC-SHA256 of the raw body with the app secret, Telegram the secret token set with `setWebhook`, Slack `v0:<timestamp>:<body>` with the signing secret (five-minute window), Discord Ed25519 over timestamp and body with the application public key, Mattermost the slash command token, Twilio as above. Comparisons are constant-time; bodies are capped at 256 KB; answers never repeat a code, a number or an address. Linking codes are 14 characters, keyed-hashed, 15 minutes, once and five tries per code; endpoint addresses are encrypted with a keyed digest for uniqueness. The stop link (`/api/messaging/stop/<token>`) is a signed token that can only end consent, and changes nothing on GET. Member message logs hold no text, number or address.
- **Pre-registered accounts.** Google, Apple and GitHub link by verified email, but not into an existing account that has
  no password and whose identities are all single sign-on (SAML, OpenID Connect) or bridge accounts: `link_from_account`.
  The inbox's owner signs in the original way and links the provider from the security page.
- **Throttling.** Beyond the per-address block below, each email address has a growing delay (`lib/signInBackoff.ts`):
  after 5 failed sign-ins or codes, further attempts are refused for 15 seconds, doubling to 15 minutes, cleared by a
  correct sign-in. It is keyed by the lowercased email whether or not an account exists, so the answer never shows
  whether one does (without Redis, the in-memory fallback sweeps expired entries and is capped at 10,000, oldest first). Auth.js refuses with `throttled`; the SAML routes answer 429 with `Retry-After`. Password reset
  requests keep their own limit (5 an hour per address and per client).
- **Without email.** When no email service is set up (`lib/emailAvailability.ts`: Super admin settings or the
  server's SMTP or provider variables), the sign-in page hides "Forgot password?", requesting a reset is refused with
  a message saying so, and **the emailed code for a new browser is skipped** so nobody is locked out. A password is
  then reset by an administrator. Two-step sign-in with an authenticator is unaffected.
- **Audit.** `SIGN_IN_SUCCEEDED` (method), `SIGN_IN_FAILED` (method and a reason code only, one row per method and
  reason a minute, never an email or credential), `SIGN_OUT`, `MFA_ENABLED`, `MFA_DISABLED`, `RECOVERY_CODE_USED`,
  `IDENTITY_LINKED`, `IDENTITY_UNLINKED`, `SESSION_REVOKED` (method only), `SESSIONS_REVOKED` (signed out everywhere),
  `RECOVERY_CODES_REGENERATED` and every change to the method settings.
- **Sessions and signed-in devices** (product rules §15). Each sign-in writes a `UserSession` row (`lib/userSessions.ts`)
  and the JWT carries its id (`sid`). The `jwt` callback checks that row on every request, in the same indexed lookup
  that reads the user's `sessionVersion`: a missing row, another user's, a revoked one or one made under an older version
  signs the person out. `lastSeenAt` is written at most once every five minutes; rows unused for 60 days are dropped as
  people sign in. A row stores a short device label ("Firefox on Linux", never the user agent string), the method, the
  known device and an address prefix only (the first two octets of an IPv4 address, the first /48 of an IPv6 one),
  never the address. Account, security → Signed-in devices lists them (this device marked) and signs one out
  (`revokeSession`: only the caller's own row; anything else gets the same "not found"). Sign out everywhere revokes every
  row and bumps `sessionVersion` in one transaction, so password resets, authenticator changes and the old mechanism
  still work. Because the check runs inside Auth.js, it runs on the backend in split hosting, where `auth()` runs.
- **Linking sign-in methods** (product rules §15). A signed-in person adds Google, GitHub, an OpenID Connect or SAML
  provider, or a Supabase or Firebase account from Account, security → Sign-in methods, and removes any of them again.
  Adding needs a recent sign-in and starts with a server action that sets `swo.link-intent`: an httpOnly cookie, ten
  minutes, signed with a key derived from `AUTH_SECRET`, naming only the user and the provider (`lib/linkIntent.ts`).
  - **OAuth and OpenID Connect.** Auth.js already attaches a new identity to the account its own session cookie decodes
    to, but without asking whether that session still counts. The sign-in callback therefore runs
    `oauthSessionGate` (`lib/authMethods/sessionGate.ts`) first: it reads the cookie and the session row itself. A live
    session links only with a valid intent for that user and provider, and an identity linked to another account is
    refused (`identity_linked_elsewhere`). A signed-in browser with no intent is turned back to the security page. A
    revoked session never links anything: the dead cookie is cleared and the person asks again. Linking keeps the
    browser's session and writes `IDENTITY_LINKED`, not a new sign-in or a new-device alert.
  - **SAML and the bridges.** Their `authorize` finds the same intent and a live session of that user and links the
    verified identity to that user (`linkExternalIdentity`), never by email.
  - **Never for super admins** (password only), never moving an identity from one account to another, and Apple is not
    offered: its cross-site form post drops the same-site session cookie linking relies on.
  - **Unlinking** (`unlinkSignInMethod`) needs a recent sign-in, locks the user row, and is refused when it would leave no
    working way to sign in: `countWorkingMethods` (`lib/authMethods/workingMethods.ts`) counts the password, linked
    identities whose method is on, passkeys and the verified phone, each only while its method is switched on.
- **Recovery codes.** The authenticator's one-time recovery codes are stored only as hashes and used once. They can be
  replaced under Security (`regenerateRecoveryCodes`): it needs a recent sign-in and the authenticator's current code (never
  a recovery code), replaces the whole set, shows the new codes once and writes `RECOVERY_CODES_REGENERATED`.
- **Supabase and Firebase bridges.** The browser signs in with the provider and posts its token to an Auth.js
  Credentials provider (`supabase` or `firebase`); the server verifies it with `jose` (`lib/bridgeTokens.ts`) before
  anything else. Firebase: RS256 against Google's securetoken keys, issuer `https://securetoken.google.com/<project>`,
  audience the project id, sane `exp`, `iat` and `auth_time`, an email, and `email_verified` true. Supabase: the
  project's JWKS (asymmetric keys only; HS256 projects are refused), issuer `<url>/auth/v1`, audience
  `authenticated`, then `<url>/auth/v1/user` must report the same user with a confirmed email. Phone-only identities
  are refused. The verified, lowercased email then follows the same rules as Google, Apple and GitHub
  (`lib/signInRules.ts`): super admins refused, an unverified password account protected, account creation gated by
  the sign-up switch or an invite. Rate limits and automatic address blocking apply. The configuration is public
  values from the environment, never secrets.
  - **A bridge never links to an existing account by email.** It creates an account (with the provider's `sub`
    stored as its Account, in one transaction) and later signs in only the account linked to that `sub`. An email
    that already has an account here is refused (`bridge_link_refused`). Reason: a Supabase or Firebase project can
    confirm addresses it never checked (for example Supabase with "Confirm email" off, where anyone holding the public
    key can sign up as any address), which would otherwise hand over the existing account, authenticator and all.
  - **Keep "Confirm email" on** in a Supabase project used here, and email verification on in Firebase, so new
    accounts created through a bridge really belong to their address.
  - A token naming an unknown signing key refetches the provider's key set at most once a minute.
- **Apple's cross-site callback.** Apple answers with a form POST from another site, so while Apple sign-in is on
  (HTTPS production) the Auth.js state, nonce, PKCE and callback cookies are `SameSite=None; Secure`. Apple sends the
  name on the first sign-in only; its private-relay addresses count as verified.
- **Unusual sign-ins.** Each browser that signs in is remembered by a long-lived random cookie, stored only as a
  hash (`KnownDevice`). An account without an authenticator signing in from a new browser must enter a six-digit
  code emailed to it (valid 10 minutes, single use), unless it verified its email in the last hour or no email
  service is set up.
- **New-device alerts.** Every first sign-in from a new device emails the account its browser, address and time.
- **Automatic address blocking.** Twenty failed sign-ins (wrong password or code) from one address within
  15 minutes block it from signing in, signing up and requesting password resets for an hour; again within a
  week, for a day. Super admin, Security lists blocks and lifts them (`lib/ipBlock.ts`).
- **Breached passwords.** New passwords (sign-up, change, reset, the server command) found in known breaches are
  refused, via Have I Been Pwned with k-anonymity: only the first five characters of the SHA-1 hash leave the
  server. `PWNED_PASSWORDS_CHECK=0` turns it off for offline installs.
- **Staff invite links.** Invites (`/join/org/<token>`) are single use, can expire, and are revoked by the
  organisation. A signed-out visitor can create an account on the invite page (password, or Google, Apple or
  GitHub when enabled).
  - **While "new accounts" is switched off,** opening a valid invite sets `swo.invite-signup`: an httpOnly cookie
    lasting 30 minutes, signed with a key derived from `AUTH_SECRET`, naming only the invite token. It is
    `SameSite=None; Secure` over HTTPS in production (Apple returns with a cross-site form POST) and `Lax` otherwise.
  - **The cookie lifts only the sign-up switch,** and only after the database confirms the invite is still unused,
    unexpired and, for an invite bound to an email, that the new account has that email.
  - **One account per invite.** Creating the account claims the invite for that email in one atomic update
    (`TeamInvite.signupEmail`), so however many people hold the link, it creates at most one account; the same
    person retrying is answered as before. The cookie grants no role and never makes a super admin; accepting still goes through `acceptOrganisationInviteToken`, audited as before.
  - **Verification returns only to an invite page.** The email verification link may carry a return path, accepted
    only if it is a same-site `/join/org/<token>` path.
- **Organisation-entered hosts** (an organisation's SMTP relay, a self-hosted Mattermost) must resolve to public
  addresses, checked when saved and again when used, so they can't reach the server's own network.

## Content Security Policy and outside web analytics

The policy is built per request in `lib/pageSecurity.ts` from the environment only (the proxies never read the database).

- **`connect-src`** is `'self'`, the backend origin (`NEXT_PUBLIC_BACKEND_ORIGIN`, when the browser talks to it), the
  Razorpay hosts on `/account` and `/pay/` only, and, on the approved public pages only, the operator's
  `WEB_TELEMETRY_ALLOWED_ORIGINS` and the Mixpanel hosts while `WEB_TELEMETRY_MIXPANEL_TOKEN` is set. It never widens on
  signed-in, token, pay, verify or sign-in pages, and not at all when nothing is configured. Stripe is a redirect
  to Stripe's own checkout and needs no entry.
- **Identity bridges** add hosts only on `/login`, `/login/bridge/*`, `/join/org/*` and `/verify-email`, only while
  configured and not left out by `LOGIN_METHODS`: the Supabase project origin in `connect-src`; for Firebase,
  `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` and `www.googleapis.com` in `connect-src`, and the auth
  domain and `apis.google.com` in `frame-src`. Card scans (`/verify/<token>`) and everything else stay strict.
- **`frame-src`** allows Razorpay Checkout on `/account` and `/pay/`, the Firebase auth domain on the sign-in pages when Firebase is configured, and is `'none'` elsewhere.
- **`'strict-dynamic'` makes `script-src` host lists inert** in current browsers: a script a nonced script creates is
  trusted whatever its host. The real limits on outside providers are therefore the consent gate (nothing loads before
  the visitor agrees, enforced by `lib/telemetry/controller.ts`) and `connect-src`. The host list is kept for browsers
  that ignore `'strict-dynamic'`.
- **Known gap:** `img-src` and `font-src` allow `https:` because organisation logos, member photos and fonts may be
  served from any https host. A script that is already running could send data to an https host as an image or font
  request. Closing it needs those assets proxied or allow-listed, which is not done.
- **What an operator must list.** A vendor works only when its hosts are in `WEB_TELEMETRY_ALLOWED_ORIGINS`, for
  example Google Analytics: `https://www.googletagmanager.com` and the regional `https://*.google-analytics.com`
  hosts you see in the browser's network panel (wildcards are not accepted, list exact origins); Clarity:
  `https://www.clarity.ms` and the collector hosts it reports; Sentry: the DSN's ingest origin; Firebase: the hosts
  it reports; PostHog, Plausible and Umami: the collector origin. A blocked request is a missing origin, not a bug.
- **Anonymous only.** The telemetry configuration is returned only to a request with no session, only the approved
  public templates are reported (`lib/telemetry/routes.ts`), and a document that ever ran a provider is replaced
  by a full page load before it can reach any other page. Sign-in and sign-out end with a full page load.
- **Per-organisation providers.** An organisation can set its own providers (`Organisation.webTelemetry`, edited at
  `/dashboard/<org>/settings/analytics` by the Owner, or by a super admin acting as the Owner, audited as
  `ORG_WEB_TELEMETRY_UPDATED` with field names only). It uses the platform schema (public ids, origins from the
  operator allow-list) and never Mixpanel. It runs only on that organisation's `/o/<slug>` pages and join form, for
  signed-out visitors, with consent scoped `org:<id>`; the platform configuration does not run on those pages, so a
  page never runs two page-analytics providers. An organisation that is not active has none.
- **Visit counts (`POST /api/visits`).** Always on, and personal data is never stored: a request carries only an
  approved route template (and an organisation slug under `/o/`), and the server adds one to a per-day counter
  (`WebVisitDaily`). No cookie or storage key is written, and the address is never stored; it is hashed for the
  per-address rate limit only (Redis, `apiRead`). Tokens and private routes have no template and are dropped, as are
  unknown or inactive organisations and obvious bots by user agent. The answer is always 204, so a caller learns
  nothing about why a visit was or was not counted.

## Audit hardening (2026-11)

- **Password reset.** Requesting a reset keeps its own limit (`passwordReset`: 5 an hour per address and per client).
  Confirming a link has a separate bucket (`passwordResetConfirm`: 10 an hour) keyed by the hash of the link and the
  client address, so someone else asking for an address's resets cannot block its valid confirmation, and guessing
  links is still throttled. A reset link issued less than 60 seconds ago is kept and no new mail is queued, with the
  same generic answer, so a flood of requests cannot keep replacing a link the person is about to use.
- **Sign-up ordering.** `signUpWithPassword` takes the per-address `signup` limit (and the address block) first,
  before the breached-password check, hashing or the lookup. An address that already has an account and a new one
  consume the same quota and get the same answer.
- **Member payments and receipts follow the member-accounts switch.** `/account/payments` and the member's own copy
  of a receipt (`/api/documents/<id>`) require `Organisation.memberPortal` and a portal organisation status, like the
  rest of the portal. Staff access to documents is unchanged.
- **Frontend backstop.** `assertSafeView` (`lib/frontend/handler.ts`) refuses, at any depth, listed secret fields and
  any key ending in `Encrypted`, `Hash`, `Hashes`, `Secret` or `PrivateKey`, or named like an access, refresh, id or
  verify token, unless the value is a boolean (`hasSecret`). A plain `token` is allowed: invite, join and pay links
  are shown to the people they belong to.
- **Audit of platform access.** `deleteOrganisation` and `resubmitOrganisationApplication` write
  `SUPER_ADMIN_ORG_ACTION` when a super admin acts through platform access, like every other organisation action.
- **Structure lock.** `updateUnit` and `setUnitPaymentInstructions` take `lockOrganisationStructure` first, like the
  other unit actions.
- **Provider test fetches.** "Test connection" for OIDC and the SAML metadata test refuse hosts that resolve to
  private, loopback or link-local addresses (`assertPublicHost`; development allows local hosts), never follow
  redirects and time out after 8 seconds. An identity provider on an internal address cannot be tested from the
  settings page; there is no allow-list.
- **Member photos.** `/api/uploads` serves keys under `organisations/<org>/members/` (and the older
  `member-id-photos/`) with `Cache-Control: private, no-store`, so no CDN or shared cache keeps a copy past an
  erasure. They still need only the unguessable key. Page images and logos stay public and immutable.
- **Small fixes.** The collection sheet logs a failed row's message and code only. `POST /api/visits` refuses a body
  over 1 KB by `Content-Length` and while streaming it. Public organisation pages are `noindex` unless the
  organisation is both listed and active.

### Known gaps

- **Resolve once, connect later.** Outbound requests to hosts an organisation or operator types in (chat webhooks,
  SMTP relays, the provider test fetches) check the host with `assertPublicHost`, which resolves the name once, and
  the connection then resolves it again. A DNS server controlled by an attacker can answer with a public address
  for the check and a private one for the connection (DNS rebinding). Planned fix: resolve once, refuse private
  results, and connect to that pinned IP address with the original host name kept for TLS and the `Host` header
  (a custom `lookup` on the HTTP agent and the SMTP and chat transports), so there is no second resolution.
