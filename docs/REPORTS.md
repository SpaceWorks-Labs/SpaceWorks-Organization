# Reports

How Space Works Organization counts members and money. Every figure on every report follows these
definitions. They are unit-tested: see `tests/unit/reports-*.test.ts` and `tests/integration/reports.db.test.ts`.

## How it works

- **Source of truth.** Membership metrics are computed from `MembershipTerm` dates and `TermStatusEvent.effectiveAt`, the domain time of each change. `recordedAt` is ignored, so a lapse the sweep records late still lapses on its grace end.
  - The engine is pure: `lib/reports/dataset.ts` and `lib/reports/metrics/*`.
  - `lib/reports/source.ts` loads the rows for one scope.
- **Scope.** Every query is limited in three ways:
  - to the organisation;
  - to the viewer's unit subtree (`TeamMember.unitId`), narrowed further by the report's unit filter, which can never widen it;
  - optionally to one plan.
  A unit or plan id from another organisation is ignored. Cross-tenant URLs return 404.
- **Periods.** A period is a half-open range of instants `[from, to)`.
  - Its boundaries are local midnights in the organisation's timezone. FY 2026-27 in Asia/Kolkata runs from 31 Mar 2026 18:30 UTC to 31 Mar 2027 18:30 UTC.
  - "This financial year" and the rolling presets stop at the end of today.
  - The previous period, used for deltas, has the same length and ends where this one starts.
- **Financial-year labels.** "FY 2026-27" for a year starting in April. A calendar-year organisation gets "FY 2026". Built on `lib/membership/periods.ts financialYearLabel`.
- **Money.** Reports never add different currencies together.
  - Every money figure is a list of per-currency totals, with the organisation's default currency first.
  - Helpers: `lib/reports/money.ts` (`totals`, `groupTotals`, `subtractTotals`, `formatTotals`, `csvAmount`), built on `lib/money/currencies.ts` `totalsByCurrency`.
  - A chart plots one currency (`format="money:INR"`).
- **Contact details.** Roles without `members.contact` (Viewer) see masked contact details everywhere, exports included: `s•••@e•••.com` and `•••• 45`.
- **Drill-down.** Every tile and bar links to `/dashboard/[org]/members?drill=<metric>&period=…&plan=…&dunit=…`. The directory resolves the same member set through `lib/reports/drill.ts`, inside the viewer's own scope.
- **Exports.** `GET /api/exports/reports/[org]/[report]` streams CSV and is rate-limited.
  - When the stream ends it writes one audit row: `REPORT_EXPORTED`, or `FINANCE_REPORT_EXPORTED` for finance reports. The row holds the actor, report, period, plan, unit, `scoped`, `rows` and `complete`.
  - An abandoned download is still audited, marked `complete: false`.

## Membership definitions

A term is **held** once it was activated (paid, approved or free): status `UPCOMING`, `ACTIVE`, `GRACE`, `ENDED`, `LAPSED` or `REVOKED`.

- **Activation time.** The term's first event into `ACTIVE`/`UPCOMING` from `null`/`PENDING_*`/`EXPIRED`.
- **Revocation time.** The last event into `REVOKED`.

### Point-in-time standing

| Metric | Definition |
| --- | --- |
| **Active(t)** | Distinct members with a held term where `startsAt ≤ t < endsAt` (lifetime terms have no end) and not revoked by `t`. **GRACE is not counted as active.** |
| **Grace(t)** | Distinct members not active at `t` with a held term where `endsAt ≤ t < graceUntil`, not revoked by `t`. Reported separately. |
| Closing instant | A period's closing standing is read just before `to`, and never later than now. |

### Period metrics (period P = [from, to))

**Membership flows**

| Metric | Definition |
| --- | --- |
| **Joined (New)** | Members whose first activation, over all their terms in scope, falls in P. |
| **Came back (Reactivated)** | Members not new in P with a `NEW`-kind term activated in P, after an earlier term of theirs had lapsed. Reinstating a revoked term is not a comeback. |
| **Lapse instant** | `graceUntil` (or `endsAt` with no grace) of a held term with no held successor and no revocation. `ENDED` (renewed) terms never lapse. |
| **Lapsed** | Members with a lapse instant in P, up to now. |
| **Left (churned)** | Lapsed in P and neither active nor in grace at P's close. |
| **Revoked** | Members with a revocation in P. Revoked terms are never due, renewed or lapsed. |

