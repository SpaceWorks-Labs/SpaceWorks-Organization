# Receipts and refunds

Every payment gets a proper document, and every correction leaves a trail.

## What it does

- Paid payments produce GST receipts or tax invoices, or simple receipts where GST does not apply.
- Numbers run without gaps for each organisation in each financial year, April to March in the organisation's time zone.
- A paid payment is never edited or deleted. A mistake is reversed with a credit note.
- Members can ask for a refund. The organisation sets a refund policy, and staff approve or decline each request.
- Approved refunds go back through the gateway where there is one, and pending gateway refunds are followed up automatically.
- Other receipts and expenses can be kept in an accounts ledger, voided once and never deleted.

## Who can use it

- Viewing money needs `payments.view`. Issuing credit notes and handling refunds needs `payments.manage`.
- The accounts ledger needs `accounts.manage`. GSTR-1 tables need `reports.gstr1`, which is for the whole organisation only.

## Turning it on or off

The tax mode is chosen under Settings, Payments and tax. The refund policy is set by the organisation.

## Screenshots

![Receipts and refunds in the light theme](/screens/receipts-and-refunds-light.webp)

![Receipts and refunds in the dark theme](/screens/receipts-and-refunds-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
