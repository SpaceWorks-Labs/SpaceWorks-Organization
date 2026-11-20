# 0.10.0: organisation landing builder and groupings

Status: owner decisions taken on 2026-11-19. This is built after 0.9.0 (the card showcase, the light/dark toggle
and the audit fixes) is finished and has passed QA.

## Owner's words

- "Per-organisation landing page and also editor."
- "One organisation has many members; one organisation divided by anything (region, place and so on) and many more
  conditions like that."
- **Staff limited by grouping:** yes. Staff can be limited to a grouping value, the way they are limited to a unit.
- **How members get values:** "added in form like a select option, chosen on the join form".
- **Landing sections:** "more, what all possible". That means hero and call to action, live counts and card,
  committee and testimonials, story timeline and templates.

## A. Groupings (divisions beyond the unit tree)

- **Model:**
  - `OrgGrouping` (organisationId, name such as "Profession", key, kind `list | tree`, `multiple` boolean, sortOrder,
    archivedAt).
  - `OrgGroupingValue` (organisationId, groupingId, parentId for trees, label, code, path, sortOrder, archivedAt).
  - `MemberGroupingValue` (organisationId, memberId, groupingId, valueId), with composite FKs per tenant like the
    other tables.
  - The unit tree stays the structural hierarchy (codes, card numbers). Groupings are extra dimensions, and an
    organisation can have several.
- **Join form:** a plan field type "grouping" renders a select (or multi-select, or a tree select). It is saved
  through `lib/membership/planAnswers.ts` rules into `MemberGroupingValue`, inside the member row lock. Staff edit
  values on the member page, in bulk from the members list, and through import.
- **Staff scope:**
  - `TeamMember` may carry grouping limits (`TeamMemberScope`: groupingId plus valueId, a tree value covering its
    subtree), combined with the unit limit as an AND.
  - `memberWhere`, `teamScope` and `unitInScope` grow into one scope builder (`lib/membership/scope.ts`) used by
    every member, payment, report, card, export and analytics query.
  - Granting follows `canGrant`/`mayGrant`: a giver can only grant within their own scope.
  - Organisation-wide-only capabilities stay refused to grouping-limited staff, as for unit-limited staff.
  - Every new query is organisation-scoped and grouping-scoped, with cross-tenant and cross-scope tests.
- **Smart groups:** saved conditions (AND/OR) over plan, status, unit, grouping values, join-form answers, join or
  renewal dates, age, city or state, and payment due. They are computed, never stored per member, and used for
  member filters, reports breakdowns, exports, email and chat audiences, and card printing.
- **Reports and analytics:** a breakdown by any grouping, next to the unit breakdowns (aggregates only for the
  super admin).

## B. Organisation landing-page builder (`/o/<slug>` editor)