**Renewals**

| Metric | Definition |
| --- | --- |
| **Due** | Held, non-revoked terms whose `endsAt` falls in P and has arrived (at or before now). Counted per term, so one per member per plan. |
| **Renewed** | Due terms with a held successor (`renewedFromId`), early renewals included. |
| **Open** | Due terms that are neither renewed nor past grace. |
| **Renewal rate** | Renewed ÷ (renewed + lapsed) among due terms. Open terms wait; the rate settles once grace ends. No decided terms gives "—", never 0%. This is Novi's "Renewal %"; some products divide by all due terms. |
| **First-year renewal rate** | The same, restricted to the member's first held term on that plan. |

**Rates**

| Metric | Definition |
| --- | --- |
| **Churn rate** | Left ÷ Active(start of P). Nobody active at the start gives "—". |
| **Retention rate** | (Active(end) − joined − came back) ÷ Active(start), capped at 100%. This is a headcount measure, unlike the renewal rate. |
| **Net change / growth** | Active(end) − Active(start), and that change ÷ Active(start). |
| **Bridge** | Start + joined + came back − left − revoked ± other = end. "Other" is grace timing (members in grace at either edge). |

### Applications

| Metric | Definition |
| --- | --- |
| Applied | A term's event into `PENDING_APPROVAL`. The decision is the next event out of it: approved (anything but `REJECTED`/`CANCELLED`), declined (`REJECTED`) or withdrawn (`CANCELLED`). |
| **Median time to approve** | Median, and 90th percentile, of decision − application in hours, over approvals decided in P. Declines are not included. |
| Approval rate | Approved ÷ (approved + declined), decided in P. |
| Waiting | `PENDING_APPROVAL` now, whenever received, flagged after 7 days. |
| **Join funnel** | `NEW` terms opened in P, followed to today: started → approved (or needed no approval) → activated → active now. Each step is a subset of the last, with drop-off per step. |

### Breakdowns

| Breakdown | Definition |
| --- | --- |
| Plan mix | Active members per plan at P's close. A member on two plans counts on both. |
| Unit league table | One row per unit directly below the scope (or per top-level unit org-wide). Each row counts its whole subtree: active, grace, joined, lapsed, renewal rate and share of active. Members on the scope unit itself, or with no unit, get their own row. |
| Member roles | Active members per role held. A member with no role is counted under "No role". |
| Join source | New members in P by `Member.source` (join form, added by a manager, import). |
| Geography | Active members by `stateCode`, or "Not recorded" when missing. |
| Tenure | Active members by time since first activation (under 1, 1–2, 2–5, 5+ years), with the mean. |
| Record gaps | Over all members in scope: no phone, no state (needed for GST place of supply), no unit, no photo (needed on cards), minors without guardian details. |
| Expiry calendar | Active terms with no renewal, by the week they end, for the next 13 weeks. |
| Win-back list | Lapsed in P and not active or in grace now. |

### Trends and cohorts

- **Trends** (`membershipTrend`):
  - Stocks are read at each bucket's close.
  - Flows are counted inside the bucket.
  - Buckets are days for periods up to 45 days and months beyond.
  - In the renewal-rate chart, months with fewer than 3 decided renewals are left out, so one lapse does not read as 0%.
- **Cohort retention** (`cohortRetention`):
  - A member's cohort is the local month of their first activation.
  - Cell k is the share of the cohort active at the end of the k-th month after joining; month 0 is the joining month.
  - Future cells are empty.

### Daily rollup (`OrgDailyStats`)

**Rows and fields**
- The sweep (`runMembershipSweep` → `lib/reports/rollup.ts runStatsRollup`) writes one set of rows per organisation per **local day**.
- There is one row per (unit, plan), plus an all-plans row (`planId` null) per unit with distinct members. A unit subtree sums its rows, and a plan filter picks that plan's rows.
- Stocks (`active`, `grace`, `expired`) are taken at the end of the day; today's row is taken at now. `expired` is defined under "Analytics" below.
- Flows:
  - `joined`: new to the organisation on the all-plans row, new to the plan on a plan row.
  - `reactivated`, `lapsed` and `applications`.
  - `due`: terms ending that day.
  - `renewed`: renewal terms activated that day.

