# Treasurers manual

What the starter Treasurer role can do and where: payments, receipts, refunds, accounts and finance reports, with read access to members.

## The Treasurer role

Treasurer is a starter role every organisation begins with. Its description reads "Payments, receipts and finance reports. Reads members." The Owner can edit or archive it, so your organisation's version may differ.

You must turn on an authenticator app under **Account, Security** before the dashboard opens.

## What a treasurer can do

| Permission | What it means | Where |
| --- | --- | --- |
| `org.view` | Open the dashboard | Overview, Team |
| `members.view` | See members | Members, a member's page, Membership plans |
| `reports.membership` | Membership reports | Reports: Overview, Members, Units, Renewals, Applications |
| `members.contact` | See members' email addresses and phone numbers | Members, member page, payments, exports |
| `members.export` | Export member lists | Members |
| `payments.view` | See payments and receipts | Payments, a payment's page, Accounts, Settings, Payments and tax (read) |
| `payments.manage` | Record payments, confirm claims and refund | Payments, Collection sheet, member page |
| `reports.finance` | Finance reports | Reports: Money, Cash in hand, Tax and receipts |
| `accounts.manage` ◆ | Record other receipts and expenses | Accounts |
| `reports.gstr1` ● | GSTR-1 export | Reports, Tax and receipts |

A treasurer can't add or approve members, change plans, issue cards, invite staff or change settings. Gateway keys and tax settings need `payments.settings`, which the Treasurer role doesn't hold.

If you hold the role for one unit or a grouping value, you work only with members inside that reach, Accounts becomes read-only and the GSTR-1 export is closed. See [Limited staff](limited-staff.md).

## Payments

**Payments** (`/dashboard/<slug>/payments`) lists every payment, with a **Refund requests** filter. Open one for its details, documents and actions.

| Task | Where |
| --- | --- |
| Record cash, UPI, bank transfer or cheque for one member | The member's page |
| Record offline payments for many members of a unit | Payments, Collection sheet (`/payments/collect`) |
| Confirm or reject a member's "I've paid" claim | The payment's page |
| Waive a fee | The payment's page |
| Refund, with or without ending the membership | The payment's page |
| Approve or decline a member's refund request | The payment's page |

Paid payments are never edited or deleted. A mistake is reversed with a refund, and each processed refund gets a credit note. See [Payments](../features/payments.md) and [Receipts and refunds](../features/receipts-and-refunds.md).

> **Note:** With "A second person confirms offline payments" turned on under Settings, Money and year, someone else on the team must confirm a payment you recorded. The receipt number is given at confirmation.

![Payments in the light theme](/screens/payments-light.webp)

![Payments in the dark theme](/screens/payments-dark.webp)

## Accounts

**Accounts** (`/dashboard/<slug>/accounts`) is the receipts and payments account for each financial year, on a cash basis. It combines membership payments with everything else you record: other receipts and expenses, and opening balances. An entry can be voided once and is never deleted.

## Finance reports

Under **Reports**:

- **Money**: collected net of refunds, collection rate, failed online payments, splits by plan, unit, fee, provider and method, and outstanding fees by age.
- **Cash in hand**: offline money recorded by the team, by collector and by unit, including what is waiting for a second person. A member's own "I've paid" claim never counts as cash a collector holds.
- **Tax and receipts**: the numbering check, the documents register, monthly tax liability and the GSTR-1 tables for the whole organisation.

Money is never added across currencies. Definitions are in [Reports](../REPORTS.md); tax rules are in [Tax on membership payments](../GST.md).

## While the organisation is suspended

A suspended or archived organisation keeps every Treasurer permission except `reports.membership` and `members.contact`, so money already received can still be confirmed, refunded, receipted and exported.

## Related

- [Owners manual](owners.md) for the full permission list.
- [Managers manual](managers.md) and [Payments for operators](../PAYMENTS.md).
