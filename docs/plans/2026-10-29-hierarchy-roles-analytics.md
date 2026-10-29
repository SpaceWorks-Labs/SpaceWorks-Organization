# Hierarchy, roles, cards and analytics

Status: **v5, approved by Claude plan review (three rounds); owner decisions recorded 2026-10-29; awaiting the owner's go-ahead**. Builds on
`2026-10-19-membership-rebuild.md` ("Organisation units").

## Goal

One uniform model that every organisation configures for itself. **Nothing is fixed per organisation: the
organisation's owner chooses the levels, the units, the roles, what each role can access, and the card each role
carries.** Templates are optional starting points that the owner edits or skips. A generic example:

```
Example organisation     ── owner, org-wide staff
 ├─ Area: North              ── area head (sees only this area)
 │   ├─ Unit: North 1          ── unit secretary (sees only this unit, collects fees offline)
 │   └─ Unit: North 2
 └─ Area: South
     └─ Unit: South 1
```

- Each organisation names its own levels, up to four: `Area → Unit`, `State → District → Chapter`, `Branch`, or none.
- Each organisation defines its own staff roles from one fixed list of permissions, as org-wide or tied to a unit.
- Fees can be fully offline and are collected by unit staff.
- ID cards show the hierarchy and the holder's role, and the owner designs and approves each role's card.
- The super admin can enter any organisation, and sees analytics per organisation and for the platform.

## What exists today (verified 2026-10-29)

| Area | Built | Missing |
|---|---|---|
| Hierarchy | `OrgUnit` tree, up to 4 named levels, Settings → Units and roles, unit picker on join, unit-scoped staff (`TeamMember.unitId`) through `lib/membership/scope.ts`, units directory section, unit filter and per-unit table in reports, `OrgDailyStats.unitId` | Moving a unit, unit codes, setup templates, a unit preset on the join link, subtree matching for `PlanUnit`, tests for structure actions |
| Scope leaks | Members, payments, cards, exports and reports are scoped | Plan term counts, plan invite list, tax series checks, `MemberRole.unitId` not enforced, re-submitting the join form overwrites a member's unit |
| Staff roles | Fixed `TeamRole` enum and `CAPABILITIES` map, about 80 source files and 13 test files depend on them, `ORG_WIDE_ONLY` checks inline in ~15 actions | Custom roles, invites with a unit, ownership transfer, `managerLimit` enforcement. **Bug:** a unit-scoped manager can change or remove staff anywhere, and can invite someone who gets org-wide reach |
| Offline fees | No gateway needed (`provider = NONE`): cash, UPI, bank, cheque, card machine, maker-checker, UTR claims, waivers, GST receipts, offline refunds; `Payment.recordedById` | Collection by unit staff (fixed roles), unit payment instructions, recording many members at once, cash-in-hand view |
| Cards | Designs per role and per plan, owner approves drafts, patterns `{PREFIX} {SEQ} {MEMBER} {YYYY}` | Area or unit on the card, unit code in numbers, cards for office holders |
| Super admin | Org lifecycle, platform reports A1–A8 (cross-org totals), users, audit, operations | Cannot enter an organisation, no analytics per organisation, no payments split by organisation, no comparison table, no exports |
| Org analytics | Report tabs B1–B12 with a unit filter, a per-unit table, exports, a monthly digest | Charts on the dashboard home, drill-down by level, expired stock in the rollup |

## Owner decisions (2026-10-29)

1. **Staff roles:** custom roles per organisation, built from the fixed permission list. Today's four roles become editable
   starter roles, and Owner stays fixed.
2. **Super-admin access:** permanent, full owner-level access to every organisation. There is no session, reason or
   time limit. Kept: an audit of every action, and an authenticator (the same rule as all dashboard staff).
3. **Super-admin analytics:** totals per organisation (counts and revenue per currency, no names) are always visible.
4. **ID cards:** each organisation has its own card (its default design). The owner custom-designs and approves cards for
   the roles they choose. Staff roles do not hand out cards automatically (deferred).
5. **Card numbers:** the owner can put unit codes (`{UNIT}`, `{U1}`…`{U4}`) in a pattern, and `{SEQ}` stays one gapless
   series per design.

## Phase H1: hierarchy, uniform and complete

- **Setup templates** on Settings → Units and roles: `Area → Unit`, `State → District → Chapter`, `Branch`, `None`.
  A template only fills `unitLevels`, and the names stay editable.