**Recomputation**
- A day is recomputed whole: delete, then rewrite from source rows. Running it twice gives the same rows.
- **Dirty days.** `markStatsDirty(client, organisationId, since)` marks every day from `since` to today. P7 calls it for backdated offline payments, late captures and refunds.
- The sweep also marks days dirty itself when it finds status events recorded since the last run with an earlier `effectiveAt`.

**Each run**
- It rebuilds dirty days, yesterday (once the day ends) and today (every 15 minutes).
- It backfills missing history up to 730 days, 120 days per organisation per run.
- Heartbeat: `OperationalHeartbeat` key `report-rollup`.
- **Expired backfill.** `runExpiredBackfill` (`lib/reports/rollupBackfill.ts`), called once per scheduler pass, rebuilds each organisation's whole calendar from the local day the backfill began back to its earliest stored day, including days with no rows: the old rollup wrote nothing for an all-zero day, which can now hold `expired` stock (after every membership lapsed). Up to 10 organisations and 60 days each per run, newest first. An all-zero day still writes no rows, so progress is kept per organisation in heartbeat `report-rollup-expired-backfill:<organisationId>` (`lastStartedAt` is the oldest day rebuilt; `lastSucceededAt` once the earliest stored day is reached). Runs walk the organisations by id from a cursor kept in the process, so an organisation that keeps failing is passed over and retried on the next full pass instead of holding up the rest. Heartbeat key `report-rollup-expired-backfill` gets `lastSucceededAt` when a pass from the start finds no organisation unfinished; the per-organisation rows are deleted then, and later runs stop after one read.

**Readers**
- The B1 trend reads the rollup (`lib/reports/rollupRead.ts`) when it covers the period and is fresh; otherwise it computes live, with identical stock definitions.
- A2 and A3 read only the rollup.

## Finance definitions

| Metric | Definition |
| --- | --- |
| **Collected** | `PAID` payments by `paidAt` in P, **net of refunds by refund date**: `PROCESSED` refunds by `processedAt` in P, whenever the payment was. Waived payments are never collected. |
| Revenue splits | By plan, unit, provider and method, each refund against its payment's group. By fee kind, a refund is apportioned over the payment's lines pro rata, by largest remainder, so parts add up exactly. |
| Average per paying member | Net collected ÷ distinct members who paid in that currency in P. |
| **Outstanding** | `PENDING` and `AWAITING_CONFIRMATION` payments, plus **`PENDING_PAYMENT` terms with no Payment row**. |
| Ageing | Days past the due date: the term's `paymentDueBy`, else when the charge was raised. Bands: not yet due, 0–30, 31–60, 61–90, over 90. |
| Collection rate | Of charges raised in P (payments created except cancelled, failed and waived, plus unpaid terms opened), the share by value now paid, per currency. |
| Failed payment rate | Online (Razorpay, Stripe) payments created in P that `FAILED` ÷ those `PAID` or `FAILED`. |
| Waivers | `WAIVED` payments created in P (count and forgiven amount); they carry no lines or document. |
| Offline queue (B8) | `AWAITING_CONFIRMATION` claims, oldest first, and flagged payments. |
| Maker-checker (B8) | Offline payments paid in P, split into confirmed by someone other than the recorder and self-confirmed. Also the median hours from claim to confirmation. |
| Renewal forecast | Active terms ending in the next 30, 60 or 90 days with no renewal, at their plan's renewal price ("at stake"), and that × the trailing 12-month renewal rate ("expected"). |
| Forecast vs actual | Per past month: the renewal value that fell due, against money collected for renewals of those terms. |
| Documents register (B6) | Documents issued in P. The continuity check covers every series and financial year, whatever the filter: sequence 1…last with no gaps and no repeats; cancelled numbers are listed. |
| GSTR-1 (B7) | One return month, INR, live documents only (see the table below). |
| GSTR-3B | 3.1(a) outward taxable supplies net of credit notes; 3.1(c) nil-rated and exempt; 3.2 inter-state supplies to unregistered persons by place of supply. A monthly liability chart is shown over the period. |
| SIMPLE tax | Documents with `otherTaxMinor`: taxable and tax per currency and rate, net of credit notes. |

