# Payments

Collect membership fees online or offline, and keep an honest record of every rupee.

## What it does

- Each organisation picks one online gateway, Razorpay or Stripe, or none. Offline is always available.
- Offline collection covers UPI QR, bank transfer, cash and cheque. A manager records it, or the member submits "I've paid" with a reference that a manager then confirms.
- Units can have their own payment instructions, and a collection sheet records one transaction per member.
- Members who cannot sign in pay through a signed pay link in their email.
- Amounts are whole paise. Gateway keys are stored encrypted and never sent back to the browser.

## Who can use it

- Viewing payments needs `payments.view`. Recording and confirming them needs `payments.manage`.
- Gateway and tax settings need `payments.settings`.

## Turning it on or off

Gateways are switched on by saving keys under Settings, Payments and tax. Without the platform's `PAYMENT_SECRETS_KEY` the gateway section stays locked and only offline payment works.

## Screenshots

![Payments in the light theme](/screens/payments-light.webp)

![Payments in the dark theme](/screens/payments-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
