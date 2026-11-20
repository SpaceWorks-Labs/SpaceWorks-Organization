# Webhooks and internal endpoints

Every route under `/api`: what it is for, who may call it and how each request is checked, from provider signatures to cron secrets and staff permissions.

## Before you start

There is no public REST API yet. The routes on this page exist for payment gateways, email, SMS and chat providers, the job scheduler, health checks, the split-hosting website and the app's own pages. None of them is a general-purpose interface for scripts, and their shapes may change between releases.

Three rules apply across the board:

- **Nothing is read before it is verified.** Webhook handlers check the provider's signature or token against the raw body before they parse it.
- **Refusals look alike.** A wrong secret, an unknown organisation and another organisation's record all answer `404 Not found` where the route says so, so a caller learns nothing about what exists.
- **Responses are not cached.** Every route sends `Cache-Control: no-store` (or `private, no-store`), except the public image routes noted below.

All `/api` requests pass through `proxy.ts`, which applies the rate limits named on this page (see [Limits](./limits.md)) and adds `X-Frame-Options: DENY`.

## Payment webhooks

| Route | Method | Provider |
|---|---|---|
| `/api/webhooks/razorpay/{code}` | `POST` | Razorpay |
| `/api/webhooks/stripe/{code}` | `POST` | Stripe |

`{code}` is the organisation's unguessable webhook code (16 to 64 of `A–Z a–z 0–9 _ -`), shown in its payment settings. A code that does not match, or belongs to the other gateway, answers `404`.

How a request is verified (`lib/payments/webhooks.ts`, `lib/payments/razorpay.ts`, `lib/payments/stripe.ts`):

| Provider | Header | Check |
|---|---|---|
| Razorpay | `X-Razorpay-Signature` | HMAC-SHA256 of the raw body with the organisation's webhook secret. Razorpay signs no timestamp, so a body whose `created_at` is more than 36 hours old is refused. |
| Stripe | `Stripe-Signature` | HMAC-SHA256 of `<t>.<body>` against any `v1` value, with the `t` timestamp within 300 seconds. |

- Bodies over 256 KB answer `413`. A bad signature answers `401 Invalid signature`; a body that cannot be parsed answers `400`.
- Each event applies once: `ProcessedWebhookEvent (provider, eventId)` records it in the same transaction, and a repeat answers `200 Duplicate`.
- Business outcomes always answer `200`. A capture settles through `settlePayment`; a payment or refund that matches nothing is recorded as the `PAYMENT_WEBHOOK_UNMATCHED` audit action for a manager to look at. Only infrastructure errors answer `5xx`, so the gateway retries.
- Rate limit: the `webhook` bucket (1,200 a minute), never the per-address global limit.