The GSTR-1 tables in B7:

| Table | Contents |
| --- | --- |
| 4A B2B | Members with a GSTIN. |
| 5 B2C large | Inter-state, unregistered, invoice value **over ₹1 lakh**, per Rule 59(4) as amended by Notification 12/2024-CT from 1 Aug 2024. |
| 7 B2C others | Everything else unregistered, by place of supply, rate and inter/intra, net of the credit notes against those supplies. |
| 8 | Nil-rated and exempt (bills of supply). |
| 9B | Credit notes: CDNR (registered) and CDNUR (against B2C large). Others are netted into Table 7. |
| 12 | SAC summary split into B2B and B2C tabs (May 2025 layout), UQC `NA`, quantity 0. |
| 13 | Documents issued per nature and series: from, to, total, cancelled, net. Mandatory from May 2025. |

The register is laid out like the returns, but the figures must be checked with a chartered accountant before filing.

### Cash in hand

Offline payments (`provider` OFFLINE, PAID or AWAITING_CONFIRMATION) recorded in the period (`createdAt`) by someone
other than the member's own account, so member UTR claims and waivers are left out. Each is net of its refunds
(pending or processed). Grouped per collector (`recordedById`) and per member's unit, per currency, with the part
still awaiting confirmation and the day the oldest was recorded. Scoped viewers see their subtree. Needs
`reports.finance`; pure in `lib/reports/finance/cashInHand.ts`.

## Reports catalogue

### Platform (super-admin, `/super-admin/reports`)

| Report | What it shows |
| --- | --- |
| A1 Tenant pipeline | Organisations by status, applications and decisions in the window, median time to approve, oldest waiting. |
| A2 Tenant base | Organisations with active members per month end; largest organisations (rollup). |
| A3 Members across tenants | Active and in grace across all organisations per month end (rollup). |
| A4 Payment volume | Paid per currency, never converted, by provider, with organisation count. |
| A5 Usage vs limits | Members and team against `memberLimit` and `managerLimit`, fullest first. |
| A6 Outbox health | Messages by status, queued over 15 minutes, 14-day failure rate (details: Email). |
| A7 System health | Scheduler and rollup heartbeats, database size, stored files; webhook backlog once P7 lands (details: Operations, Storage). |
| Analytics (H7, `/super-admin/analytics`) | Every organisation compared (sortable), platform trends and failures by organisation; CSV export audited as `PLATFORM_REPORT_EXPORTED`. See "Platform analytics". |
| Organisation analytics (H7, `/super-admin/orgs/[id]/analytics`) | One organisation's member trend, renewal rate, revenue per currency, top-level breakdown and limits used. Each view writes `SUPER_ADMIN_ORG_ANALYTICS_VIEWED`, throttled to once per 30 minutes. |
| A8 Platform audit | Platform-admin actions. Opening an organisation's page writes `SUPER_ADMIN_ORG_VIEWED`, throttled to once per 30 minutes. |

### Organisation (`/dashboard/[org]/reports`)

**Membership tabs**

| Tab | Reports |
| --- | --- |
| Overview (B1) | Membership change bridge; renewal rate, churn, joined and time-to-approve tiles with deltas; active trend (area); joined vs lapsed; renewal-rate trend; standing now; attention list. PDF snapshot at `/reports/print` (browser print to A4). |
| Units (H6) | Level league: the units one level below the current one with drill-down. See "Level league". |
| Members (B2) | Unit league table, plan mix, join source, roles, state, tenure, record gaps, and the member register (masked for Viewer). |
| Renewals (B3, B4) | Due, renewed, renewal rate, first-year rate, churn and retention; renewal-rate trend; 13-week expiry calendar; renewal worklist with bulk reminder; cohort retention; win-back list. |
| Applications (B10) | Waiting, received, time to approve (median and p90), approval rate, join funnel, received vs approved, approvals queue. |

**Finance and team tabs**

| Tab | Reports |
| --- | --- |
| Money (B5, B8, B9) | Collected, average per paying member, collection rate, failed online payments; monthly collected and refunded per currency; splits by plan, unit, fee, provider and method; renewal forecast and forecast vs actual; outstanding with ageing; offline queue, flagged, maker-checker, waivers, refunds pending. |
| Tax and receipts (B6, B7) | Numbering check, documents register, GSTR-1 tables, GSTR-3B, monthly liability, SIMPLE tax. |
| Team activity (B11, B12) | Actions per team member by category, actions over time, latest actions; card issuance once P6 provides it. |

