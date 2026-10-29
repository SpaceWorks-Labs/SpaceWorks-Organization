# Email and chat notifications

## Email

Two kinds of email go out, through two routes.

| Kind | Examples | Sent through |
|---|---|---|
| Account and team emails | password reset, email verification, sign-in codes, new-device alerts, owner invites, organisation review notices, monthly report digest, members waiting to be verified | the platform's SMTP (Super admin → Settings, or `SMTP_*`) |
| Member emails | membership notices and reminders, receipts and credit notes, member invites, ID cards, refund and erasure replies | the organisation's own SMTP when set up and on; otherwise the platform's |

**An organisation's own email** lives in Settings → Email (owners and managers): sender name and address,
reply-to, SMTP host, port (587 or 2525 STARTTLS, 465 TLS, 25), login and password. The password is stored
encrypted (`PAYMENT_SECRETS_KEY`, a key derived for email). **Send test email** sends to the person testing and
records when it last went through. In production TLS is required and the host must resolve to public addresses.

Without its own settings an organisation's member emails come from the platform address but in the
organisation's name (`"Kunj Company" <noreply@platform>`), with replies going to its contact email.

Code: `sendBrandedEmail({ organisationId, … })` in `lib/email/message.ts` picks the route through
`organisationEmailTransport` (`lib/email/orgTransport.ts`); emails without `organisationId` use the platform.

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

Settings → Email → **Wording of member emails** lets an organisation write two member emails in its own words:

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
- **WhatsApp:** uses the WhatsApp Business Cloud API (Meta). In WhatsApp Manager create a *Utility* template
  named `team_alert`, language English (`en`), whose body is exactly `{{1}}`, and get it approved. Then enter the
  phone number ID, a permanent access token (a system user token), and up to five recipient numbers with the
  country code. Business-started WhatsApp messages can only use approved templates; each alert is sent as that
  template's one parameter, on a single line.

Destinations are stored encrypted (`PAYMENT_SECRETS_KEY`, a key derived for chat). Slack, Discord, Telegram and
WhatsApp only ever post to their own provider's address; nothing follows redirects.

Code: `lib/chat/*` (`events.ts`, `config.ts`, `send.ts`, `message.ts`, `notify.ts`); `queueChatAlerts` is called
where each event happens.
