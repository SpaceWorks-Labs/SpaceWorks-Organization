# Glossary

Plain definitions of the words Space Works Organization uses on its screens and in these docs, from organisation to outbox.

## Organisations and structure

| Word | Meaning |
| --- | --- |
| Organisation | One tenant on the platform, with its own members, plans, team, money and settings. Nothing is shared between organisations. |
| Organisation status | Where an organisation stands with the platform: `PENDING_REVIEW`, `CHANGES_REQUESTED`, `ACTIVE`, `REJECTED`, `SUSPENDED` or `ARCHIVED`. Only `ACTIVE` opens everything. |
| Public directory | The list of public organisations at `/organisations`. An unlisted organisation is reached only by its link. |
| Public page | An organisation's own page at `/o/<slug>`, with its plans and content. |
| Unit | A part of the organisation, such as an area or a branch. Units form a tree. |
| Unit level | A named layer of the unit tree, for example Area then Unit. Each organisation names up to four. |
| Unit code | A short code of 1 to 6 letters or digits, unique in the organisation, used in join links (`?unit=CODE`) and card numbers. |
| Grouping | A way to divide members beyond units, such as profession or region. Its values can be a list or a tree. |
| Grouping value | One entry in a grouping, for example Doctors. A member can hold one or several, as the grouping allows. |
| Smart group | A saved set of conditions over members, worked out when you look. It filters lists, exports and card downloads. |
| Member role | A title an organisation gives members, such as Secretary, printed on cards. It is not a staff role. |

## Plans and memberships

| Word | Meaning |
| --- | --- |
| Plan | Something people can join, with a price, a length, a join mode and a payment mode. |
| Join mode | How people join a plan: Open to all, Apply and approve, Invite only or Closed. |
| Payment mode | How a plan is paid: Free, Paid online or in hand, or Paid in hand only. |
| Join form | The questions a plan asks. Answers are kept once per question for each member, across plans. |
| Member invite | An invitation to join a plan, for one email address or as a shared link with a number of uses. |
| Member | One person in one organisation, found in the member portal by their verified email. |
| Term | One membership period of one member on one plan. A renewal is a new term. |
| Grace | Days after a term ends when the member can still renew before the membership lapses. |
| Joining fee | An extra charge on a new term. The plan decides whether it applies again when someone rejoins. |
| Renewal window | How many days before a term ends that renewal opens. |

### Term statuses

| Status | Shown as | Meaning |
| --- | --- | --- |
| `PENDING_APPROVAL` | Waiting for approval | An application waiting for staff to decide. |
| `PENDING_PAYMENT` | Waiting for payment | Approved, not yet paid. |
| `UPCOMING` | Starts soon | Paid, but the start date is still ahead, for example an early renewal. |
| `ACTIVE` | Active | The membership is running. |
| `GRACE` | In grace | The term has ended and the member can still renew. |
| `ENDED` | Renewed | The term ended and a paid renewal followed it. |
| `LAPSED` | Lapsed | The term and any grace ended without a renewal. |
| `EXPIRED` | Payment expired | The payment window closed before it was paid. |
| `CANCELLED` | Cancelled | Called off before or instead of running, for example a withdrawn application. |
| `REJECTED` | Declined | Staff declined the application. |
| `REVOKED` | Revoked | Staff ended a paid membership. It can be reinstated. |

## Money

| Word | Meaning |
| --- | --- |
| Paise | Money is stored as whole paise (the smallest unit of the currency), never fractions. |
| Gateway | The one online payment service an organisation uses: Razorpay or Stripe. Offline payment is always available. |
| "I've paid" claim | A member's statement that they paid offline, with a reference. It counts only once staff confirm it. |
| Collection sheet | A screen for recording offline payments for many members of a unit, one transaction each. |
| Pay link | A signed link, `/pay/<token>`, that opens one membership's payment without signing in. It lasts 30 days. |
| Receipt | The document for a paid payment: a GST receipt, tax invoice or simple receipt. |
| Financial year | April to March, in the organisation's time zone. Receipt numbers run without gaps within it. |
| Credit note | The document that reverses all or part of a paid payment. Paid payments are never edited or deleted. |
| Refund request | A member's request for money back under the organisation's refund policy. Staff approve or decline it. |
| Ledger entry | A receipt or expense outside membership fees, recorded in Accounts. It can be voided once and never deleted. |
| GSTR-1 | The Indian GST return tables, exported for the whole organisation. |

## Cards

| Word | Meaning |
| --- | --- |
| Card | A member's ID card, one live card per member and plan, drawn on demand as PDF or PNG. |
| Card design | The layout, colours and fonts of cards. Staff save drafts; only the Owner approves one. |
| Card number | A number built from the organisation's pattern and a running sequence. Renewals keep it. |
| Verify token | The random value in a card's QR code. Scanning it opens `/verify/<token>`, the card check. Reissuing a card replaces it. |

## People and access

| Word | Meaning |
| --- | --- |
| Staff | Anyone on an organisation's team. Every member of staff needs an authenticator app. |
| Owner | The staff role that holds every permission, including deleting the organisation and transferring ownership. |
| Staff role | A named set of permissions an organisation gives its staff. Four starter roles come ready: Owner, Manager, Treasurer and Viewer. |
| Permission | One thing a role allows, such as `members.view` or `payments.manage`. See the [Owners manual](../../manuals/owners.md). |
| Limited staff | Staff who hold their role for one unit or for grouping values, and see only members inside that reach. |
| Authenticator | An app that gives six-digit codes for two-step sign-in. |
| Super admin | The platform operator's account. Created only on the server and able to act in any organisation as its owner, with every action audited. |
| Member portal | The member's own pages at `/account`. The organisation can switch member accounts off. |
| Erasure | Anonymising a person's details on request. Money records are kept. |

## Behind the scenes

| Word | Meaning |
| --- | --- |
| Outbox | A database table of messages and jobs written with the change that caused them, then delivered by the background worker. |
| Worker and beat | The background processes: the worker delivers the outbox and runs scheduled jobs; the beat schedules them. |
| Audit log | The record of who did what. Organisations see theirs under Activity; the platform under Super admin, Audit log. |

See also the [Audit actions](/docs/audit-actions) and [Environment variables](/docs/environment-variables) references.