- **Unit code:** `OrgUnit.code` is 1 to 6 characters of `A–Z0–9`, unique per organisation and editable. The migration
  fills it from the slug: alphanumerics, upper-cased. On a clash, the base is shortened so the digit suffix still fits
  in 6 characters.
- **Organisation structure lock:** `createUnit`, `moveUnit`, `setUnitArchived` and `setUnitLevels` take
  `SELECT … FOR UPDATE` on the Organisation row first, so paths can't go stale under concurrent edits.
- **Move a unit** (`moveUnit`) to another parent at the same level as its current parent. Only `path` changes, for the
  unit and its subtree, in one transaction. It refuses cycles and archived parents. No rollup rebuild is needed:
  rows are keyed by the member's own unit and expanded when read.
- **Archive:** the confirmation shows the number of members in the subtree, and restoring a unit is refused while its parent is archived.
- **Join link with a unit:** `?unit=CODE` on the existing join route preselects and locks the unit. Links are shown on the unit page.
- **`PlanUnit` matches the subtree:** a plan limited to an area admits members of that area's units.
- **Fix scope leaks:** scope the plan term counts and the plan invite list; hide the tax series checks from scoped
  viewers; `assignMemberRoles` refuses a role whose `unitId` is outside the member's subtree; re-submitting the join
  form keeps the existing unit.
- **Unit page** `settings/structure/[unitId]`: path, code, member count, staff scoped to it, join links.
- Tests: integration tests for create, move (including concurrent create), levels, archive and restore, and each leak fix.

## Phase H2: custom staff roles (expand now, contract later)

**Final permission list** (`lib/permissionRoles.ts`). Marked org-wide to change (◆), org-wide for any use (●) or
owner-only (★). New ones are marked "new".

| Permission | Covers today's call sites | Starter roles |
|---|---|---|
| org.view, members.view, reports.membership | as now | all |
| members.contact, members.export, payments.view, payments.manage, reports.finance | as now | Owner, Manager, Treasurer |
| members.manage, cards.manage, audit.view, erasure.decide, team.manage | as now | Owner, Manager |
| plans.manage ◆, payments.settings ◆ | as now plus inline checks | Owner, Manager |
| org.settings ◆ | public page, email, notifications, member portal, chat channels | Owner, Manager |
| structure.manage ◆ (new) | `structure.ts` (levels, units, member roles), was org.settings | Owner, Manager |
| cards.design ◆ (new) | `card-design.ts` drafts, was org.settings | Owner, Manager |
| accounts.manage ◆ (new) | `accounts.ts` ledger, was payments.manage plus inline check | Owner, Manager, Treasurer |
| reports.gstr1 ● (new) | GSTR-1 route, was reports.finance plus inline check | Owner, Manager, Treasurer |
| roles.manage ◆ (new) | Settings → Roles | Owner |
| cards.approve ★, org.delete ★, ownership.transfer ★ (new) | as now | Owner |

`org.settings` also covers `org.ts` and `media.ts` (organisation name, description and logo), the dashboard `manager`
flag and `organisation-application.ts`.

**◆ means "org-wide to change".** A holder scoped to a unit keeps read-only access to those settings pages (today's
`canEdit: !unitId`), but every ◆ write is refused for them. **● means "org-wide for any use"**: `reports.gstr1` is
refused to scoped holders even for reading, as the GSTR-1 route does today. The accounts page keeps its scoped
short-circuit (scoped viewers see an empty statement, as today), and that view is listed in the call-site inventory.

The starter roles reproduce today's behaviour. A test asserts it for every permission, for both scoped and org-wide holders,
except for these **intended changes**, which the test lists:

- A scoped holder of `team.manage` is limited to their own subtree (the bug fix).
- A scoped Manager can no longer edit the organisation's name, description or logo (`org.ts` and `media.ts`, a leak fix).

After that, the owner decides: for example, they can remove `structure.manage` from Manager.

- **Model.** `OrgRole { id, organisationId, name, description, capabilities String[], cardRoleId?, isOwner Boolean,
  sortOrder, archivedAt }`, unique on `(organisationId, name)`. **Scope belongs to the grant, not the role:**
  `TeamMember.unitId` and `TeamInvite.unitId`, as today. The same role can be held org-wide or at a unit, and the UI
  labels a scoped grant with the unit's level name (for example "Area head · South").
