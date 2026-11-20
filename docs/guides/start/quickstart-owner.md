# Quickstart for organisation owners

Get an organisation approved, publish a plan, share the join link, approve your first member and start taking payments.

## Before you start

You need an account with a verified email address. Staff, including owners, must also turn on an authenticator app before the dashboard opens. The app sends you to **Account, Security** (`/account/security`) the first time.

> **Note:** The examples use an organisation called SpaceWorks, owned by Shaan Shoukath.

## 1. Get an organisation

There are two ways in.

| Route | What happens |
| --- | --- |
| Apply yourself | Open `/start` ("Run your memberships here"), fill in the application and send it. A platform admin reviews it. |
| Created for you | The platform super admin adds the organisation under **Super admin, Organisations, Add an organisation** and invites you by email as its owner. It starts active. |

The application form is only open while the operator is taking applications. If it says "Not taking applications", ask the operator to add the organisation for you.

## 2. Wait for approval

Your organisation's status shows on its application page, `/dashboard/<slug>/application`. The owners are emailed at each decision.

| Status | What it means for you |
| --- | --- |
| `PENDING_REVIEW` | A platform admin is looking at it. The dashboard stays closed except the application page. |
| `CHANGES_REQUESTED` | Read the note from the platform team, update your details and send the application again. |
| `ACTIVE` | Everything is open. Create plans and share your join link. |
| `REJECTED` | The note says why. The web address is held for 30 days, then released. |
| `SUSPENDED` | New members can't join. You can still record and receipt money already received, and export finance records. |
| `ARCHIVED` | It no longer takes members. Finance records and exports stay available. |

![Organisations in the light theme](/screens/organisations-light.webp)

![Organisations in the dark theme](/screens/organisations-dark.webp)

## 3. Set up the basics

Once approved, the **Overview** page (`/dashboard/<slug>`) shows a "Get set up" checklist: add your logo, invite your team and create a membership plan.

- **Settings, Profile** (`/dashboard/<slug>/settings`): name, logo and the member accounts switch ("Members can sign in to their own account").
- **Settings, Money and year**: the financial year and offline payment rules.
- **Settings, Units and roles** (optional): name up to four levels, for example Area then Unit, and build your unit tree. Each unit has a short code. See [Units](../../features/units.md).
- **Settings, Groupings** (optional): professions, regions or interests. See [Groupings](../../features/groupings.md).
- **Team** (`/dashboard/<slug>/team`): invite people by a single-use link that carries a role. See [Staff and roles](../../features/staff-and-roles.md).

## 4. Create a plan

Go to **Membership plans, New plan** (`/dashboard/<slug>/plans/new`).

| Setting | Choices |
| --- | --- |
| How long a membership lasts | Financial year, Fixed length (months), Until a date, or Lifetime |
| Price to join and price to renew | Amounts in your currency, plus an optional joining fee |
| How people join | Open to all, Apply and approve, Invite only, or Closed |
| How the plan is paid | Free, Paid online or in hand, or Paid in hand only |
| When membership starts | Starts when paid, or Starts now, pay later |
| Units | Open to every unit, or only chosen units (and everything below them) |

Then add join-form questions on the plan page. See [Plans and join forms](../../features/plans-and-join-forms.md).

## 5. Share the join link

- Your public page is `/o/<slug>`. It lists the plans people can join.
- Each plan's join form is `/o/<slug>/join/<plan>`. Use **Copy join link** on the plan.
- Add `?unit=CODE` to send people straight into a unit, for example `/o/spaceworks/join/annual?unit=KOCHI`.
- Whether the organisation appears in the public directory at `/organisations` is set by the platform super admin. Ask the operator if you want to be listed.
- For people you invite directly, create an invite on the plan page: by email for one person, or a shared link with a number of uses.

People need an account with a verified email to join. Design the page under **Settings, Public page**. See [Public page](../../features/public-page.md).

## 6. Approve your first member

On a plan that uses **Apply and approve**, applications wait. The Overview shows a **Waiting for approval** count, which opens **Members** filtered to those applications. Open the member and approve or decline.

After approval the member pays, or starts straight away on a free plan or a "Starts now, pay later" plan. When the membership first becomes active, their card is issued and emailed. See [Member cards](../../features/member-cards.md).

## 7. Set up payments

Open **Settings, Payments and tax** (`/dashboard/<slug>/settings/payments`).

- **Online:** save keys for one gateway, Razorpay or Stripe. Without the platform's `PAYMENT_SECRETS_KEY` the gateway section stays locked.
- **Offline:** always available. Write your payment instructions (UPI, bank, cash). Units can have their own.
- **Tax:** choose the tax mode. GST receipts and tax invoices are numbered without gaps per financial year.
- **Refunds:** set the refund policy members see.

Record cash on a member's page or in bulk on **Payments, Collection sheet**. See [Payments](../../features/payments.md), [Receipts and refunds](../../features/receipts-and-refunds.md) and [Tax on membership payments](../../GST.md).

> **Tip:** Turn on "A second person confirms offline payments" under Settings, Money and year if you want two people on every cash entry.

## Next steps

- [Owners manual](../../manuals/owners.md): everything only the Owner can do.
- [Managers manual](../../manuals/managers.md) and [Treasurers manual](../../manuals/treasurers.md) for your team.
- [Glossary](glossary.md) for the words used across the product.