**Who sees which tab**
- Money and Tax need `reports.finance` (Owner, Manager, Treasurer).
- Team activity needs `audit.view` (Owner, Manager). A unit-scoped manager sees only the team inside their subtree.
- Everything else needs `reports.membership`.

**Filters and the bulk reminder**
- Filters on every tab: period (this FY, last FY, 12 months, 90 days, 30 days, this month, custom), plan and unit subtree.
- **Bulk reminder (B3).** `sendRenewalReminders({ organisationSlug, termIds })` needs `members.manage`. It queues the existing `renewal-reminder` outbox kind with a `ReminderLog` key `before-manual-<day>` or `after-manual-<day>`, so there is one manual reminder per membership per day.
  - The server re-checks scope and renewability, and skips anything else.
  - It is audited as `RENEWAL_REMINDERS_SENT`.

**Exports.** Report keys: `register`, `worklist`, `lapsed`, `approvals`, `cohorts`, `units`, plus the finance exports `revenue`, `outstanding`, `documents` and `gstr1`.

### Members (portal)

The member portal (`/account`) shows each person's memberships, history and payments from `lib/portal/*`; there
is no separate report engine for it.

## Finance data contract (P7 wires this)

Types are in `lib/reports/finance/types.ts` and must not be renamed. The pure functions in `lib/reports/finance/*` depend on them. All loaders live in **one file, `lib/reports/finance/source.ts`**, and return `[]` until wired.

```ts
loadPayments(scope: ReportScope): Promise<FinancePayment[]>
loadPaymentLines(scope: ReportScope): Promise<FinancePaymentLine[]>
loadRefunds(scope: ReportScope): Promise<FinanceRefund[]>
loadTaxDocuments(scope: ReportScope): Promise<FinanceTaxDocument[]>
loadUnpaidTerms(scope: ReportScope): Promise<UnpaidTerm[]>          // already works; add `payments: { none: {} }`
loadFinanceRows(scope: ReportScope): Promise<FinanceRows>           // all five
loadFinancePlans(organisationId: string): Promise<FinancePlan[]>    // already works
loadPlatformPayments(window: { from: Date; to: Date }): Promise<Array<FinancePayment & { organisationId: string }>>
export const FINANCE_TABLES_READY = false                           // flip to true once wired

type ReportScope = { organisationId: string; unitPath: string | null; unitId: string | null; planId: string | null; scoped: boolean; memberId?: string }
// Scope every query with: organisationId, member: { is: scopedMemberWhere(scope) } (handles unit subtree and memberId), and term.planId when planId is set.
```

| Type | Fields |
| --- | --- |
| `FinancePayment` | `id`, `memberId`, `termId \| null`, `unitId \| null` (via member), `planId \| null` (via term), `status` (`PENDING`, `AWAITING_CONFIRMATION`, `PAID`, `WAIVED`, `FAILED`, `CANCELLED`), `provider` (`RAZORPAY`, `STRIPE`, `OFFLINE`), `method \| null`, `currency`, `amountMinor`, `createdAt`, `paidAt \| null`, `flagged`, `recordedById \| null`, `confirmedById \| null` |
| `FinancePaymentLine` | `paymentId`, `kind` (`TERM_FEE`, `JOINING_FEE`, `REJOIN_FEE`), `currency`, `amountMinor`, `taxableMinor`, `cgstMinor`, `sgstMinor`, `igstMinor`, `otherTaxMinor` |
| `FinanceRefund` | `id`, `paymentId`, `currency`, `amountMinor`, `status` (`PENDING`, `PROCESSED`, `FAILED`), `createdAt`, `processedAt \| null` |
| `FinanceTaxDocument` | `id`, `paymentId \| null`, `refundId \| null`, `kind` (`RECEIPT`, `TAX_INVOICE`, `BILL_OF_SUPPLY`, `CREDIT_NOTE`), `number`, **`series`**, **`sequence`**, `financialYear` ("2026-27"), `issuedAt`, `cancelledAt \| null`, `currency`, `totalMinor`, `taxableMinor`, `cgstMinor`, `sgstMinor`, `igstMinor`, `otherTaxMinor`, **`rateBps`**, `placeOfSupply \| null`, **`recipientGstin \| null`**, `sac` |
| `UnpaidTerm` | `termId`, `memberId`, `planId`, `unitId \| null`, `currency`, `amountMinor` (price + joining fee), `createdAt`, `paymentDueBy \| null` |