- **New section types:**
  - Hero (headline, subtitle, button, cover image, accent).
  - Call to action.
  - Live counts (aggregates only, opt-in, by plan, unit or grouping).
  - Member card showcase (the organisation's own live card design drawn with sample names).
  - Committee or office bearers (photo, name, title; from staff or typed in).
  - Testimonials.
  - Story timeline.
  - Stats.
  - Image with text.
  - Video embed (allow-listed hosts only, checked with `isSafeLink`, and the CSP widened for those hosts on
    `/o/*`).
  - Downloads (the organisation's uploads).
  - Map link.
- **Templates:** starting layouts the editor can apply to a draft (for example Club, Alumni, Association,
  Makerspace).
- **Motion:** the landing page's shared motion (reveal once). Tenant logos never animate.
- **Preview:** light and dark preview in the editor; draft and publish as today.
- All content is rendered from parsed trees as React text (`lib/publicPage/markdown.ts`), never HTML, and images are
  the organisation's own `page-images` uploads.

## C. Payment modes, reminders on every channel, renewal conditions and custom messages (owner, 2026-11-19)

The owner's words: "full free, paid, paid but no need for an online service (in hand), and payment reminders via
notification channels, all from the design system, and membership renewal conditions like that, and custom message
and email per organisation too".

What exists today:

- A price of 0 makes a plan free.
- Offline payments are recorded by staff, with unit collection sheets and member "I've paid" claims.
- Renewal reminders go by email only, on `reminderDaysBefore` and `reminderDaysAfter` per plan (`ReminderLog`, sent
  once).
- `OrgEmailTemplate` covers two kinds only: card issued and membership activated.

What to build:

- **Payment mode per plan:**
  - Free: no payment step; joining or renewing activates after approval if the plan needs it.
  - Paid, online or in hand: the gateway if the organisation set one up, offline otherwise.
  - Paid, in hand only: no online service needed. The member sees the organisation's payment instructions
    (per unit, then per organisation), can say "I've paid", and staff confirm cash, UPI or bank receipt.
  - The join, renewal and pay pages and the receipts follow the mode, money settles only through
    `settlePayment`, and receipts stay gapless.
- **Reminders on every member channel (§16):**
  - Email (SMTP, SES, Resend, Postmark) and SMS (Twilio, MSG91), chosen per organisation, with a member's opt-out
    per channel where the law needs it.
  - Staff get a digest through the organisation's chat destinations (Slack, Discord, Mattermost, Telegram, signed
    webhook).
  - Reminder kinds: renewal due (days before), on the end date, grace started, grace ending, lapsed, payment pending
    (offline claim not confirmed), and an application waiting.
  - Everything goes through the outbox, once per kind per term, with the pay link (`/pay/<token>`) and the in-hand
    instructions where they apply.
  - "Send only what delivery needs": no other personal data in messages.
- **Renewal conditions per plan:**
  - The renewal window (opens N days before the end).
  - Renewal needs approval again (yes or no).
  - Ask again for answers or a photo at renewal.
  - Who may renew: by unit, grouping or age, using the smart-group conditions.
  - Renew into another plan when a condition holds (for example, Student moves to Annual at age 25, or after N
    years).
  - The lapse rule after grace.
  - Auto-renew stays off (no card-on-file billing).
  - Conditions are evaluated in `lib/membership/service.ts` (`startRenewal`), so every change writes a status event
    and an audit row.
- **Custom messages per organisation:**
  - `OrgEmailTemplate` grows to every member-facing kind: application received, approved, declined, payment due,
    payment received or receipt, membership activated, renewed, each reminder kind, lapsed, card issued, and refund
    decided.
  - Each kind has an email subject, heading and body, plus SMS text with a length counter.
  - Placeholders: name, organisation, plan, unit, card number, valid until, amount, due date, pay link, grace until,
    and payment instructions.
  - Plain text, escaped, never HTML; preview with sample values; the platform's wording is used when unset.

## D. Member reminders on WhatsApp, Telegram, Slack, Mattermost and Discord, per organisation and platform-wide (owner, 2026-11-19)

This mirrors SpaceWorks `dev`, `backend/apps/integrations`: `ChannelConfiguration` per space (channel and provider;
WhatsApp via `twilio` or `meta`), personal `NotificationEndpoint` rows with an `NotificationEndpointChallenge`,
`WhatsAppTemplate` per event, audience and locale, and the messaging consent, stops, eligibility, protections,
segments, sweep and pii_maintenance modules.

- **Channel configuration, two levels:**
  - **Platform-wide:** the super admin sets up the platform's own WhatsApp sender (Twilio or Meta Cloud API),
    Telegram bot, Slack app, Discord bot and Mattermost bot account. Organisations may use these without accounts of
    their own; the super admin decides whether that's allowed.
  - **Per organisation:** an organisation may bring its own (secrets write-only and encrypted with
    `encryptOrgSecret`, hosts checked with `assertPublicHost`, a test action, honest "unavailable").
  - Resolution order: the organisation's own, then the platform's, then off.
- **Personal endpoints:** a member links each channel from `/account → Notifications`:
  - Telegram: a one-time `/start <code>` deep link to the bot.
  - WhatsApp: the number, verified by a code (reusing the SMS code limits).
  - Slack, Discord and Mattermost: a direct message to a user in the organisation's workspace or server, linked by a
    one-time code the member sends to the bot.
  - Endpoints are stored per organisation (identity hashed for uniqueness), revocable, and audited without
    identifiers.
- **Consent and stops:**
  - Opt in per channel; STOP or UNSUBSCRIBE replies on WhatsApp and SMS stop that channel at once (provider webhooks
    verified by signature).
  - A one-click "stop these" link in every message.
  - Quiet hours in the organisation's timezone.
- **Routing:** the organisation chooses which channels each reminder kind (part C) uses, with a fallback order (for
  example WhatsApp, then SMS, then email) and one message per reminder, never one per channel. Staff digests stay on
  the organisation's chat destinations.
- **WhatsApp templates:** business-initiated WhatsApp messages need approved templates. The organisation maps each
  reminder kind and language to its approved template name and variables. The super admin does the same for the
  platform sender. Session-window replies are not used.
- **Delivery:** through the outbox once per reminder (idempotency key or outbox-id de-dup), delivery status from
  provider webhooks, a purge of message logs after the retention period, and only what delivery needs in each
  message.
- **Design-system rule:** §16 lists chat destinations (Slack, Discord, Mattermost, Telegram, signed webhook) and SMS
  (Twilio, MSG91), but not WhatsApp. The rule is: "A new provider is added here, with a decision in
  docs/decisions.md, before any product adds it". So WhatsApp (Twilio and Meta Cloud API) needs a decision added to
  the design system first. Ask the owner whether to draft that change in `../SpaceWorks-Design-System`.

## Gates

- **Release:** VERSION 0.10.0 and migration 0023.
- **Tests:** unit tests, integration tests (scope and cross-tenant), the 300-line rule, build, screenshots, then QA.
