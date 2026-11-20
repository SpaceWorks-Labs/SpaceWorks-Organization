# Space Works Organization 0.9.0

Released 2026-11-19. The full list of changes is in [CHANGELOG.md](../CHANGELOG.md#090-2026-11-19); this page
covers what an operator needs to know.

## Upgrading

- **Database:** migration `0022_telemetry_delight_visits` adds `InstanceSetting.webTelemetry`,
  `Organisation.webTelemetry`, `Organisation.delightEnabled` (default on) and the `WebVisitDaily` table. The update
  applies it.
  The same migration adds the sign-in switches for OpenID Connect, SAML, passkeys and phone codes and the
  `OidcProvider`, `SamlProvider` and `SamlLoginState` tables.
- **Sign-in methods are now off until you switch them on** (product rules §15). Only email and password is on by
  default. On upgrade, Google, GitHub and Apple stay on when their client id is already saved in Super admin →
  Settings (the migration switches them on). **Providers configured only through the environment** (`AUTH_GOOGLE_ID`,
  `AUTH_GITHUB_ID`, `AUTH_APPLE_ID`, the Supabase and Firebase bridge variables) are **off after the upgrade**:
  switch them on in Super admin → Auth, with `bash scripts/admin.sh login-methods --set password,google,...`, or
  with `LOGIN_METHODS`. Until you do, their buttons are hidden and their routes answer `method_disabled`.
- **Rolling back to 0.8.1:** this works. The new columns and the table are ignored by 0.8.1.
- **New environment variables:** all are optional, and runtime only (set them on the backend and the website).
  - `LANDING_ENABLED` (default `true`): `false` makes `/` open the one public organisation, the organisations
    list, or sign-in.
  - `WEB_TELEMETRY_ALLOWED_ORIGINS`: HTTPS origins outside analytics may use. Nothing outside is allowed while it
    is empty.
  - `WEB_TELEMETRY_MIXPANEL_TOKEN`, `WEB_TELEMETRY_MIXPANEL_API_HOST` and `WEB_TELEMETRY_MIXPANEL_SDK_HOST`:
    Mixpanel, set only by the operator.

## Behaviour changes to check

- **Content Security Policy:** `connect-src` no longer allows every HTTPS host. It allows the site itself, the
  backend origin, Razorpay on account and pay pages, and configured analytics origins on public pages. A custom
  integration that called another host from the browser needs that origin added.
- **Staff invites:** they now let a signed-out visitor create an account even while new sign-ups are switched off.
  Revoke an invite link to stop it.
- **Sign-in:** OpenID Connect providers (any number) and SAML 2.0 providers are set up in Super admin → Auth. An
  identity from them never links to an existing account by email. Without an email service, "Forgot password?" is
  hidden, password reset by email is refused with a clear message, and new browsers are not asked for an emailed code.
  Repeated failed sign-ins for one email address now slow down (15 seconds, doubling to 15 minutes), the same for
  addresses that have no account. SAML needs the identity provider to post to `/api/auth/saml/<name>/acs`.
- **Typeface and themes:** the interface now uses Outfit, and there is a System theme choice. Saved Light and Dark
  choices are kept.

## Known gaps

- **Translations:** the interface is British English only (product rules §11 asks for translatable strings; this is
  planned as its own release).
- **Receipt PDFs:** these still use Gilroy. Card designs keep their own fonts.
- **Outside analytics adapters:** these are tested with mocks; check each provider you turn on against its own
  dashboard.
