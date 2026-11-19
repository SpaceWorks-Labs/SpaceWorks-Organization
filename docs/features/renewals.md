# Renewals

Memberships run in terms, and renewals keep a member's standing and card without a gap.

## What it does

- Each membership is a term with a start, an end and, where the plan allows, a grace period.
- A background job moves terms through active, in grace and lapsed, and sends renewal reminders.
- Members renew from their account, early or late. A renewal keeps the same card and number.
- Staff can send reminders in bulk from the renewals worklist, one manual reminder per membership per day.
- A lapsed member can rejoin, and a joining or rejoining fee applies if the plan sets one.

## Who can use it

- Staff need `members.manage` to renew, reinstate or send reminders.
- The renewals tab in reports needs `reports.membership`.

## Turning it on or off

Renewal reminders and grace are set on each plan. The member portal switch decides whether members renew from their account or through a payment link in the email.

## Screenshots

![Renewals in the light theme](/screens/renewals-light.webp)

![Renewals in the dark theme](/screens/renewals-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
