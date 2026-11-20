# Limits

Every hard limit in Space Works Organization: upload sizes, rate limits, card downloads, organisation caps, imports, field lengths, SMS caps and retention.

## How to read this page

Each value comes from a constant or validation rule in the code, named in the last column. Limits that name an
environment variable are settings the operator can change; everything else needs a code change. For the
variables themselves, see [Environment variables](/docs/environment-variables) and
[CONFIGURATION.md](../CONFIGURATION.md).

## Uploads

| Limit | Value | Applies to | Source |
|---|---|---|---|
| Server action body | 6 MB | Any form sent to a server action, so every upload below stays under it | `next.config.ts` |
| Organisation logo | 5 MB, re-encoded to WebP within 1200 × 1200 | Logo uploads | `app/actions/media.ts` |
| Public page images | 5 MB | Cover and section images on the public page | `app/actions/public-page.ts` |
| Public page downloads | 5 MB, PDF only (checked by its first bytes) | Files in the downloads section | `lib/storage/pageFiles.ts` |
| Card artwork | 5 MB | Images added to a card design | `app/actions/card-design.ts` |
| Member photos | 5 MB, stored as a 600 × 600 WebP | Photos added by managers, at joining or from `/account` | `lib/membership/photo.ts` |
| Image size in pixels | 25,000,000 pixels (width × height) | Every image decoded for re-encoding | `lib/imageValidation.ts` |
| Card images when drawn | 1200 px (photos 600 px) | Images rasterised onto a card at 300 dpi | `lib/cards/assets.ts` |

## Rate limits

Rate limits count requests per address or per person in a fixed window, kept in Redis. In production, if Redis
cannot be reached, limited requests are refused rather than let through. Addresses are only told apart when
`TRUSTED_PROXY_IP_HEADER` is set (see [CONFIGURATION.md](../CONFIGURATION.md)).

| Bucket | Allowed | Window | Used for | Source |
|---|---|---|---|---|
| `global` | 300 | 1 minute | Every `/api` request per address, except `/api/health` and webhooks | `lib/rateLimit.ts`, `proxy.ts` |
| `action`, `frontendAction` | 180 | 1 minute | Server actions per person | `lib/rateLimit.ts` |
| `auth` | 10 | 1 minute | Sign-in requests (non-GET `/api/auth`, SAML, sign-in actions) | `lib/rateLimit.ts` |
| `signup` | 5 | 1 hour | Creating an account | `lib/rateLimit.ts` |
| `emailVerification` | 5 | 1 hour | Verification emails | `lib/rateLimit.ts` |
| `passwordReset` | 5 | 1 hour | Asking for a reset email | `lib/rateLimit.ts` |
| `passwordResetConfirm` | 10 | 1 hour | Using a reset link | `lib/rateLimit.ts` |
| `application` | 3 | 1 day | Organisation applications from `/start` | `lib/rateLimit.ts` |
| `join` | 10 | 1 hour | Join form submissions | `lib/rateLimit.ts` |
| `payment` | 20 | 1 hour | Starting a payment | `lib/rateLimit.ts` |
| `paymentClaim` | 5 | 1 hour | A member's "I've paid" claims | `lib/rateLimit.ts` |
| `webhook` | 1200 | 1 minute | Payment, email, SMS and messaging webhooks, and messaging stop links | `lib/rateLimit.ts`, `proxy.ts` |
| `upload` | 12 | 1 hour | Uploads | `lib/rateLimit.ts` |
| `invite` | 30 | 1 hour | Team invites | `lib/rateLimit.ts` |
| `verifyCard` | 120 | 1 minute | Public card checks at `/verify` | `lib/rateLimit.ts` |
| `verifyCardImage` | 30 | 1 minute | The card image on the public check | `lib/rateLimit.ts` |
| `sampleCard` | 60 | 1 minute | The sample card on a public page | `lib/rateLimit.ts` |
| `apiRead` | 600 | 1 minute | SAML metadata and visit beacons | `lib/rateLimit.ts` |
| `dataExport` | 5 | 1 hour | A person's own data export | `lib/rateLimit.ts` |
| `reportExport` | 60 | 1 hour | Report CSVs, GSTR-1, the member register, visits, platform analytics and bulk card downloads | `lib/rateLimit.ts` |
| `documentView` | 300 | 1 hour | Receipt and credit-note PDFs | `lib/rateLimit.ts` |
| `cardRender` | 60 | 1 hour | Member card PDF and PNG downloads | `lib/rateLimit.ts` |
| `testEmail` | 10 | 1 hour | "Send me a test" for an email template | `lib/rateLimit.ts` |
| `smsCode` | 10 | 1 hour | Phone codes asked for from one address | `lib/rateLimit.ts` |

