# Managers manual

What the starter Manager role can do and where: plans, members, approvals, cards, payments and settings. It also covers the Viewer role.

## The Manager role

Manager is a starter role every organisation begins with (its internal key is `ADMIN`). Its description reads "Plans, members, approvals, cards, payments and settings." The Owner can edit or archive it, so your organisation's Manager role may differ. The Team page shows the role you hold.

You must turn on an authenticator app under **Account, Security** before the dashboard opens.

## What a manager can do

| Permission | What it means | Where |
| --- | --- | --- |
| `org.view` | Open the dashboard | Overview, Team |
| `members.view` | See members | Members, a member's page, Membership plans, Smart groups |
| `reports.membership` | Membership reports | Reports |
| `members.contact` | See members' email addresses and phone numbers | Members, member page, exports |
| `members.export` | Export member lists | Members |
| `payments.view` | See payments and receipts | Payments, Accounts |
| `payments.manage` | Record payments, confirm claims and refund | Payments, Collection sheet, member page |
| `reports.finance` | Finance reports | Reports: Money, Cash in hand, Tax and receipts |
| `members.manage` | Add, edit, approve and renew members | Add a member, Import members, member page |
| `cards.manage` | Issue, reissue and revoke member cards | Member page, bulk card downloads |
| `certificates.issue` | Issue, email, download and revoke certificates | Certificates, member page |
| `audit.view` | Read the activity log | Activity |
| `erasure.decide` | Decide requests to erase personal data | Member page |
| `team.manage` | Invite staff and change their roles | Team |
| `plans.manage` ◆ | Create and change membership plans | Membership plans |
| `payments.settings` ◆ | Change payment gateways and tax settings | Settings, Payments and tax |
| `org.settings` ◆ | Change the profile, public page, email and notifications | Settings |
| `structure.manage` ◆ | Change units, levels and member roles | Settings, Units and roles |
| `cards.design` ◆ | Draft card designs, including an area's own | Settings, Cards |
| `certificates.design` ◆ | Draft certificate designs | Certificates |
| `accounts.manage` ◆ | Record other receipts and expenses | Accounts |
| `reports.gstr1` ● | GSTR-1 export | Reports, Tax and receipts |
| `groupings.manage` ● | Create and change groupings and their values | Settings, Groupings |

A manager does not hold `roles.manage`, nor the Owner-only `cards.approve`, `certificates.approve`, `org.delete` and `ownership.transfer`. If you hold the role for one unit or a grouping value, ◆ screens are read-only and ● screens are closed. See [Limited staff](limited-staff.md).

## Everyday work

### Members and approvals

- **Members** (`/dashboard/<slug>/members`) has filters for all, active, waiting for approval, payment pending, in grace, lapsed and ending soon.
- Open a member to approve or decline an application, renew, revoke or reinstate a membership, set grouping values, and change the card photo.
- **Add a member** (`/members/new`) is for people who joined in person or paid offline. **Import members** (`/members/import`) brings a register from a Google Sheet or a CSV file.
- **Smart groups** (`/members/smart-groups`) saves conditions you can reuse as filters, in exports and in reports.

![Members list in the light theme](/screens/members-light.webp)

![Members list in the dark theme](/screens/members-dark.webp)

### Plans and join forms

**Membership plans** lists your plans. Create one with **New plan**, then add join-form questions, renewal conditions and member invites on the plan page. See [Plans and join forms](../features/plans-and-join-forms.md) and [Renewals](../features/renewals.md).

### Cards

Issue, reissue, revoke and email a member's card from their page. Under **Settings, Cards** you can save design drafts; only the Owner approves a draft so it reaches members' cards. See [Member cards](../features/member-cards.md).

Under **Settings, Cards** you can also draft an area's own design and card numbers (choose **Choose an area**), and on a unit's page under **Settings, Units and roles** you set the area's email, phone and website, which print on its members' card backs and show on its public page. See [Units](../features/units.md).

### Certificates

Open **Certificates** (`/dashboard/<slug>/certificates`).

- **New design** starts a certificate page. Edit it, and the Owner approves it before it can be used.
- **Issue certificates** gives a design to chosen members, to everyone current on a plan or to a smart group, up to 200 at a time, and can email each member the PDF. From a member's page, **Issue certificate** starts with that member.
- Open an issued certificate to download it, email it again, or revoke it with a reason.

See [Certificates](../features/certificates.md).

### Payments

Record offline payments on a member's page or for many members on **Payments, Collection sheet**. Confirm or reject members' "I've paid" claims, waive a fee, decide refund requests and refund from a payment's page. Each processed refund gets a credit note. See [Payments](../features/payments.md) and [Receipts and refunds](../features/receipts-and-refunds.md).

### The public page

**Settings, Public page** is a visual editor with autosaved drafts, a version history of the last 20 publishes, and a page for every area at `/o/<slug>/a/<CODE>`. See [Public page](../features/public-page.md).

### The team

On **Team** you can invite people and change or remove staff, but only for roles that grant strictly less than yours, inside your own reach. You never change your own role.

## The Viewer role

Viewer is the starter role for people who only need to look. Its description reads "Reads members and membership reports. Contact details are hidden."

| Permission | What it means | Where |
| --- | --- | --- |
| `org.view` | Open the dashboard | Overview, Team |
| `members.view` | See members | Members, member page, Membership plans |
| `reports.membership` | Membership reports | Reports |

A viewer can't change anything and doesn't see members' email addresses or phone numbers.

## Related

- [Owners manual](owners.md) for the full permission list.
- [Treasurers manual](treasurers.md) and [Limited staff](limited-staff.md).
- [Staff and roles](../features/staff-and-roles.md).
