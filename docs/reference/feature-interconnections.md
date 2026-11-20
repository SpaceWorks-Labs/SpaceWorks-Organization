# How features connect

What each membership, payment, card and organisation event changes elsewhere: status events, audit rows, member messages, chat alerts, cards, receipts and caches.

## How to read this page

Each section below is one event. Its table lists the side effects, all written in the same database transaction
as the change itself unless the row says otherwise. The terms used:

| Term | Meaning |
|---|---|
| Status event | A `TermStatusEvent` row: the term, `from`, `to`, when it took effect and a `cause` (shown in backticks). Written by `lib/membership/service.ts` and the sweep. |
| Audit | An audit row by action name. The full list is in [audit actions](/docs/audit-actions). |
| Member message | A `MemberMessageKind` from `lib/messages/kinds.ts`, sent through the organisation's routing for that kind (email by default). |
| Fixed email | An email outside the routing, with the platform's own wording. |
| Chat alert | A `ChatEvent` from `lib/chat/events.ts`, queued by `queueChatAlerts` to every enabled channel of the organisation that subscribed to it. Nothing is queued when no channel subscribed. |
| Outbox | Every message is an outbox row written in the business transaction, so it goes out only if the change commits. See [NOTIFICATIONS.md](../NOTIFICATIONS.md). |

> **Note:** A term's stored status is a cache. `/verify`, the portal and reports read the live status from the
> term's dates (`statusAt` and `deriveStatus` in `lib/membership/lifecycle.ts`), so a card or page never waits
> for the sweep to be right.

## Memberships

### Someone joins from the public page

`submitJoin` in `app/actions/join.ts`, then `openTerm` in `lib/membership/service.ts`.

| Effect | What happens |
|---|---|
| Checks | The organisation must be active and the plan not archived. A new person needs room under the organisation's member limit (`hasRoomForMember`). |
| Member | Saved or updated (source `JOIN_FORM`), with this plan's answers, grouping answers and a consent record. Audit `MEMBER_ANSWERS_CHANGED` when answers changed. |
| Term | `PENDING_APPROVAL` when the plan needs approval (an invite stands in for approval). `PENDING_PAYMENT` when money is due first, with 14 days to pay. Otherwise the term starts at once. |
| Status event | `applied`, then `free-plan` or `activated-before-payment` when it starts at once. |
| Member message | `application-received`, `payment-due`, or `membership-activated` when it starts. |
| Chat alert | `application`, only when it waits for approval. |
| Card | Issued when the term starts, with a `card-issued` message. The card message waits until the join photo attempt ends. |
| Photo | Saved after the transaction. Audit `MEMBER_PHOTO_UPLOADED`. |

### A manager adds or imports members

| Effect | Add one (`app/actions/members.ts`) | Import (`app/actions/member-import.ts`) |
|---|---|---|
| Term | Opened as a manager, so approval is skipped. | The same, or sent to the unit's staff to verify (`PENDING_APPROVAL`, cause `sent-to-verify`). |
| Messages | As for a join. | Members sent to verify get no message and no chat alert. Each staff member who can verify them gets one `verification-alert` email for the whole batch. |
| Audit | `MEMBER_ADDED` | `MEMBERS_IMPORTED`, with counts. |

### Application approved or declined

`decideTerm` in `lib/membership/service.ts`. Every decision writes a status event and an audit row named
`MEMBERSHIP_<ACTION>`.

| Decision | Term and status event | Member message | Audit |
|---|---|---|---|
| Approve, money due first | `PENDING_PAYMENT`, 14 days to pay, cause `approved` | `application-approved`, with the pay link | `MEMBERSHIP_APPROVE` |
| Approve, nothing due first | Starts, cause `approved` | `membership-activated`, then `card-issued` | `MEMBERSHIP_APPROVE` |
| Decline | `REJECTED`, cause `reject` | `application-declined` | `MEMBERSHIP_REJECT` |
| Cancel (unpaid or undecided) | `CANCELLED`, cause `cancel` | None | `MEMBERSHIP_CANCEL` |
| Revoke | `REVOKED`, cause `revoke` | Fixed email | `MEMBERSHIP_REVOKE` |
| Reinstate | Back to its timed status, cause `reinstated` | None | `MEMBERSHIP_REINSTATE` |
| Extend | New end and grace dates, cause `extended` | None | `MEMBERSHIP_EXTENDED` |

Revoking leaves the card in place; `/verify` reads the live status and shows the membership as revoked.

### Renewal

`startRenewal` opens a `RENEWAL` term from the latest renewable term; a member whose last term lapsed past grace
rejoins with a new term instead. See [renewals](../features/renewals.md).

