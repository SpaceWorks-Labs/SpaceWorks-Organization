# Email and chat notifications

## Email

Two kinds of email go out, through two routes.

| Kind | Examples | Sent through |
|---|---|---|
| Account and team emails | password reset, email verification, sign-in codes, new-device alerts, owner invites, organisation review notices, monthly report digest, members waiting to be verified | the platform's email provider (Super admin → Settings, or `EMAIL_PROVIDER` and its variables) |
| Member emails | membership notices and reminders, receipts and credit notes, member invites, ID cards, refund and erasure replies | the organisation's own provider when set up and on; otherwise the platform's |

### Email providers

Every install supports the same four providers, for the platform and for each organisation that brings its own:
**SMTP**, **Amazon SES**, **Resend** and **Postmark**. Email is off until one is fully set up; a basic install
works without it (nothing is sent and the operations page shows email as unavailable).

| Provider | Fields | Idempotency | Bounce and complaint reports |
|---|---|---|---|
| SMTP | host, port, login, password (Nodemailer; TLS required in production) | none | none |
| Amazon SES | region, access key ID, secret access key (and optional session token from the environment); SES v2 `SendEmail` signed with SigV4 as a raw message | none: the outbox claim de-duplicates | SNS signature, from the one pinned topic |
| Resend | API key (REST) | `Idempotency-Key` = the outbox id | Svix signature |
| Postmark | server token and message stream (REST) | none: the outbox id travels as metadata and the claim de-duplicates | basic auth with the saved secret |

The HTTPS providers are reached only at their own fixed hosts over TLS, never through redirects, with a 20 second
timeout; the SES host is built from a validated region. Secrets are encrypted at rest (the platform's with
`MFA_ENCRYPTION_KEY`'s derived key, an organisation's with `PAYMENT_SECRETS_KEY`'s email key), write-only (a saved
secret is never sent back to the browser, only that one exists; leaving the field blank keeps it) and never put in
logs, audit rows, URLs or action replies. Changes are audited by field name only. Platform settings:
Super admin → Settings → Email provider. An organisation's own: Settings → Email (owners and managers).

**Send a test** sends to the person testing, through what is on the form (saved secrets fill blank fields), before
anything is saved; ten an hour. A test of exactly what is saved is kept as the last test that went through, and the
Super admin → Email page shows the provider as unavailable when it is not set up or its last test failed.

