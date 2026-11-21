# Owners manual

What the Owner of an organisation can do, where each screen is, and the permissions only the Owner holds.

## The Owner role

The Owner role holds every permission in the fixed list, including any added later. It can't be edited, archived or given by invite. An organisation can have more than one owner. Ownership passes to someone else only through a transfer.

Like all staff, an owner must turn on an authenticator app under **Account, Security** before the dashboard, its actions or its exports open.

> **Note:** A platform super admin can also act in your organisation as its owner. They never appear on your team, and everything they do is recorded in your activity log as "Platform super admin". See the [Super admins manual](super-admins.md).

## Owner only

These four permissions (marked ★ in the role editor) belong to the Owner alone. No other role can hold them.

| Permission | What it means | Where |
| --- | --- | --- |
| `cards.approve` | Approve a card design draft so it goes live on members' cards | Settings, Cards |
| `certificates.approve` | Approve a certificate design draft so certificates can be issued from it | Certificates |
| `org.delete` | Delete the organisation; also connect the organisation's own messaging channels and set its outside web analytics | Settings, Profile; Settings, Messaging; Settings, Web analytics |
| `ownership.transfer` | Offer the organisation to another person, who accepts on `/dashboard/<slug>/ownership` | Team |

Deleting needs a recent sign-in. A suspended or archived organisation can't be deleted, and nor can one that has taken payments or recorded accounts entries: ask the platform super admin to archive it instead.

## Every permission

The Owner holds all of these. Other roles hold the ones the Owner gives them.

| Permission | What it means | Where it is used |
| --- | --- | --- |
| `org.view` | Open the dashboard | Overview, Team (read), monthly summary email |
| `members.view` | See members | Members, a member's page, Membership plans (read), Smart groups, card scans |
| `reports.membership` | Membership reports | Reports: Overview, Members, Units, Renewals, Applications; web visits |
| `members.contact` | See members' email addresses and phone numbers | Members list, member page, payments, exports |
| `members.export` | Export member lists | Members, export |
| `payments.view` | See payments and receipts | Payments, Accounts (read), Settings, Payments and tax (read), receipt PDFs |
| `payments.manage` | Record payments, confirm claims and refund | Payments, a payment's page, Collection sheet, member page |
| `reports.finance` | Finance reports | Reports: Money, Cash in hand, Tax and receipts |
| `members.manage` | Add, edit, approve and renew members | Add a member, Import members, member page, grouping values, smart groups, reminders |
| `cards.manage` | Issue, reissue and revoke member cards | Member page, bulk card downloads |
| `certificates.issue` | Issue, email, download and revoke certificates | Certificates, member page |
| `audit.view` | Read the activity log | Activity, Reports: Team activity |
| `erasure.decide` | Decide requests to erase personal data | Member page |
| `team.manage` | Invite staff and change their roles | Team |
| `plans.manage` ◆ | Create and change membership plans | Membership plans, New plan, plan page |
| `payments.settings` ◆ | Change payment gateways and tax settings | Settings, Payments and tax |
| `org.settings` ◆ | Change the profile, public page, email and notifications | Settings: Profile, Money and year, Email, Notifications, Messaging, Public page |
| `structure.manage` ◆ | Change units, levels and member roles | Settings, Units and roles |
| `cards.design` ◆ | Draft card designs, including an area's own | Settings, Cards |
| `certificates.design` ◆ | Draft certificate designs | Certificates |
| `accounts.manage` ◆ | Record other receipts and expenses | Accounts |
| `reports.gstr1` ● | GSTR-1 export | Reports, Tax and receipts |
| `roles.manage` ◆ | Create and edit staff roles | Settings, Staff roles |
| `groupings.manage` ● | Create and change groupings and their values | Settings, Groupings |
| `cards.approve` ★ | Approve card designs | Settings, Cards |
| `certificates.approve` ★ | Approve certificate designs | Certificates |
| `org.delete` ★ | Delete the organisation | Settings, Profile |
| `ownership.transfer` ★ | Transfer ownership | Team |

◆ means staff limited to a unit or grouping can read the screen but not change it. ● means it is refused to them entirely. See [Limited staff](limited-staff.md).

## Building your team

On **Team** (`/dashboard/<slug>/team`), invite people with a single-use link carrying a role and, if you like, a unit or grouping limit. They accept at `/join/org/<token>`.

Four starter roles come ready:

| Role | For | Holds |
| --- | --- | --- |
| Owner | You | Everything |
| Manager | Running memberships day to day | Every permission except the three Owner-only ones and `roles.manage` |
| Treasurer | Money | Payments, receipts, accounts and finance reports, and reads members |
| Viewer | Reading only | `org.view`, `members.view` and `reports.membership`; contact details hidden |

You can edit or archive every starter role except Owner, and create your own under **Settings, Staff roles**. Two templates, Area head and Unit secretary, fill the form as a starting point. See the [Managers manual](managers.md) and the [Treasurers manual](treasurers.md).

> **Tip:** As Owner you can give any role except Owner. Anyone else with `team.manage` can only give roles that grant strictly less than their own.

## When the organisation is not active

Before approval, only the application page opens. While suspended or archived, the team keeps only `org.view`, `members.view`, `payments.view`, `payments.manage`, `reports.finance`, `members.export`, `erasure.decide`, `accounts.manage` and `reports.gstr1`, so money already received can still be confirmed, refunded and receipted, and erasure requests decided.

## Related

- [Quickstart for organisation owners](../guides/start/quickstart-owner.md)
- [Staff and roles](../features/staff-and-roles.md), [Organisations](../features/organisations.md), [Member cards](../features/member-cards.md), [Certificates](../features/certificates.md)
