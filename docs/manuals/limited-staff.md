# Limited staff manual

For staff whose role is limited to a unit or to grouping values: what you see, what you can change and what stays organisation-wide.

## Who this is for

A staff role can be held for the whole organisation, or limited:

- **to a unit**: you reach that unit and every unit below it;
- **to grouping values**: you reach only members holding a value inside your limit, for example Doctors in a Profession grouping;
- **to both**: you reach only members who are inside your unit and inside every grouping limit.

Several values in one grouping widen your limit. Limits on different groupings, and the unit limit, narrow it together. A value in a tree covers everything under it.

Your role's name and permissions are whatever your organisation set: any role can be held limited, including the starter Manager, Treasurer and Viewer roles. Two role templates, Area head and Unit secretary, are designed for this. Like all staff, you need an authenticator app before the dashboard opens.

## What changes when you are limited

### Members and money stay inside your reach

Everything about members is filtered to your reach: the members list and counts, a member's page, payments, cards, reports, exports and card downloads.

- You can add or move members only into units inside your unit.
- You can give grouping values only inside your limit, and can't move a member out of it.
- On **Payments, Collection sheet** you pick a unit within your reach.
- Scanning a member's card shows their record only if they are inside your reach. Otherwise you see the same public check as anyone else.

### Organisation-wide permissions

Some permissions cover the whole organisation. Held limited, they work differently.

| Mark | Permission | What it means | Limited staff |
| --- | --- | --- | --- |
| ◆ | `plans.manage` | Create and change membership plans | Read only |
| ◆ | `payments.settings` | Change payment gateways and tax settings | Read only |
| ◆ | `org.settings` | Change the profile, public page, email and notifications | Read only |
| ◆ | `structure.manage` | Change units, levels and member roles | Read only |
| ◆ | `cards.design` | Draft card designs | Read only |
| ◆ | `certificates.design` | Draft certificate designs | Read only |
| ◆ | `accounts.manage` | Record other receipts and expenses | Read only |
| ◆ | `roles.manage` | Create and edit staff roles | Read only |
| ● | `reports.gstr1` | GSTR-1 export | Refused |
| ● | `groupings.manage` | Create and change groupings and their values | Refused |

If you try to change a ◆ screen, the app answers "Only staff for the whole organisation can change this." The **Accounts** page shows "Kept for the whole organisation", because the accounts cover every unit.

The Owner-only permissions (`cards.approve`, `certificates.approve`, `org.delete`, `ownership.transfer`) are never part of a limited role.

### Permissions that work inside your reach

These work as usual, applied to members inside your reach:

| Permission | What it means |
| --- | --- |
| `org.view` | Open the dashboard |
| `members.view` | See members |
| `reports.membership` | Membership reports |
| `members.contact` | See members' email addresses and phone numbers |
| `members.export` | Export member lists |
| `payments.view` | See payments and receipts |
| `payments.manage` | Record payments, confirm claims and refund |
| `reports.finance` | Finance reports |
| `members.manage` | Add, edit, approve and renew members |
| `cards.manage` | Issue, reissue and revoke member cards |
| `certificates.issue` | Issue, email, download and revoke certificates for members in your reach |
| `audit.view` | Read the activity log |
| `erasure.decide` | Decide requests to erase personal data |
| `team.manage` | Invite staff and change their roles |

### Certificates in your reach

With `certificates.issue` you can open **Certificates**, issue a certificate to members you can see, email it, download it and revoke it. Counts and the issued list cover only your members, a plan or smart group issues only to the members of it you can see, and a member outside your reach is refused as not found. Designs are read-only to you, and a design must be approved by the Owner before you can issue from it. See [Certificates](../features/certificates.md).

## Inviting and changing staff

With `team.manage` you can invite people from **Team**, with these limits:

- the role must grant strictly less than yours;
- you can't hand out a ◆ or ● permission you don't hold yourself;
- if you are limited to a unit, you can only give roles limited to a unit inside yours, never the whole organisation;
- if you are limited by a grouping, you can only give that grouping's values inside your limit, or part of them;
- you never change your own role.

Example: Abhiram NJ holds the Manager role for the Kochi unit of SpaceWorks. He can invite a viewer for Kochi or a unit under it, but not a viewer for the whole organisation.

## Finding your way

The navigation shows only the pages your role opens. If you follow a link to a page you can't use, the app takes you to the first page your role does open.

## Related

- [Units](../features/units.md) and [Groupings](../features/groupings.md)
- [Owners manual](owners.md) for the full permission list
- [Managers manual](managers.md), including the Viewer role