The four fields in bold were added to the contract P7 was given:
- `series` and `sequence` come from `DocumentCounter` (series, value), for the gap check and Table 13.
- `rateBps` comes from the frozen tax snapshot.
- `recipientGstin` is the member's GSTIN on the snapshot, for B2B.

Once wired, P7 also calls `markStatsDirty` (`lib/reports/rollup.ts`) inside backdated payment, late-capture and refund transactions.

## Extension points

- **P7 finance.** Wire `lib/reports/finance/source.ts` as above. The Money and Tax tabs, finance exports and A4 then fill in with no other change.
- **P6 cards (B11).** Fill `lib/reports/cards.ts loadCardIssuance(scope, window)`; the contract is in its comment. Team activity shows the card tile only when it returns data.

## Sources

- Novi AMS, Membership Change Summary (Added / Dropped / Renewed, Renewal % and Retained %): https://intercom.help/novi-ams/en/articles/4711435-membership-change-summary-report
- i4a, retention rate calculation: https://i4a.com/blog/retention-rate-calculation/
- Marketing General, "Essential math for membership marketers" (tenure is 1 ÷ lapse rate): https://www.marketinggeneral.com/knowledge-bank/tipster/essential-math-for-membership-marketers
- Wild Apricot, payment reports (income by source, outstanding by days): https://www.wildapricot.com/features/online-payment-processing
- MemberPress, reporting: https://memberpress.com/advancedreporting
- Companies Act s.88, register of members: https://corporatelawreporter.com/companies_act/section-88-of-companies-act-2013-register-of-members-etc/
- Income-tax Rule 17AA, books of account for trusts: https://www.incometaxindia.gov.in/w/rule-17aa
- B2C large threshold of ₹1 lakh (Notification 12/2024-CT): https://help.tallysolutions.com/tally-prime/gstr-1/b2c-large-invoices-5a-5b/
- GSTN advisory: Table 12 split into B2B and B2C, Table 13 mandatory from May 2025: https://tutorial.gst.gov.in/downloads/news/updated_advisory_hsn_table12_25042025.pdf
- Not verified: Glue Up and Hivebrite formulas, and the Supreme Court status of s.7(1)(aa) after the Kerala High Court's IMA ruling (April 2025).

## Added after the first release (owner, 2026-10-20)

- **Subscription income by financial year** (Money tab): fees received in the year, plus advances received
  earlier, less advances for later years, plus arrears paid after the year end, less earlier years' arrears,
  equals fees earned in the year. Fees are earned day by day over the membership; joining fees and lifetime
  memberships count when received. Taxable values only, net of processed refunds, per currency. The identity
  holds to the paisa (`lib/reports/finance/subscriptionIncome.ts`, tested).
- **GSTR-1 JSON** (Tax tab, organisation-wide finance roles only, audited): the month's B2B, B2CL, B2CS,
  credit notes, nil/exempt, SAC summary (Table 12, B2B and B2C) and documents issued (Table 13, codes 1
  and 5) in the GST offline tool's layout (`version` GST3.2.4, `hash`), rupees with two decimals,
  dd-mm-yyyy dates and two-digit GST state codes; B2CL carries its place of supply on the group only
  (`lib/reports/finance/gstr1Json.ts`). In October 2026 a month covering every section validated against
  GSTN's "Save GSTR1" API schemas v4.1 (the shape the offline tool writes) and v5.0 (whose Table 13 uses a
  newer `doc_det_new` layout that the offline tool does not write). Still open it in the current offline
  tool before uploading.
- **Cohort retention by financial year** (Renewals tab): the share of each joining year still active at the
  end of that year and the four after it.
- **Monthly summary email**: on the first scheduler pass of each month, every owner, manager and treasurer
  gets last month's members, renewals, money (finance roles only) and waiting applications, for what they
  can see. Each person switches it off on the organisation overview. One claim per organisation and month.

