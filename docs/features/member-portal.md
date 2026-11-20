# Member portal

Members see and manage their memberships, payments, receipts, cards and personal data in every organisation from one account at `/account`.

## What it does

The portal is the **Account** area. Its tabs are **Memberships**, **Payments and receipts**, **Profile**,
**Data and privacy**, **Organisations**, **Notifications** and **Security**.

### How records are found

A person's member records are found only by their account's verified email address, matched to the email each
organisation holds for them. Nobody reaches a record by its id alone, and erased records never match. Until the
email is verified, the portal asks the person to verify it first. The first time a record is found, it is linked
to the account, so staff can see it has been claimed.

One account sees its memberships in every organisation that has member accounts switched on, including
organisations that have since been suspended or archived, so history is never lost.

### Memberships

- **Memberships** (`/account`) shows every organisation the person belongs to, with each plan's standing and their
  member cards.
- Each organisation has its own page (`/account/memberships/<org>`) with the memberships, their history, the
  member's roles and **Your details**.
- Buttons appear when they apply: **Pay now** for an unpaid membership, **Renew** or **Rejoin**,
  **Cancel renewal** or **Withdraw application**, and **Leave**.
- **Leave** ends the membership on that plan now, along with any renewal lined up. Payments already made stay on
  record and are not refunded automatically.
- **Cancel and request a refund** appears where the organisation's refund policy allows it. See
  [Receipts and refunds](receipts-and-refunds.md).
- Members download their cards as PDF or PNG. See [Member cards](member-cards.md).

### Renew from the account

1. Open the organisation's page under **Memberships**.
2. Choose **Renew**. If the plan asks again, confirm your answers or add a current photo.
3. Pay with **Pay now** where a fee is due (the pay page is `/account/pay/<membership>`), or wait for the
   organisation to approve the renewal if the plan needs it.

See [Renewals](renewals.md) for the renewal window and conditions.

### Your details and photo

- Under **Your details**, members change their name, phone, state, guardian details (for members under 18) and
  their answers to the public questions of the plans they hold. Their email, unit and managers-only answers stay
  with the organisation.
- Where the organisation allows it, members upload or replace the photo printed on their card. The organisation's
  team can always change it.

### Payments and receipts

**Payments and receipts** lists what the person has paid each organisation, with every receipt and credit note to
open or download.

### Data and privacy

- **Download your data:** everything (JSON) or the memberships (CSV), covering the account, team roles and member
  records in every organisation. Up to 5 downloads an hour.
- **Consent:** see what you agreed to when you joined, and **Withdraw consent**. The record stays, with the date
  it was withdrawn.
- **Erase your details:** **Ask to erase my details** opens one request per organisation at a time, which the
  member can withdraw before it is decided. Staff approve or decline it; a decline comes with a note, emailed to
  the member.

Approving an erasure anonymises the person in that organisation for good: name, email, phone, photo, answers,
grouping values and notes are cleared, live memberships end and stored files are deleted. The member number,
membership history and money records are kept (payment records for 8 years, as the law requires), so reports and
accounts still add up.

> **Note:** Erasure affects one organisation. A person who belongs to several asks each one.

### Notifications

**Notifications** lets members get reminders and notices by text or chat as well as email, one organisation at a
time, and shows the recent messages they were sent. See [Notifications](notifications.md).

## Who can use it

- Any member with an account and a verified email address, in organisations that have member accounts on.
- Staff decide erasure requests on the member page with `erasure.decide`, only for members inside their reach.
  Suspended and archived organisations can still decide them.
- Staff switch member accounts and member photo upload on or off with `org.settings` (◆ `ORG_WIDE_TO_CHANGE`).

## Turning it on or off

Both switches are under **Settings**, **Profile**, in the **Member accounts** section (`/dashboard/<org>/settings`):

- **Members can sign in to their own account** is on by default. Off, the organisation keeps members' records and
  payments itself: members can't see that organisation in their account, payment emails carry a signed pay link
  (`/pay/<token>`, valid for 30 days) and other emails link to the public page. Scanning a member's card still
  shows whether they're current.
- **Members can add their own photo** is off by default, and applies only while member accounts are on.

## Screenshots

![Member portal in the light theme](/screens/member-portal-light.webp)

![Member portal in the dark theme](/screens/member-portal-dark.webp)

## API

There is no public REST API yet. The account export (`/api/exports/account`), card downloads (`/api/cards/<card>`)
and receipts (`/api/documents/<document>`) are listed in
[Webhooks and internal endpoints](../reference/webhooks-and-endpoints.md). The source is on
[GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).

## Related

- [Renewals](renewals.md), [Receipts and refunds](receipts-and-refunds.md) and [Member cards](member-cards.md)
- [Sign-in](sign-in.md) and [Notifications](notifications.md)
- [Manual for members](../manuals/members.md) and [Quickstart for members](../guides/start/quickstart-member.md)