- **Expand and contract.** This release adds `TeamMember.roleId`, `TeamInvite.roleId` and `TeamInvite.unitId` (composite
  FKs) and backfills the starter roles. It writes both `role` and `roleId` on `TeamMember` and `TeamInvite`. For a custom
  role, `role` is the largest starter role whose permissions are a subset of the custom role's, with VIEWER as the floor,
  so a rollback never widens access. (VIEWER can still exceed a very narrow custom role after a rollback; this is
  documented.) The next release drops `TeamMember.role`, `TeamInvite.role` and `enum TeamRole`, once
  `update.sh --rollback` no longer needs them.
- **One check point:** `can(actor, capability, { write })` takes the actor's role permissions and scope, and itself
  refuses ◆ writes and any ● use for scoped actors. Every caller moves to it, including the ten that call `getMembership` directly (`team.ts`,
  `org-invites.ts`, the members, GSTR-1, cards and reports export routes, the documents route, `lib/cards/access.ts`)
  and the views that gate on `!membership.unitId`. `requireOrgRole` and `hasRoleAtLeast` are replaced by permission checks.
- **Recipients by permission:** refund, erasure, digest and organisation emails (`lib/email/refunds.ts`,
  `lib/email/erasure.ts`, `lib/reports/digest.ts`, `lib/organisations.ts`) pick staff by permission, not by enum.
- **Granting rules:** a person grants only roles whose permissions are a subset of their own *effective* permissions
  (without ◆ and ● when they are scoped), at units inside their own
  subtree, and changes or removes only staff inside it who hold such roles. Nobody changes their own role.
  These are re-checked when an invite is accepted (the inviter still has the right, and the role and unit are not archived).
- **Role edit rules:** the Owner role can't be edited, archived or granted by invite; ownership moves only by transfer
  or the super admin's owner invite, and the last-owner guard stays. A role that someone holds or a pending invite uses
  can't be archived. Editing a held role's permissions shows the holders and is audited.
- **Settings → Roles:** create, edit, archive and reorder roles; one-click templates (for example Area head, Unit secretary).
- **Ownership transfer:** the owner names another org-wide staff member, who confirms. Done in one transaction under
  the existing owner lock, and both are emailed.
- **`managerLimit`** is enforced when an invite is accepted, under the organisation row lock.
- **Audit:** role created, edited (with the permission changes) and archived; role changes record old and new; `updateMemberRole` is audited.
- **Call-site inventory** (to convert): the 80 source files from `grep -rlE 'TeamRole|hasRoleAtLeast|requireOrgRole|
  roleRank|canManageTeamMember|"(OWNER|ADMIN|TREASURER|VIEWER)"|ORG_WIDE_ONLY|membership\.unitId|can\(membership'
  app lib components scripts` and 13 test files. The list is pinned in the phase's first commit and goes to zero by the end.
- Tests: the full permission map against today's behaviour, granting rules, the ◆, ● and ★ refusals, invite re-checks, role
  edit rules, migration backfill, transfer.

## Phase H3: fully offline fees through the hierarchy

An organisation with no gateway is already offline-only (`provider = NONE`), so no new switch is needed.

- **Instructions per unit:** `OrgUnit.paymentInstructions` (whom to pay, when, the UPI ID). A unit without its own uses
  the nearest ancestor's, then `offlineInstructions`. Shown on the join confirmation, pay link, reminders and portal.
  Wording reads "Pay your fee to your unit" when no gateway is connected.
- **Unit staff collect:** a scoped role with `payments.manage` (for example Unit secretary) records payments for members in
  its subtree (through H2 and the existing `scopedTerm`).
- **Collection sheet:** pick several members of a unit and record method, date and the paper receipt-book number
  (`reference`). **One transaction per member** through `recordOfflinePayment`, so the `payment → term → counter` lock
  order holds and receipting elsewhere isn't blocked. Results are shown per row (recorded, already paid, failed). With
  "A second person confirms" on, rows wait for confirmation and get receipt numbers only when confirmed.
- **Cash in hand:** a report per collector (`recordedById`) and per unit showing offline money recorded by staff,
  excluding member UTR claims and net of offline refunds, by currency, with the date of the oldest payment. Scoped
  viewers see their subtree.
- **Later (not in this plan):** formal hand-over and acceptance of cash between levels.
- Tests: instructions fallback, collection-sheet scope and per-row failure, maker-checker interaction, cash-in-hand sums.

## Phase H4: ID cards for the hierarchy and roles

