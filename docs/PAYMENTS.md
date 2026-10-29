# Payments

How members pay, how money is recorded, and how receipts are issued. Tax rules are in [GST.md](GST.md).

## Ways to pay

Each organisation picks **one** gateway, or none:

| Gateway | How the member pays | Notes |
| --- | --- | --- |
| Razorpay | Checkout.js opens over the pay page (UPI, cards, netbanking) | Orders API. INR, plus the international currencies the Razorpay account has enabled. |
| Stripe | Redirect to Stripe Checkout and back | Checkout Sessions (`mode: payment`) on the organisation's **own** Stripe account. No Stripe script runs on our pages. Takes every supported currency; three-decimal currencies must be multiples of 10. New Stripe accounts in India may be invite-only. |
| Offline | UPI QR, bank transfer, cash, cheque | Always available. A manager records it, or the member submits "I've paid" with a UTR. |

Keys are saved under **Settings → Payments and tax**. Secrets are encrypted with AES-256-GCM using
`PAYMENT_SECRETS_KEY` (32 random bytes, base64), bound to the organisation, and never sent back to the browser.
Without that key the gateway section stays locked. Test mode follows the key (`rzp_test_`, `sk_test_`).

## The payment record

Every charge starts as a `Payment` with its `PaymentLine`s (term fee, joining or rejoining fee) and a frozen
`taxSnapshot`, **before** any gateway order exists. So the amount, tax and receipt are identical whichever way
the member pays.

| Status | Meaning |
| --- | --- |
| `PENDING` | A gateway attempt was started |
| `AWAITING_CONFIRMATION` | Offline money waiting for a manager (maker-checker, or a member's UTR claim) |
| `PAID` | Money received; document issued (or held, see below) |
| `WAIVED` | The fee was forgiven; no document, the amount forgiven is kept for reports |
| `FAILED` | The gateway failed or the claim was rejected |
| `CANCELLED` | Replaced by a newer attempt, or cancelled by a manager |

One open payment per term (a partial unique index); a new checkout cancels the previous attempt.

## Settling

`settlePayment` runs in one transaction: lock the payment, mark it `PAID`, activate the term
(`markTermPaid`), allocate the document number and insert the document. Lock order is always
**payment → term → document counter**.

Money received is **never refused**. These still become `PAID` with a document, and are flagged for review:

- paid after the attempt was cancelled or failed (late capture);
- the membership was already paid (duplicate);
- the organisation was suspended or the plan archived.

A **mismatched amount** is also `PAID` and flagged, but its document is **held**. A manager either issues the
receipt on the amount received (lines are re-apportioned) or refunds.

## Webhooks

`POST /api/webhooks/razorpay/{code}` and `/api/webhooks/stripe/{code}`. The `{code}` is an unguessable
per-organisation value shown in settings.

- The signature is checked with the organisation's webhook secret (Razorpay: HMAC of the body; Stripe:
  `t.v1` with a five-minute tolerance).
- `ProcessedWebhookEvent (provider, eventId)` makes every event apply once.
- Business outcomes always answer **200**; unknown events are acknowledged; only infrastructure errors give 5xx,
  so the provider retries. Razorpay disables endpoints that keep failing, so this matters.
- Events used: Razorpay `payment.captured`, `refund.processed`, `refund.failed` (`payment.failed` is
  acknowledged but closes nothing: one order takes several attempts, so a member can retry after a failure). Stripe
  `checkout.session.completed` (when `payment_status=paid`), `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`, `refund.created`, `refund.updated`,
  `refund.failed`.

## Reconcile

The scheduler polls open gateway attempts older than five minutes, every five minutes, through
`fetchPayment`, and settles or fails them. A member returning from Stripe, or finishing Razorpay Checkout,
settles straight away the same way. A Razorpay order whose attempts all failed stays open, since it can still
be paid. Attempts still open after a week are closed as `FAILED`; a capture that still arrives is receipted and
flagged. The gateway can't be switched while the current one has attempts open from the last week, because
webhooks and polling only reach the saved provider.

## Offline payments and maker-checker

With **"A second person confirms offline payments"** on (Settings → Money and year), a payment recorded by one
owner, manager or treasurer counts only after a different one confirms it. The receipt number is allocated at
confirmation. With it off, recorded payments are paid and receipted at once.