- **Receipts and payments account** (Accounts, organisation-wide finance roles): one statement per currency
  and financial year, cash basis, split into cash and bank. Receipts are membership fees, joining fees and
  tax collected (from paid payments, by `paidAt`) plus recorded receipts; payments are processed refunds (by
  `processedAt`) plus recorded expenses. Opening balance plus receipts less payments is the closing balance.
  Offline payments taken in cash count as cash; everything else as bank. Expenses and other receipts are
  `LedgerEntry` rows: never deleted, only voided once with a reason, guarded by a trigger in migration 0009.
  Opening balances are entered per year and currency. The statement is pure (`lib/accounts/statement.ts`, tested).

## Analytics (H6, H7, owner 2026-10-29)

| Metric | Definition |
| --- | --- |
| **Expired(t)** | Distinct members not active and not in grace at `t`, holding no paid-for term that starts later (`UPCOMING`, activated by `t`), whose latest term that had started by `t` ended or lapsed rather than being revoked. On a plan row the latest term is that plan's, and a live term on any plan still rules the member out. Pure: `expiredAt` in `lib/reports/metrics/standing.ts`. |

**Dashboard home (H6).** `lib/reports/homeData.ts`, inside the viewer's unit scope:
- Active members at each month end and joined against lapsed for the last 12 months, from the rollup when it covers them (`rollupTrend`), else live (`membershipTrend`). Needs `reports.membership`.
- Renewals due: `ACTIVE` terms ending from now to the end of the 30th local day with no live renewal, by week of local days.
- Collected per month and currency (paid by `paidAt`, refunds by refund date) and outstanding now (open payments plus unpaid terms), from `loadCollections` and `loadOpenCharges` in `lib/reports/finance/source.ts`. Needs `reports.finance`. One chart per currency.

**Level league (H6, Reports → Units).** `levelLeague` in `lib/reports/metrics/levels.ts`. One row per unit directly below the current one (the top level organisation-wide), each counting its whole subtree, plus "This unit directly" (or "No unit") when it has anything:
- Active now, and growth: (active now − active 30 or 90 days ago) ÷ active then, "—" with nobody then.
- Renewal rate in the selected period (the B3 definition), with the number of decided terms.
- Collected in the period, net of refunds, and outstanding now, per currency, by the member's unit (finance roles only).
- `?unit=` picks the level and only narrows the viewer's scope; staff limited to a unit start there. A row with units below drills down a level; a bottom-level row opens its active members.

**Platform analytics (H7).** Aggregates only (owner decision 3): counts, unit and organisation names, money totals; never a member's name, email or phone. Pure in `lib/reports/platformAnalytics.ts`, loaded by `lib/reports/platformAnalyticsSource.ts` and `platformOrgAnalytics.ts`.

| Column | Definition |
| --- | --- |
| Active, growth | All-plans rollup rows on the organisation's latest rolled-up day, against 30 and 90 days before that day. |
| Renewal rate | Rollup flows over 12 months: renewals activated ÷ (renewals activated + lapses). This approximates the B3 rate without reading every organisation's terms. |
| Revenue | Paid payments by `paidAt` less processed refunds by refund date over the last 12 months, per currency. Money columns sort by the platform's most-used currency. |
| Outstanding | Open payments plus unpaid terms with no payment, now, per currency. |
| Last staff sign-in | Latest known-device sign-in (`KnownDevice.lastSeenAt`) of the organisation's team, platform admins left out. |
| Limits used | The fuller of members ÷ `memberLimit` and team ÷ `managerLimit`. |
| Dormant | Created over 60 days ago, with no staff sign-in and no paid payment in the last 60 days. |

Platform trends: active members at each month end (A3), organisations going live (`CREATED` or `APPROVED`), applications (`SUBMITTED`) and declines (`REJECTED`) per month, revenue per currency per month, and failures by organisation over 30 days (`FAILED` payments, `PAYMENT_WEBHOOK_UNMATCHED` audit rows, `FAILED` outbox messages by `payload.organisationId`). Months are UTC calendar months.

## Not applicable

- **Table 11 advances**: receipts are issued when money arrives, so no advance without a document arises.