- **Card data:** the member's unit chain by level name (`Area: North`, `Unit: North 1`) and the unit
  code become text bindings in the designer, drawn through the fontkit outline path (never `drawText`).
- **Number tokens:** `{UNIT}` is the member's own unit code. `{U1}`…`{U4}` are the codes of their units at the first to
  fourth level, counting from the top (`{U1}` is `OrgUnit.level` 0). Each
  adds at most 6 characters to `longestNumber`. A missing unit or level prints `NA`. `{SEQ}` stays one series per
  design. A number belongs to its membership, so moving a member never renumbers or reissues.
- **The organisation's card:** each organisation has its own default design (exists today). Two starter templates
  (portrait and landscape CR80) with photo, name, role, area and unit, plan, validity, number and QR. The owner picks one
  and adjusts it, and it goes through the existing draft and approval flow.
- **Custom role cards:** the owner chooses which member roles (for example Area head, Unit secretary, Life member) get
  their own design and number pattern; every other member uses the organisation's card. Only the owner approves
  (`cards.approve`). Settings → Cards lists every role with whether it has its own design, its status and its live card count.
- Tests: PNG and PDF parity with the new bindings, number token validation and length.

## Phase H5: super-admin full access to every organisation

- **Always on:** a super admin opens any organisation's dashboard from the super-admin console (the "Organisation
  dashboard" link on `super-admin/orgs/[orgId]` starts working) and acts there with the organisation's full Owner
  permissions, including ★. There is no session, reason or time limit.
- **One place:** `can()` and the guards (`requireOrgTeam`, `requireOrgCapability`, `orgActionAccess`, the export and
  document routes) treat a verified super admin (`requireSuperAdmin` rules) as an org-wide Owner actor with
  `superAdmin: true` and no `TeamMember.id`. Code that needs one, such as report digests and the dashboard view, treats it as absent.
  Super admins are not added to the team list, team counts or `managerLimit`.
- **Kept safeguards** (the owner can drop them):
  - An authenticator is required before an organisation's dashboard opens, as for all staff.
  - Every action writes an audit row marked "Platform super admin". The organisation's audit page shows these rows
    alongside the team's.
  - A slim banner reads "You're in this organisation as platform super admin".
  - Money stays under the existing triggers (paid rows are never edited or deleted).
- `docs/SECURITY.md` and `CLAUDE.md` are updated: super admins have full access to every organisation.
- Tests: a super admin passes every guard in any organisation; a non-super-admin still gets 404; audit rows are
  written and visible to the owner; the authenticator is required.

## Phase H6: analytics per organisation

- **Rollup:** add `expired` stock to `OrgDailyStats` (same dirty-day pass, plus a backfill job in the scheduler).
  Revenue is read from `lib/reports/finance/source.ts` grouped by month and currency, with no new table until it is measured slow.
  Currencies are never added together.
- **Dashboard home:** charts for active members (12 months), joins against lapses, renewals due in the next 30 days,
  collection by month per currency, and outstanding.
- **Drill-down by level:** a league table per level (all Areas, then the units of one Area) with active members, growth,
  renewal rate, collected and outstanding. Clicking a row filters to that subtree. Scoped staff see their own subtree.
- Tests: rollup maths (pure), backfill idempotency, drill-down scoping.

## Phase H7: platform analytics (super admin)

- **Organisation analytics page** `super-admin/orgs/[orgId]/analytics`: aggregates only, with no member names or contact
  details. It shows the member trend, renewal rate, revenue per currency, the breakdown by level and limits used. Each view is audited.
- **Comparison table** `super-admin/analytics`: every organisation, sortable by active members, 30- and 90-day growth, renewal
  rate, revenue per currency, outstanding, last staff sign-in, last payment, limits used, and a dormant flag (no
  sign-in or payment for 60 days).
- **Platform trends:** total active members, new organisations and the applications funnel, revenue per currency per month, and
  payment, webhook and outbox failures by organisation.
- **Exports:** CSV for each platform report, audited.
- Tests: pure aggregation over fixture rows, and that no member-identifying fields reach these pages.

## Phase H8: sheet onboarding, unit verification and card email (added 2026-10-29)

Already built: CSV and public Google Sheet import (name, email, phone, state, unit, role and plan fields; 2,000 rows),
scoped approval through `decideMemberships`, `issueCardOnActivation`, and a manual "Email card" action (PDF rendered
when sent).