Members can say "I've paid" with a UPI or bank UTR. A reference can be claimed once per organisation (a
partial unique index ignores rejected claims, so a corrected claim can be resubmitted). Claims are rate
limited per member.

**Instructions per unit.** A unit can say how its members pay (`OrgUnit.paymentInstructions`, the unit page,
`setUnitPaymentInstructions`). Members see the nearest non-empty instructions, from their own unit up, then the
organisation's `offlineInstructions` (`lib/payments/unitInstructions.ts`, loaded by `lib/payments/payGuidance.ts`).
They appear on the pay page and pay links, the join confirmation, the payment emails and, without a gateway, renewal
reminders. With no gateway (`provider` NONE or no settings row) the wording reads "Pay your fee to your unit".

**Collection sheet** (`/dashboard/[org]/payments/collect`, `recordCollection`). Staff with `payments.manage` pick a
unit within their reach, tick members who owe, and record method, day received and each paper receipt-book number
(`reference`), up to 200 rows at a time. Each row is its own transaction through `recordOfflinePayment`, so the lock
order holds and one failure never blocks another; each row reports recorded, already paid or failed. The day received
goes in the note: `paidAt` stays the recording time, so receipts stay in order and memberships start as usual.
Staff held for one unit reach only members in its subtree (`scopedTerm`, `memberWhere`).

## Refunds and credit notes

Refunds are append-only. Offline refunds are recorded as money already handed back and processed at once.
Gateway refunds go to the provider after the refund row commits and stay `PENDING` until the provider (or its
webhook) confirms; a timeout keeps them pending rather than guessing. Each processed refund gets a
**credit note** with tax apportioned pro rata.

A manager may tick **Also end the membership** when refunding: the term the payment bought is cancelled
(`withdraw`, so it shows as cancelled, not revoked) and its card stops verifying.

### Refund policy and member requests

Settings → Payments and tax → **Refunds** sets the policy (`OrgPaymentSettings.refundPolicy`):

- **No refunds** (the default): members can still leave, but nothing is offered.
- **Full refund within N days** of payment: everything still refundable.
- **Unused share within N days**: the membership-fee lines (tax included) times the unused share of the term;
  joining and rejoining fees are never offered. A lifetime term offers its whole membership fee. The maths is
  `lib/payments/refundPolicy.ts` (pure, tested).

A member with a paid, running membership inside the window sees **Cancel and request a refund** on their
membership page, with the amount on offer and the policy text. That opens a `RefundRequest` (one open request
per payment, enforced by a partial unique index) and emails the organisation-wide finance team. Nothing changes
until a manager decides on the payment's page (or the **Refund requests** filter on Payments):

- **Approve**: the amount is prefilled from the policy and may be changed up to what is left; the refund runs
  as above and, unless unticked, the membership ends. The member is emailed.
- **Decline**: needs a note, which is emailed to the member; the membership carries on.
- The member may **withdraw** an open request. A refund made straight from the payment page closes any open
  request on it.

Requests are never deleted and are decided once (trigger in migration 0010). Erasure keeps them as money history
but replaces the member's reason; the member's data export includes them.

### Pending refund follow-up

Each scheduler pass (at most every five minutes) asks Razorpay or Stripe about gateway refunds still `PENDING`
after ten minutes, oldest-checked first, for up to 30 days: by the gateway refund id, or, when the original call
timed out before answering, by our refund id among the payment's refunds (`notes.refundId` /
`metadata.refundId`). Only the provider's answer settles or fails a refund. Refunds pending for more than a day
are flagged on the Payments page.

## Immutability

Database triggers enforce, with column allowlists:

- a paid or waived payment may only gain settlement details, review flags or anonymisation; it is never
  deleted;
- payment lines are written once (lines of an unpaid payment may be deleted with it);
- a tax document may only gain `cancelledAt`; never deleted;
- a refund may only move on from `PENDING`.

An organisation that has taken payments cannot be deleted; a platform admin archives it instead.

## Documents

Numbers are gapless per organisation, series and financial year: `PREFIX-2627-00042` for receipts and invoices,
`PREFIX-2627-C00042` for credit notes (at most 16 characters). PDFs are drawn on demand from the frozen
snapshot (`/api/documents/{id}`, for the finance team within their unit, or the member it was issued to), so
a rendering problem never burns a number. Amounts are printed with the ISO code ("INR 1,180.00").
Receipts are attached to the payment email.