The events each gateway sends that the app acts on are listed in [Payments](../PAYMENTS.md#webhooks).

## Email, SMS and chat webhooks

### Email bounces and complaints

`POST /api/email/webhooks/{provider}`, where `{provider}` is `resend`, `postmark` or `ses` (SMTP has no reports). Add `?org=<organisation id>` when the organisation sends through its own provider; without it the platform's settings are used.

| Provider | How it is verified |
|---|---|
| Resend | Svix signature: `svix-id`, `svix-timestamp` and `svix-signature` with the saved webhook secret, timestamp within 300 seconds |
| Postmark | HTTP basic auth (`Authorization`) with the saved webhook secret |
| Amazon SES | The Amazon SNS message signature, from the pinned topic ARN, no older than an hour. A subscription confirmation is followed only to an Amazon SNS address. |

Bodies over 256 KB answer `413`; failed checks answer `401`. Reports feed the one suppression list that every send skips, audited as `EMAIL_SUPPRESSIONS_ADDED`. Source: `lib/email/webhooks/handle.ts`, `lib/email/webhooks/verify.ts`.

### SMS delivery reports

`POST /api/sms/webhooks/{provider}`, where `{provider}` is `twilio` or `msg91`.

- **Twilio:** `X-Twilio-Signature` with the saved auth token, computed over the public address (`NEXT_PUBLIC_BASE_URL` plus the path), so it still matches behind a proxy.
- **MSG91:** a secret `?token=` in the address, compared with the saved webhook secret.

Bodies over 64 KB answer `413`. Only the delivery state lands on the code's send record; no number or message text is stored. Source: `lib/sms/webhooks/handle.ts`.

### Chat replies and STOP

`POST /api/messaging/webhooks/{provider}?scope=<platform or organisation id>` takes replies from the bots that send member messages. A STOP ends that person's consent at once; a one-time code links the sender to the account that asked for it.

| `{provider}` | How it is verified |
|---|---|
| `telegram` | `X-Telegram-Bot-Api-Secret-Token` equals the secret given to `setWebhook` |
| `slack` | `X-Slack-Signature` over `v0:<timestamp>:<body>` with the signing secret, `X-Slack-Request-Timestamp` within five minutes |
| `discord` | Ed25519 signature in `X-Signature-Ed25519` over `X-Signature-Timestamp` plus the body, checked with the application's public key |
| `mattermost` | The slash command's `token` field in the form body |
| `whatsapp-meta` | `X-Hub-Signature-256` (HMAC-SHA256 of the body with the app secret). `GET` answers Meta's subscription handshake when `hub.verify_token` matches. |
| `twilio` | `X-Twilio-Signature` with the saved auth token |

`scope` defaults to the platform; anything that is neither `platform` nor an organisation id answers `404`. Bodies over 256 KB are refused. Source: `lib/notify/webhooks/*`, `lib/notify/verify.ts`.

### Stop links in messages

`GET /api/messaging/stop/{token}` shows a page with one button; `POST` to the same address stops that channel's messages from that organisation. Opening the link changes nothing, so a link-preview bot cannot unsubscribe anyone. The token is signed with an HMAC derived from `AUTH_SECRET` and names the organisation, the person and the channel. Rate limit: the `webhook` bucket. Source: `lib/notify/consent.ts`.

More on setting these up: [Email providers](../NOTIFICATIONS.md#email-providers), [Chat alerts](../NOTIFICATIONS.md#chat-alerts) and [Member messages on every channel](../NOTIFICATIONS.md#member-messages-on-every-channel).

## Scheduler and outbox

For hosts without a `beat` process, an outside cron can drive the background jobs. With a worker, the first two routes only queue the jobs for it; with no worker at all, `run-jobs` runs them in the request ([Fully cloud with Inngest](../DEPLOYMENT_CLOUD.md#fully-cloud-with-inngest)).

| Route | Method | What it does | Answer |
|---|---|---|---|
| `/api/internal/jobs` | `POST` | Queues one tick of every scheduled job | `204`, or `503` if queueing failed |
| `/api/internal/outbox` | `POST` | Queues outbox rows that are due | `200` with `{ ok: true, ... }`, or `503` |
| `/api/internal/run-jobs` | `POST` | Runs the due scheduled jobs and delivers the outbox in the request, each occurrence once (`lib/queue/inline.ts`) | `200` with `{ ok, ran, failed, outbox }`, `500` if a job failed, or `503` |

All three need `Authorization: Bearer <CRON_SECRET>`, compared in constant time (`lib/bearerSecret.ts`). A missing or wrong secret, or no `CRON_SECRET` set, answers `404`.

`/api/inngest` (`GET`, `POST`, `PUT`) is Inngest's sync, introspection and run endpoint for the fully cloud option (`lib/queue/inngest.ts`). The Inngest SDK verifies every call against `INNGEST_SIGNING_KEY` before anything runs; with no signing key (and no local `INNGEST_DEV`) the route answers `404`.

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://members.example.org/api/internal/jobs
```

## Health

| Route | Method | Who may call it | What it checks |
|---|---|---|---|
| `/api/health` | `GET` | Anyone | Liveness only: `{ ok, uptimeMs, time }`. Never touches the database or Redis, and skips the global rate limit. |
| `/api/health/db` | `GET` | `Authorization: Bearer <HEALTHCHECK_SECRET>` | Runs `SELECT 1` and answers `{ ok, time }`. Wrong or missing secret answers `404`. No database details are returned. |

See [Monitoring and health](../guides/hosting/monitoring-and-health.md) for the worker and beat health checks.

## Files, cards and documents

| Route | Method | Who may call it | How it is checked |
|---|---|---|---|
| `/api/uploads/{key}` | `GET` | Anyone with the address | Only processed public files (organisation images, page PDFs, member photos) are served. PDFs always download as attachments. Member photos are `private, no-store`; other images cache for a year. |
| `/api/documents/{documentId}` | `GET` | Signed in | Staff with `payments.view`, an authenticator and the member inside their unit scope; or the member the receipt was issued to (verified email, member accounts on). Everyone else gets `404`. Rate limit `documentView`. |
| `/api/cards/{cardId}?format=pdf\|png&side=front\|back` | `GET` | Signed in | Staff of the card's organisation who manage cards or see contact details, with an authenticator and the member in scope; or the member. Revoked cards are for staff only. Audited as `CARD_DOWNLOADED`. Rate limit `cardRender`. |
| `/api/verify/{token}/card?side=front\|back` | `GET` | Anyone | The PNG on the public check page. Token must be 43 URL-safe characters; only a live, current card in an active organisation draws. Rate limit `verifyCardImage` (30 a minute). |
| `/api/o/{orgSlug}/sample-card` | `GET` | Anyone, while the published public page shows a card section; otherwise staff with `org.settings` and an authenticator | A WebP of the live design with fictional holder data. Rate limit `sampleCard`. |

The card check page itself is `/verify/{token}`, a page rather than an API route. See [Member cards](../features/member-cards.md).

## Exports

Every export needs a signed-in session. Staff exports also need an authenticator, the named permission, an organisation status that allows it, and pass the `reportExport` rate limit. Other organisations answer `404`.

| Route | Permission | Audit action |
|---|---|---|
| `/api/exports/members/{orgSlug}` | `members.export` (contact columns need `members.contact`) | `MEMBERS_EXPORTED` |
| `/api/exports/reports/{orgSlug}/{report}` | `reports.membership` or `reports.finance`, by report | `REPORT_EXPORTED` or `FINANCE_REPORT_EXPORTED` |
| `/api/exports/gstr1/{orgSlug}` | `reports.gstr1` (organisation-wide staff only) | `FINANCE_REPORT_EXPORTED` |
| `/api/exports/cards/{orgSlug}?format=sheet\|cards\|zip` | `cards.manage` | `CARD_EXPORT_DOWNLOADED` |
| `/api/visits/export/{orgSlug}` | `reports.membership` | `REPORT_EXPORTED` |
| `/api/exports/platform/analytics` | Verified super admin | `PLATFORM_REPORT_EXPORTED` |
| `/api/exports/account` | The signed-in person's own data only (`?format=csv` for memberships) | `ACCOUNT_DATA_EXPORTED` |

Exports stay inside the requester's unit scope. Bulk card downloads run one at a time per server; a second answers `429`. The full list of audit actions is at [/docs/audit-actions](/docs/audit-actions).

## Page visits

`POST /api/visits` counts one public page view: a route template and, for organisation pages, the slug. It always answers `204`, whether or not the visit counted, so nothing leaks. Bodies over 1 KB, known bots, unknown or inactive organisations and addresses over the `apiRead` limit are dropped silently. The address is hashed for the limiter key only and never stored. See [Web analytics](../features/web-analytics.md).

## Sign-in

| Route | Method | What it is for |
|---|---|---|
| `/api/auth/*` | `GET`, `POST` | Auth.js sessions, CSRF and provider callbacks. Starting or finishing a Google, Apple, GitHub or OIDC sign-in while that method is off redirects to `/login?error=method_disabled`. |
| `/api/auth/phone/code` | `POST` | Asks for a phone sign-in code. Always the same answer whether or not the number has an account; `429` with `Retry-After` when the number, its country or the address is over its limit; `404` when phone sign-in is off. |
| `/api/auth/saml/{slug}/login` | `GET` | Starts a SAML sign-in and sets a flow cookie that the final step must send back. |
| `/api/auth/saml/{slug}/acs` | `POST` | The identity provider's signed response. A valid one becomes a one-time ticket; any failure is audited and counts towards address blocking. |
| `/api/auth/saml/{slug}/metadata` | `GET` | Public service-provider metadata for the identity provider's administrator. Rate limit `apiRead`. |

Mutating `/api/auth` requests use the `auth` rate limit. Sign-in rules are in [Security](../SECURITY.md) and [Sign-in](../features/sign-in.md).

## Split hosting gateway

`POST /api/frontend/{kind}/{endpoint}` is how the separate website (Netlify or the frontend image) reaches the backend when `DEPLOYMENT_MODE=backend`. In that mode the backend answers only `/api` paths.

- The request must carry `X-SWO-Frontend-Key` equal to `FRONTEND_GATEWAY_SECRET` (64 hex characters) and an `Origin` equal to `NEXT_PUBLIC_BASE_URL`. Anything else answers `404`.
- `{kind}` is `view` (read a page's data, body up to 64 KB) or `action` (run a server action, body up to 12 MB); `{endpoint}` must be in the generated registry.
- Views are checked for anything shaped like a stored secret before they leave the backend.
- The key authenticates the website, never a person: each view and action still checks the session and permissions itself.

See [Hosting the site on Netlify](../DEPLOYMENT_NETLIFY.md#how-the-split-works) and [Configuration](../CONFIGURATION.md).