**Suppression.** Bounces and complaints reported by a provider go on one suppression list (`EmailSuppression`:
address lower-cased, reason `BOUNCE` or `COMPLAINT`, provider). Only permanent bounces and complaints are added.
The platform has one list; an organisation with its own provider has its own (`organisationId`). Every send
checks its account's list: a suppressed address is not sent to, and the outbox row fails at once with that reason
(no retries). Webhooks: `POST /api/email/webhooks/{ses|resend|postmark}` (add `?org=<organisation id>` for an
organisation's own provider; the settings screen shows the exact URL). Nothing in the body is read until the request
is verified: Resend by its Svix signature (HMAC-SHA256 of id, timestamp and body, five-minute tolerance), Postmark by
basic auth whose password is the saved webhook secret, SES by the Amazon SNS signature (certificate only from an
`sns.<region>.amazonaws.com` HTTPS address, the topic ARN pinned in settings, an hour's tolerance; a subscription
confirmation is followed only after that). Unverified requests get 401 and write nothing.

**Delivery guarantees.** Email goes through the outbox after the change commits. A row is claimed atomically and
marked sent as soon as the provider accepts, and never offered again. Resend's idempotency key makes a retry after
a crash safe; for SES, Postmark and SMTP the claim is the only de-duplication, so a crash or a lost reply between
acceptance and the database write can send one message twice. Rejected recipients and suppressed addresses fail
without retries; outages and throttling retry with backoff.

**Not used here:** push (FCM, APNs) and AI (Anthropic). This product has no native apps to push to and no AI
feature, so neither provider is configured; they are listed in the product rules for the products that do.

**An organisation's own email** lives in Settings → Email (owners and managers): sender name and address,
reply-to, and the provider above (for SMTP: host, port 587 or 2525 STARTTLS, 465 TLS, 25, login and password).
**Send test email** records when it last went through. In production TLS is required and an SMTP host must
resolve to public addresses.

Without its own settings an organisation's member emails come from the platform address but in the
organisation's name (`"Kunj Company" <noreply@platform>`), with replies going to its contact email.

Code: `sendBrandedEmail({ organisationId, … })` in `lib/email/message.ts` picks the route through
`organisationEmailTransport` (`lib/email/orgTransport.ts`); emails without `organisationId` use the platform
(`getEmailTransport`, `lib/email/transporter.ts`). Both return one `Mailer` interface (`lib/email/providers/types.ts`):
`resend.ts`, `postmark.ts`, `ses.ts` with `sigv4.ts`, or Nodemailer for SMTP, wrapped by `withSuppression`
(`lib/email/suppression.ts`). Fields and secrets: `lib/email/providerConfig.ts`. Webhooks: `lib/email/webhooks/*`.

### Delivery

Every email and chat alert is a row in the database outbox (`enqueueOutbox` in `lib/outbox.ts`, kinds in
`lib/outboxKinds.ts`), queued in the same transaction as the change it reports, so a rolled-back change never
sends anything. PostgreSQL is the source of truth; Redis only ever carries row ids.

- The BullMQ `beat` runs the `outbox-relay` job every minute (`lib/queue/registry.ts`). It hands the 100 oldest
  due rows, and any claim left stale for 15 minutes, to the `outbox` queue by id.
- The `worker` delivers those rows one id at a time, `QUEUE_OUTBOX_CONCURRENCY` (5) at once per worker. Each row
  is claimed atomically (`PENDING` → `PROCESSING`), so several workers never send one twice.
- A failed send goes back to `PENDING` with exponential backoff (2, 4, 8… minutes, at most an hour; at most
  8 minutes for one-hour links), and the queued job waits until the row is due again. After 8 attempts, or a
  payload that can never be sent, the row is `FAILED` and shown in Super admin → Operations.
- Rows that carry a bearer link or code (password resets, verification, invites, sign-in codes) are deleted once
  sent, and short-lived ones are dropped rather than sent after they expire.
- The operations page's "Outbox scheduler" heartbeat is fresh while the relay runs; it shows the last delivery's
  counts and error.
- Hosts without a beat call `POST /api/internal/outbox` once a minute with `Authorization: Bearer $CRON_SECRET`;
  a worker still sends. Development without Redis can set `JOBS_INPROCESS=true` to send from the web process.

### Wording of member emails

Settings → Email → **Wording of member emails** lets an organisation write its member messages in its own words (all seventeen kinds are listed under "Member messages on every channel" below; the first two are):

| Kind | Email |
|---|---|
| `card-issued` | the membership card (PDF attached): sent when a card is first issued on activation, and by **Email card** |
| `membership-activated` | the notice that a membership has started |

Each has a subject, a heading and a body (`OrgEmailTemplate`, one row per organisation and kind; subject and
heading up to 150 characters, body up to 5,000). The body is plain text: a blank line starts a new paragraph, and
every paragraph is escaped by `sendBrandedEmail`, so nothing typed is ever sent as HTML. Placeholders are `{name}`
(the member's full name), `{organisation}`, `{plan}`, `{unit}`, `{cardNumber}` and `{validUntil}`; one with no value
(a member without a unit) is left empty, and anything else in curly brackets is sent as typed.

The editor shows a live preview with sample details. **Send me a test** sends the wording in the editor to the
editor's own verified address through the organisation's email route (ten an hour). **Use the standard wording**
deletes the row. Saving needs `org.settings` held for the whole organisation and is audited
(`ORG_EMAIL_TEMPLATE_SAVED`, `ORG_EMAIL_TEMPLATE_RESET`). Without a row the standard wording is used.

Code: `lib/email/templates.ts` (pure rendering, shared with the preview), `lib/email/orgTemplates.ts`,
`app/actions/email-templates.ts`.

### Card email on activation

When a membership's activation issues a member's first card on a plan (`issueCardOnActivation`), a `member-card`
email is queued in the same transaction, if the member has an email address and the organisation is active. The row
holds only ids; the PDF is drawn when the email is sent and never stored. Renewals and reinstatements that keep the
card send nothing, so one activation sends at most one card email. Queuing it starts the 10-minute cooldown on
**Email card**.

### Sheet onboarding and unit verification

An import (CSV or a shared Google Sheet) can **Send to the unit's lead to verify**: each imported person gets a
membership on the chosen plan waiting for approval (`openTerm` with `needsVerification`, status event
`sent-to-verify`), even though staff imported them. These people never applied, so no "application received"
email or chat alert goes out for them. Instead, once the import finishes, staff holding `members.manage` whose
reach takes in at least one of them (their role held for the whole organisation, or for the member's unit or an
ancestor) get **one** `verification-alert` email for the import, with how many are waiting for them and a link to
Members → Waiting for approval. The importer is never emailed about their own import. The alerts are queued in the
import's closing transaction, with its audit row (`lib/membership/importAlerts.ts`, `lib/email/verificationAlert.ts`).

Verifying (approving) starts the membership, issues the card and queues the card email as above. A lead can verify
only members in their own subtree.

## Text messages (SMS)

Phone sign-in codes are the only text messages the platform sends. The operator picks **Twilio** or **MSG91** under
Super admin → Auth → SMS (or `SMS_PROVIDER` and its variables in `docs/CONFIGURATION.md`). Off until set up; without
one, phone sign-in is unavailable and hidden. Everything else follows the shared outside-service contract:

- **Secrets** (auth token, API key secret, MSG91 auth key, report token) are write-only and encrypted at rest; a saved one
  is shown only as "Saved". Changes are audited by field name (`INSTANCE_SMS_PROVIDER_UPDATED`).
- **Send a test** texts a number the administrator types, through what is on the form, before anything is saved. The
  number is used once and never stored or audited; the result (`INSTANCE_SMS_TEST_SENT`, provider and outcome only)
  is kept as the provider's health.
- **Hosts.** The server connects only to `api.twilio.com` and `control.msg91.com`, over HTTPS, without following
  redirects.
- **Sending.** A code is queued as an outbox row of kind `sms-code` in the same transaction as its record, and sent by
  the worker after commit. The outbox id is Twilio's idempotency token. Once the provider accepts, its message id is
  stored on the code's record and a later delivery of the same row sends nothing, so a crash never sends twice. A refused
  number or bad credentials fail for good; network errors, 429 and 5xx retry while the code lasts (ten minutes).
- **Content.** The text carries the code and the product name only: "123456 is your Space Works Organization code."
  MSG91 sends the operator's approved DLT template, which takes the variables `otp` and `brand`.
- **Delivery reports.** Twilio's status callback (`/api/sms/webhooks/twilio`) is requested on each message and checked
  by its `X-Twilio-Signature` (HMAC-SHA1 over the address and the sorted fields, keyed with the account auth token), so it
  needs the auth token. MSG91 has no signature: give it `/api/sms/webhooks/msg91?token=<report token>`. Reports update the
  state (queued, sent, delivered, undelivered, failed) and the provider's error code on the code's record only; no number
  or text is stored in them or in the audit log. Records are removed after two days.
- **Unavailable, honestly.** With no provider, or one missing a field, the SMS panel says "Unavailable" and the sign-in
  switch for phone codes shows "Not configured".

## Chat alerts

Settings → Notifications (owners and managers) holds up to ten chat channels per organisation. Each picks
its alerts:

| Alert | When |
|---|---|
| New application to review | someone applies to a plan that needs approval |
| Payment received | a gateway or offline payment settles |
| Payment waiting to be confirmed | a member submits a UPI or bank reference, or a recorded payment needs a second person |
| Member asked for a refund | a refund request is opened |
| Member asked to erase their details | an erasure request is opened |
| Member left | a member leaves from their account |
| Monthly summary | the first `monthly-digest` run of each month (hourly): active members, joined, lapsed, waiting |

Alerts are team-only and short: what happened, member number, plan, amount, and a link to the dashboard.
Member names appear only when the channel turns on **Show member names**; erasure requests never carry a name.
Alerts are queued in the same transaction as the event and delivered by the worker with retries. A channel the
provider no longer accepts (deleted webhook, removed bot, revoked token) is switched off and its error shown.

### Setting up each service

- **Slack:** add the *Incoming Webhooks* app to a channel and paste its URL (`https://hooks.slack.com/services/…`).
- **Discord:** channel settings → Integrations → Webhooks → New webhook → *Copy webhook URL*
  (`https://discord.com/api/webhooks/…`). Mentions are disabled in every alert.
- **Mattermost:** Integrations → Incoming webhooks → Add, then paste the URL (`https://your-server/hooks/…`).
  The server must be reachable over HTTPS at a public address.
- **Telegram:** create a bot with @BotFather, add it to your group or channel, and use the bot token and the
  chat's numeric ID (or `@channelname` for a public channel).
- **Signed webhook:** your own HTTPS address on a public host (checked when saving and again on every send, no
  redirects). Each alert is posted as `{"text": "…"}` with `x-spaceworks-timestamp` (seconds) and
  `x-spaceworks-signature` (`sha256=` and the hex HMAC-SHA256 of `timestamp.body` with your secret). Check the
  signature and refuse timestamps more than a few minutes old. The address and secret are stored encrypted and
  never shown again; **Send a test** is on each channel.
- **WhatsApp:** uses the WhatsApp Business Cloud API (Meta). In WhatsApp Manager create a *Utility* template
  named `team_alert`, language English (`en`), whose body is exactly `{{1}}`, and get it approved. Then enter the
  phone number ID, a permanent access token (a system user token), and up to five recipient numbers with the
  country code. Business-started WhatsApp messages can only use approved templates; each alert is sent as that
  template's one parameter, on a single line.

Destinations are stored encrypted (`PAYMENT_SECRETS_KEY`, a key derived for chat). Slack, Discord, Telegram and
WhatsApp only ever post to their own provider's address; nothing follows redirects.

Code: `lib/chat/*` (`events.ts`, `config.ts`, `send.ts`, `message.ts`, `notify.ts`); `queueChatAlerts` is called
where each event happens.

## Member messages on every channel

Every member-facing message is one of seventeen **kinds** (`lib/messages/kinds.ts`): application received, approved and
declined; payment due and received; membership started, renewed, revoked and left; renewal due, ends today, grace
started, grace ending and lapsed; payment being checked; card issued; refund decided. Each goes to a member **once**, on the first
channel the organisation's routing lists that the member can be reached on, with the later ones only as a fallback.

| Channel | Connection | Member links by |
|---|---|---|
| Email | the email providers above | nothing: their address |
| Text message | Twilio or MSG91 | a number verified by a code texted to it |
| WhatsApp | Twilio WhatsApp sender, or Meta WhatsApp Cloud API (phone number id, access token, app secret, verify token) | a number verified by a code (the phone-code limits apply) |
| Telegram | a bot token (a webhook secret is made and sent with `setWebhook`) | `https://t.me/<bot>?start=<code>` |
| Slack | a Slack app: bot token and signing secret | a direct message to the app carrying the code |
| Discord | a bot: token, application id, public key | the `/link code:<code>` command |
| Mattermost | server address, bot access token, slash command token | `/link <code>` |

**Two levels.** The super admin sets up the platform's channels (Super admin → Messaging; the platform's text-message
provider stays under Auth, because it also carries phone codes) and decides whether organisations may use them. An
organisation's Owner may bring its own (Settings → Messaging). Resolution is the organisation's own connection, then the
platform's when allowed, then off. Secrets are write-only and encrypted (the organisation's with the `messaging`
purpose of `encryptOrgSecret`, the platform's with the instance key), a saved secret is not reused with another account,
each channel has a **Test it** action (a bot's own identity check, an account fetch, a text to a number typed once), and
a channel whose last test failed reads **Unavailable** and sends nothing until a test goes through. A Mattermost server
must be a public host unless `MESSAGING_MATTERMOST_HOSTS` lists it. Changes are audited by field name only.

**Personal endpoints.** From `/account → Notifications` a member links a channel (`NotificationEndpoint`: the address
encrypted, a keyed digest for uniqueness, revocable). Chat codes are `XXXXXXXX-YYYYYY` (15 minutes, once, five tries, a
keyed hash only; `NotificationEndpointChallenge`); a code made for one connection never links another. An address
belongs to one person per connection. Endpoints sit under the connection that reaches them (an organisation's own bot, or
the platform's), so one link serves every organisation using that bot.

**Consent.** Opt-in, per organisation and channel (`MessagingConsent`), chosen on the same page after linking. A STOP
or UNSUBSCRIBE reply on WhatsApp or SMS (Twilio inbound and Meta webhooks, verified), `/link stop` or `/stop` in chat,
and the **stop link** at the end of every message (`/api/messaging/stop/<token>`: a signed page with one button, so a
link opened by a preview does nothing) all end it at once. A WhatsApp template should end with the `stopLink` variable.
Email messages say where to choose, and are never held back.

**Quiet hours.** An organisation may set a daily window in its own timezone. Texts and chat messages queued inside it
wait in the outbox until it ends.

**Routing.** Settings → Messaging chooses, per kind, an ordered list of up to four channels. A channel the member has not
linked or agreed to, that is not connected, that is in quiet hours, or (WhatsApp) has no template for the kind, is
skipped. One that refuses for good (a blocked bot, a bad number) is remembered on the log row and the next is tried; an
outage throws, so the queue retries the same channel with backoff. Exactly one message is delivered.

**WhatsApp templates.** A business may only start a WhatsApp conversation with an approved template, so each kind and
language is mapped to one (`WhatsAppTemplate`: a Twilio content SID or a Meta template name, and the ordered
placeholders that fill its variables). The organisation maps its own; the super admin maps the platform sender's.
Session-window replies are not used.

**Delivery.** `queueMemberMessage(tx, { organisationId, memberId, kind, values, dedupeKey })` (`lib/notify/send.ts`)
writes a `MemberMessageLog` row (unique per organisation, member and dedupe key) and a `member-message` outbox row in
the caller's transaction; `deliverMemberMessage` (`lib/notify/deliver.ts`) sends it. The membership notices, receipt,
card and refund emails call `deliverMemberMessage` from their own handlers, so they follow the same routing with the PDF
on email. Provider delivery states (Meta statuses, Twilio status callbacks) land on the log row. The log keeps the kind,
channel and state, never the text, a number or an address, and is purged after `MESSAGE_LOG_RETENTION_DAYS` (90).

**Reminders.** The membership sweep queues, each once per term through `ReminderLog`: renewal due (the plan's days
before) and ends today, the plan's reminders after the end (as "lapsed"), grace started, grace ending (the last three
days of grace), lapsed, and a payment claim the team has not confirmed after a day (the member is told, and the
`payment-to-confirm` chat alert goes out). Plans on in-hand payment only never carry a pay link: the message carries the
payment instructions and the account link. A daily **reminders digest** chat alert (8 in the morning, organisation time)
tells chat destinations how many messages went out.

### Custom wording for every kind

Settings → Email → **Wording of member emails** lists all seventeen kinds. Each has a subject, a heading and a body for
email, and a **short text** (up to 1,000 characters) for text messages and chat apps, with a segment counter. Placeholders:
`{name}`, `{organisation}`, `{plan}`, `{unit}`, `{cardNumber}`, `{validUntil}`, `{amount}`, `{dueDate}`, `{payLink}`,
`{graceUntil}` and `{paymentInstructions}`. Plain text, escaped, never HTML; empty short text uses the standard one. The
preview uses sample values. Code: `lib/email/templates.ts`, `lib/messages/standard.ts`.