- **Import as "waiting for verification":** a new import option, "Send to the unit's lead to verify". Terms are opened
  as `PENDING_APPROVAL` even though a manager imported them (`openTerm` gets `byManager` plus `needsVerification`).
  Rows report unknown units and roles instead of skipping them silently, and preview validates every row before commit.
- **Unit lead queue:** scoped staff with `members.manage` see the members waiting in their subtree (the existing approvals
  filter and the B10 queue, already scoped), and verify or reject them, one by one or in bulk.
- **Lead alert:** when a batch lands in a unit, staff scoped to that unit or an ancestor (with `members.manage`) get one
  email summarising how many are waiting, through the outbox.
- **On verification:** the membership activates (`activateTerm`), the card is issued, and **the card email goes out
  automatically**, with the PDF rendered when sent. Nothing is stored.
- **Organisation email templates:** `OrgEmailTemplate { organisationId, kind, subject, heading, body }` for member-facing
  emails, starting with the card email and the activation notice. The body is plain text with placeholders (`{name}`,
  `{organisation}`, `{plan}`, `{unit}`, `{cardNumber}`, `{validUntil}`), rendered as escaped paragraphs through
  `sendBrandedEmail`, never as HTML. Settings → Email has an editor with a preview and "Send me a test". An organisation
  without a template uses today's copy.
- Tests: import into pending and refusal outside scope, alert recipients by subtree, verification sends exactly one card
  email, template placeholder rendering and escaping, fallback copy.

## Phase H9: cards fully dynamic, member photos per member (added 2026-10-29)

- **No stored cards:** bulk exports stop being stored. "Download cards" streams the ZIP from the route, one PDF per card
  rendered as it is written (`BULK_ZIP_LIMIT` 300); the combined PDF is rendered in the request (`BULK_PDF_LIMIT`
  1000) under the existing one-at-a-time render slot. `CardExportJob` stops being written in this release, existing stored
  files are deleted by the scheduler, and the table is dropped in the next release. Single cards, wallet, `/verify` and
  emails are already drawn on demand.
- **Member photos per member:** key `organisations/<orgId>/members/<memberId>/photo-<uuid>.webp` in the same
  S3-compatible bucket: Silo (MinIO) on a VPS, Cloudflare R2 in the cloud. `S3_ENDPOINT` and `S3_FORCE_PATH_STYLE=1`
  cover both, as documented. Existing photos are copied to the new layout by a one-off scheduler pass. Members can upload
  their own photo from the portal when the organisation allows it (`Organisation.memberPhotoUpload`), and managers still
  can. Erasure deletes the member's whole photo prefix.
- **One S3 client:** `lib/storage/index.ts` and `lib/storage/private.ts` share one client factory.
- Tests: streamed ZIP contents match the single-card render, the limits, photo key layout, migration pass idempotency,
  erasure prefix delete.

## Phase H10: clean-up (added 2026-10-29)

- Remove dead code left over from the old app: unused exports, files, components, scripts and dependencies (found with
  `knip` run through `npx`, not added to the project), stale docs, and any old product name in code, docs and copy.
- Every removal is checked against the frontend registry, the scripts and the Docker entrypoints. Lint, typecheck,
  build and all tests stay green.

## Deferred

Bulk unit import from CSV, formal cash hand-over, automatic cards for staff role holders (office holders), an A6 badge
template, an instance-wide default for `managerLimit`, and a revenue rollup table.

## Risks

- **H2 touches about 80 files and every permission check.** Mitigation: the starter roles must pass a behaviour-equivalence test before any
  call site changes; expand and contract keeps rollback safe; the call-site list must reach zero.
- **Super admins hold full access to every organisation (owner decision).** A compromised super-admin account
  reaches all tenants' data and settings. Mitigation: an authenticator is required, and every action is audited where the owner sees it.
- **Concurrent structure edits.** Mitigation: the organisation row lock in every structure action.
- **Expired-stock backfill on large organisations.** Mitigation: chunked per organisation in `runOutboxScheduler`.
- **300-line file rule.** New pages and actions are split by responsibility from the start.

## Order and gates

H1 → H2 → H3 → H4 → H5 → H6 → H7 → H8 → H9 → H10. H3, H4, H5 and H8 need H2's roles and guards. Each phase also
passes `npm run build`.
Each phase: lint, typecheck, unit and integration tests, a Claude review gate, owner QA, then one commit.
