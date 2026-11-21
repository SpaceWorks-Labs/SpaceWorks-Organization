# Members manual

Every page of your member account at /account: memberships, cards, payments, profile, notifications, privacy, security and organisations.

## Your account

One account holds all your memberships, in every organisation on this platform. Organisations find your records by your verified email address, so verify it first: until then, your memberships and payments stay hidden. Members never need an authenticator app, though you can turn one on.

To join an organisation, see the [Quickstart for members](../guides/start/quickstart-member.md).

## The pages

| Page | Route | What you do there |
| --- | --- | --- |
| Your memberships | `/account` | See every organisation you belong to, each membership's status and your cards |
| Membership | `/account/memberships/<slug>` | Your details for one organisation, history, receipts, renew, leave, refunds |
| Pay for your membership | `/account/pay/<term>` | Pay a membership that is waiting for payment |
| Your certificates | `/account/certificates` | Download certificates organisations have issued to you, as PDF or PNG, and open each one's check link |
| Payments and receipts | `/account/payments` | Everything you've paid, with every receipt and credit note |
| Your profile | `/account/profile` | Your name, photo, email and appearance |
| Notifications | `/account/notifications` | Phone or chat channels for each organisation, and recent messages |
| Privacy and your data | `/account/privacy` | Consent, a copy of your data, erasure |
| Account security | `/account/security` | Password, two-step sign-in, passkeys, devices |
| Your organisations | `/account/organisations` | The organisations whose team you are on |

## Your memberships

The wallet at `/account` shows each organisation with your memberships and their status, such as Active, In grace, Starts soon or Waiting for payment. A live membership shows your member card. Open the card to view it, download it, or show its QR code. Renewals keep the same card and number.

![Member portal in the light theme](/screens/member-portal-light.webp)

![Member portal in the dark theme](/screens/member-portal-dark.webp)

## One membership

Open an organisation from the wallet to reach its membership page.

- **Your details**: the answers you gave when joining, which you can update. If the organisation allows it, you can add or replace your card photo here.
- **History**: every term on each plan.
- **Receipts**: each payment with its documents as PDFs.

The actions you see depend on the membership:

| Action | When it appears |
| --- | --- |
| **Pay now** | The membership is approved and waiting for payment |
| **Withdraw application** | An application is waiting for approval, or a membership is unpaid |
| **Renew** | The renewal window is open, before the end or during grace |
| **Cancel renewal** | You started a renewal that hasn't begun |
| **Leave** | The membership is running |
| **Rejoin** | The membership lapsed, its payment expired or it was cancelled, and the plan still takes members |
| **Cancel and request a refund** | The organisation's refund policy offers money back on this payment |

If you can't renew, the page says why. A refund request goes to the organisation, which approves or declines it; you are emailed either way and can **Withdraw request** while it is open. See [Renewals](../features/renewals.md) and [Receipts and refunds](../features/receipts-and-refunds.md).

## Payments and receipts

`/account/payments` lists what you've paid each organisation. Each receipt, tax invoice and credit note opens as a PDF. Paid payments are never changed; a refund produces a credit note.

## Notifications

Reminders and notices always arrive by email. On `/account/notifications` you can also get them on your phone or in a chat app, one organisation at a time, where the organisation offers it. Recent messages are listed, newest first.

## Privacy and your data

- **Consent**: see what you agreed to when you joined, and choose **Withdraw consent**.
- **Download your data**: your account, your team roles and your member records in every organisation, up to 5 downloads an hour.
- **Ask to erase my details**: the organisation's staff decide the request. Erasure anonymises your details. Payment records are kept. You can withdraw an erasure request while it is open.

## Account security

Change your password, turn on two-step sign-in with an authenticator app, save recovery codes, add passkeys or a phone number, review sign-in methods and recent security activity, see where you are signed in, and sign out everywhere. See [Sign-in](../features/sign-in.md).

## Your organisations

This page is for people who also work on an organisation's team. It lists those organisations and your role in each, and lets you **Leave organisation**. The only owner can't leave until they transfer ownership or delete the organisation.

## When member accounts are off

An organisation can switch member accounts off. Its memberships then don't appear in your account, and its emails link to its public page or to a signed pay link, `/pay/<token>`, valid for 30 days. Card checks at `/verify` and certificate checks at `/verify/certificate` still work.

## Related

- [Member portal](../features/member-portal.md), [Member cards](../features/member-cards.md), [Certificates](../features/certificates.md), [Payments](../features/payments.md)
- [Glossary](../guides/start/glossary.md)