| Effect | What happens |
|---|---|
| Term | Opened like a join, with status event `renewal-started`. Renewing into another plan adds status event `renewed-into-plan` and audit `MEMBERSHIP_RENEWED_INTO_PLAN`. |
| When it starts | Dates follow on from the old term. A renewal paid after the old term ended turns the old term `ENDED` (cause `renewed`), not `LAPSED`. |
| Member message | `membership-renewed` when the new term starts later, `membership-activated` when it starts now. |
| Card | Kept. A renewal issues a card only for a member who never had one on that plan. |
| Audit | `MEMBERSHIP_RENEWED_BY_MEMBER` when the member renews from their account. |

### A member withdraws or leaves

From `/account` (`app/actions/portal.ts`).

| Event | Effect |
|---|---|
| Withdraw an application, unpaid term or paid-early renewal | `decideTerm` with `withdraw`: `CANCELLED`, audit `MEMBERSHIP_WITHDRAW`. No message. |
| Leave a plan | Every term that can end is withdrawn, then audit `MEMBER_LEFT`, a fixed email and the chat alert `member-left`. Nothing is deleted. |

### The status sweep

`runMembershipSweep` (`lib/membership/sweep.ts`) runs every minute as the `membership-sweep` job (see
[background jobs](../ARCHITECTURE.md#background-jobs)).

| Effect | What happens |
|---|---|
| Statuses | `UPCOMING` to `ACTIVE`, `ACTIVE` to `GRACE` (or `ENDED` when a paid renewal follows), `GRACE` to `LAPSED`, and `PENDING_PAYMENT` past its due date to `EXPIRED`. Each change is a guarded update with status event `sweep`. |
| Renewal reminders | `renewal-due`, `renewal-today` and, after the end, `lapsed`, on the days each plan sets. Only the most recent due reminder goes, once per term, logged in `ReminderLog`. |
| Lifecycle messages | `grace-started`, `grace-ending` (3 days before grace ends) and `lapsed`, each once per term. Erased members and renewed terms are skipped. |
| Unconfirmed claims | A member's "I've paid" claim still unconfirmed after 24 hours: `payment-claim-pending` and the chat alert `payment-to-confirm`, once per payment. |
| Daily digest | The chat alert `reminders-digest` once a day at 08:00 in the organisation's time zone. |
| Reports | The daily rollup runs last, on settled statuses (see [Reports and caches](#reports-and-caches)). |

## Money

### Payment settled

`settlePayment` in `lib/payments/settle.ts` is the only way money settles. It is called by the Razorpay and Stripe
webhooks, the five-minute gateway reconciliation, offline payments recorded without a second confirmer, and
`confirmOfflinePayment`. See [PAYMENTS.md](../PAYMENTS.md).

| Effect | What happens |
|---|---|
| Locks | The term's payments, then the term, then the document counter. A payment already `PAID` or `WAIVED` is returned unchanged. |
| Payment | `PAID`. Other open gateway attempts for the term are cancelled. |
| Term | A `PENDING_PAYMENT` or `EXPIRED` term starts (status event `paid`), with `membership-activated` or `membership-renewed` and a card on first activation. |
| Flags | Money is never refused. The payment is flagged for a manager when the amount differs, the attempt was closed, the organisation was not active, the term was already paid, the plan was archived or the membership could not start. |
| Receipt | A receipt, tax invoice or bill of supply, numbered gaplessly per organisation, series and financial year from `DocumentCounter`. A differing amount holds the document until a manager releases it (audit `PAYMENT_DOCUMENT_RELEASED`). |
| Member message | `payment-received`; the email carries the document as a PDF. |
| Chat alert | `payment` |
| Audit | `PAYMENT_PAID`, plus `PAYMENT_CONFIRMED` when a manager confirms an offline payment. |

### Offline payments

`lib/payments/offline.ts`. Collection sheets record one payment per member through the same function
(`lib/payments/collection.ts`).

| Event | Effect |
|---|---|
| Staff record a payment | `AWAITING_CONFIRMATION`, audit `PAYMENT_RECORDED`. When the organisation needs a second person to confirm, chat alert `payment-to-confirm`; otherwise it settles at once. |
| A member says they paid | `AWAITING_CONFIRMATION` with `memberClaim`, a fixed email and chat alert `payment-to-confirm`. A claim never counts as cash a collector holds. |
| Rejected | `FAILED`, audit `PAYMENT_REJECTED`. Only a member's own claim gets a fixed email, so they can submit it again. |
| Fee waived | A `WAIVED` payment, open attempts cancelled, the term starts, audit `PAYMENT_WAIVED`. No receipt is issued. |

### Refunds

`lib/payments/refunds.ts` and `lib/payments/refundRequests.ts`. See [receipts and refunds](../features/receipts-and-refunds.md).

| Event | Effect |
|---|---|
| Member asks for a refund | A refund request, audit `REFUND_REQUESTED`, a fixed email to staff who manage payments, chat alert `refund-requested`. |
| Approved | A refund (audit `REFUND_CREATED`), audit `REFUND_REQUEST_APPROVED` and the `refund-decided` message. Unless the manager unticks it, the term is withdrawn (audit `MEMBERSHIP_WITHDRAW`), so no revoked email goes. |
| Declined | Audit `REFUND_REQUEST_DECLINED`, `refund-decided` message. |
| Withdrawn by the member | Audit `REFUND_REQUEST_WITHDRAWN`. |
| Refund processed | Offline refunds are processed at once; gateway refunds when the provider confirms (webhook or the five-minute `refund-reconcile` job). Processing issues a numbered credit note and a fixed email with it attached. |

## Cards

`lib/cards/issue.ts`. See [member cards](../features/member-cards.md).

| Event | Effect |
|---|---|
| First activation | Card issued (audit `CARD_ISSUED`) and a `card-issued` message, only for an active organisation and a member who has not been erased. |
| New registration after the old membership ended | The old card ends (`MEMBERSHIP_ENDED`) and the new card gets a new number. |
| Manager reissues | The old card shows as replaced, the new one keeps the number under a new QR. Audit `CARD_REISSUED`. |
| Primary role changed | Every live card is reissued with the same number (`reissueCardsForRoleChange`). Audit `MEMBER_ROLES_CHANGED`, then `CARD_REISSUED` per card. |
| Manager revokes | The membership is untouched; `/verify` shows the card as revoked. Audit `CARD_REVOKED`. |
| Manager emails a card | `card-issued` message, audit `CARD_EMAILED`. |
| Card design approved | Audit `CARD_DESIGN_APPROVED`; the public page's cache is dropped, since it draws sample cards from the live design. |

## Organisation and structure

| Event | Effect |
|---|---|
| Unit moved (`moveUnit`, `app/actions/units.ts`) | The structure lock is taken, the unit's and its subtree's paths are rewritten, audit `UNIT_MOVED`. Levels, members' units and card numbers stay. The `public-page` and `analytics` caches are dropped. Other unit changes (create, update, archive, levels) drop the same caches. |
| Plan created, changed or archived (`app/actions/plans.ts`) | Audit `PLAN_CREATED`, `PLAN_UPDATED`, `PLAN_ARCHIVED` or `PLAN_RESTORED`; the `public-page` cache is dropped. An archived plan opens no new terms, and money paid on it is flagged. |
| Public page published or unpublished | Audit `PUBLIC_PAGE_PUBLISHED` or `PUBLIC_PAGE_UNPUBLISHED`; the `public-page` cache is dropped. Draft saves change nothing visitors see. |
| Organisation suspended (super admin) | Audit `ORGANISATION_SUSPENDED` and an `OrganisationReview` row; owners get an `organisation-notice` email. Joining stops, staff keep only the finance and record permissions in `SUSPENDED_CAPABILITIES` (`lib/permissionRoles.ts`), `/verify` reports the organisation as suspended, and money that still arrives is receipted and flagged. Reactivating writes `ORGANISATION_REACTIVATED`. |

## Erasure

`decideErasure` and `anonymiseMember` in `lib/portal/erasure.ts`, the one place anonymisation happens.

| Effect | What happens |
|---|---|
| Request | Audit `ERASURE_REQUESTED`, a fixed email to staff who can decide it, chat alert `erasure-requested`. |
| Terms | Every live or pending term is withdrawn (audit `MEMBERSHIP_WITHDRAW` each). |
| Member | Name, email, phone, photo, answers, guardian details and notes are replaced or cleared; roles and grouping values are removed; consents are withdrawn. Audit `MEMBER_ANONYMISED`. |
| Money | Payment rows keep amounts, dates, references and tax documents; notes are cleared and the rows marked anonymised. Nothing is deleted. |
| Photos | A `member-photo-purge` outbox job, retried until storage agrees. |
| Cards | `/verify` treats an erased member's card as not found. |
| Decision | Audit `ERASURE_APPROVED` or `ERASURE_REJECTED` and a fixed email to the member. |

## Reports and caches

| What | How it stays current |
|---|---|
| Reports | Computed from source rows when opened; finance reports read only `lib/reports/finance/source.ts`. See [REPORTS.md](../REPORTS.md). |
| Daily rollup (`OrgDailyStats`) | Rebuilt by the sweep: today at most every 15 minutes, finished days when marked dirty. Status events recorded late with an earlier effective time (backdated renewals, extensions) mark their days dirty. |
| Analytics cache | Dropped (`invalidateOrg(…, "analytics")`) whenever the rollup rewrites days, and when units or groupings change. |
| Public page cache | Dropped (`invalidateOrg(…, "public-page")`) when plans, units, the public page or the approved card design change. |
| Never cached | Money state, permissions, member records, cards, `/verify`, pay pages and write paths. The organisation behind `/o/<slug>` is read live, so suspending shows at once. |

See [read cache](../ARCHITECTURE.md#read-cache) for keys and lifetimes.

## Related

- [Notifications](../features/notifications.md) and [NOTIFICATIONS.md](../NOTIFICATIONS.md)
- [Payments](../features/payments.md) and [GST.md](../GST.md)
- [Member portal](../features/member-portal.md)
- [Webhooks and internal endpoints](webhooks-and-endpoints.md)