### Sign-in protection

| Limit | Value | Source |
|---|---|---|
| Failures per email before a delay | 5, then 15 seconds, doubling up to 15 minutes; a correct sign-in clears it | `lib/signInBackoff.ts` |
| Address block | 20 failures in 15 minutes blocks sign-in, sign-up and password reset from that address for 1 hour; blocked again within 7 days, for 1 day | `lib/ipBlock.ts` |
| Emailed new-browser code | Valid 10 minutes; a new one can be sent after 60 seconds | `lib/loginSecurity.ts` |
| Known browsers kept per account | 20, each remembered for 400 days | `lib/loginSecurity.ts` |
| Re-authentication for sensitive actions | Within the last 10 minutes | `lib/reauth.ts` |

Super admins see and lift address blocks under Super admin, Security. See [SECURITY.md](../SECURITY.md#sign-in).

## SMS codes

| Limit | Value | Source |
|---|---|---|
| Code validity | 6 digits, 10 minutes, single use | `lib/sms/codes.ts` |
| Tries per code | 5 | `lib/sms/codes.ts` |
| Codes per phone number | 3 in 15 minutes and 10 in a day | `lib/sms/codes.ts` |
| Codes per country calling code per day, across the install | 500, or `SMS_DAILY_COUNTRY_CAP` (1 to 9,999,999) | `lib/sms/codes.ts`, `lib/env.ts` |

## Organisations and structure

| Limit | Value | Source |
|---|---|---|
| Members per organisation | No cap unless a super admin sets one (`memberLimit`, a whole number of at least 1) | `app/actions/super-admin-organisations.ts`, `lib/membership/memberLock.ts` |
| Team members per organisation | No cap unless a super admin sets one (`managerLimit`); checked against every team member when an invite is accepted | `app/actions/super-admin-organisations.ts`, `lib/inviteAcceptance.ts` |
| Open organisation applications per person | 3 waiting for a decision | `app/actions/organisation-application.ts` |
| Unit levels | Up to 4, each name 2 to 40 characters | `lib/membership/validators.ts` |
| Units per organisation | 2000 | `app/actions/units.ts` |
| Unit code | 1 to 6 letters A–Z or digits 0–9, unique per organisation | `lib/membership/validators.ts`, `lib/structure/units.ts` |
| Unit name | 2 to 80 characters | `lib/membership/validators.ts` |
| A unit's payment instructions | 1000 characters | `lib/payments/unitInstructions.ts` |
| Groupings per organisation | 30 | `lib/groupings/keys.ts` |
| Values per grouping | 1000, up to 5 levels below the top in a tree | `lib/groupings/keys.ts` |
| Smart groups per organisation | 100 | `app/actions/smart-groups.ts` |
| Team chat channels per organisation | 10 | `app/actions/chat-channels.ts` |
| Staff role name and description | Name 2 to 60 characters; description 200 | `lib/membership/validators.ts` |

Setting a member or team limit is audited as `ORGANISATION_LIMITS_CHANGED`. See
[Units](../features/units.md) and [Organisations](../features/organisations.md).

## Plans and join forms

| Limit | Value | Source |
|---|---|---|
| Plan name | 2 to 80 characters | `lib/membership/validators.ts` |
| Plan description | 2000 characters | `lib/membership/validators.ts` |
| Plan duration | 1 to 120 months | `lib/membership/validators.ts` |
| Grace period | 0 to 365 days (default 15) | `lib/membership/validators.ts` |
| Renewal window | 0 to 365 days (default 30) | `lib/membership/validators.ts` |
| Rejoin after | 1 to 3650 days | `lib/membership/validators.ts` |
| Reminder days | Up to 6 days before and 6 after, each 0 to 365 | `lib/membership/validators.ts` |
| Units a plan is limited to | 500 | `lib/membership/validators.ts` |
| Questions per plan | 40 | `lib/membership/validators.ts` |
| Question key | Starts with a letter; lowercase letters, digits and underscores; up to 40 characters | `lib/membership/validators.ts` |
| Question label and help text | Label 120 characters; help text 300 | `lib/membership/validators.ts` |
| Choices per question | 50, each up to 80 characters, no semicolons | `lib/membership/validators.ts`, `lib/membership/planAnswerValues.ts` |
| Short text answer | 300 characters (longer text is cut) | `lib/membership/planAnswerValues.ts` |
| Long text answer, or several choices together | 2000 characters | `lib/membership/planAnswerValues.ts` |
| Member name and email | Name 2 to 120 characters; email 320 | `lib/membership/validators.ts` |

See [Plans and join forms](../features/plans-and-join-forms.md).

## Imports and exports

| Limit | Value | Source |
|---|---|---|
| Member import file or Google Sheet | 2 MB | `lib/csv.ts`, `lib/googleSheets.ts` |
| Members per import | 2000 rows, plus the header row | `app/actions/member-import.ts` |
| Member register CSV | No row cap; streamed 500 members at a time | `app/api/exports/members/[orgSlug]/route.ts` |
| Bulk cards as a ZIP | 300 cards per download (`BULK_ZIP_LIMIT`) | `lib/cards/render.ts` |
| Bulk cards as one PDF | 1000 cards per download (`BULK_PDF_LIMIT`) | `lib/cards/render.ts` |
| Bulk card renders at once | 1 per server; a second request gets 429 | `app/api/exports/cards/[orgSlug]/route.ts` |
| Account data export | 2000 team rows and 200 memberships, with a `truncated` flag | `lib/accountDataExport.ts`, `lib/portal/dataExport.ts` |
| Offline collection sheet | 200 members per save | `lib/payments/collection.ts` |

A bulk card download that matches more cards than its limit is refused with a message to filter by plan, unit or
status first. See [Member cards](../features/member-cards.md).

## Card designs

| Limit | Value | Source |
|---|---|---|
| Layers per card side | 30 | `lib/cards/design/layers.ts` |
| Text in one layer | 400 characters | `lib/cards/design/layers.ts` |
| Footer text | 240 characters | `lib/cards/design/elements.ts` |
| Watermark opacity | Up to 30% | `lib/cards/design/elements.ts` |
| Saved design size | 128,000 characters of JSON | `lib/cards/design/presets.ts`, `app/actions/card-design.ts` |
| Card number pattern | 40 characters | `lib/cards/numbering.ts` |
| Card number | 32 characters | `lib/cards/numbering.ts` |

## Public page

| Limit | Value | Source |
|---|---|---|
| Sections | 30 | `lib/publicPage/sections.ts` |
| Text in one section | 6000 characters (longer text is cut) | `lib/publicPage/markdown.ts` |
| Gallery images | 12 | `lib/publicPage/sectionSchemas.ts` |
| People | 24 | `lib/publicPage/sectionSchemas.ts` |
| Testimonials | 12 | `lib/publicPage/sectionSchemas.ts` |
| Timeline entries | 24 | `lib/publicPage/sectionSchemas.ts` |
| Stats | 8 | `lib/publicPage/sectionSchemas.ts` |
| Downloads | 12 | `lib/publicPage/sectionSchemas.ts` |

## Webhook bodies

| Limit | Value | Source |
|---|---|---|
| Payment gateway webhooks | 256 KB | `lib/payments/webhookRoute.ts` |
| Email provider webhooks | 256 KB | `lib/email/webhooks/handle.ts` |
| Messaging webhooks | 256 KB | `lib/notify/webhooks/common.ts` |
| SMS webhooks | 64 KB | `lib/sms/webhooks/handle.ts` |
| Visit beacons | 1 KB | `lib/visits/route.ts` |

See [Webhooks and internal endpoints](webhooks-and-endpoints.md).

## Retention

| Data | Default | Range | Source |
|---|---|---|---|
| Sent and failed outbox messages | 30 days (`OUTBOX_RETENTION_DAYS`) | 1 to 365 | `lib/retention.ts` |
| Member message logs | 90 days (`MESSAGE_LOG_RETENTION_DAYS`) | 7 to 730 | `lib/retention.ts` |
| Phone-code records | 2 days | Fixed | `lib/retention.ts` |
| Revoked or idle session records | 90 days | Fixed | `lib/retention.ts` |
| Scheduled database dumps (bundled install) | 14 days (`BACKUP_RETENTION_DAYS`), one every 24 hours (`BACKUP_INTERVAL_HOURS`) | Up to 3650 | `deploy/backup.sh`, `docker-compose.prod.yml` |

> **Note:** In the cloud compose file `BACKUP_RETENTION_DAYS` defaults to 30 and is only shown on Super admin,
> Operations to describe your database provider's backups; the app deletes nothing with it.

Retention never removes audit rows, payments, receipts or credit notes. See
[Backups and restore](../guides/hosting/backups-and-restore.md).
