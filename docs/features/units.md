# Units

Units mirror how an organisation is really arranged, such as areas, districts and branches, with levels and names it chooses itself.

## What it does

- The organisation names its own levels, top first, up to four of them, for example "Area" then "Unit". Nothing about the levels or their names is fixed by the product.
- It builds a tree of units under those levels. A member belongs to one unit.
- Each unit has a code of 1 to 6 capital letters or digits, unique in the organisation. Left empty, the code is made from the unit's name (North Zone becomes NORTHZ, or NORTH2 if that is taken).
- Join links carry the code (`/o/<slug>/join/<plan>?unit=CODE`), so people join the right unit without choosing it.
- Card number patterns can print unit codes: `{UNIT}` for the member's own unit, or `{U1}` to `{U4}` for the unit at each level. A member with no unit at that level prints NA.
- A plan can be limited to some units. It is then offered in those units and everything below them.
- Each unit can have its own payment instructions for offline payments. A unit without its own uses the nearest unit above it, then the organisation's.
- Staff can be limited to one unit, and then see and act only inside that unit and the units below it.

### Rules that keep history safe

- A unit moves only to another parent on the same level as its current one, taking everything under it. Levels never change, members keep their unit, and reports follow the new place.
- Card numbers never change when a unit moves or its code changes: unit codes are read once, when the number is made.
- Archiving a unit archives everything under it. Members keep their unit for history, but new members can't join an archived unit and its join links stop.
- Restoring a unit needs the unit above it restored first.
- A level can't be removed while units sit at that depth. Archive them first.
- An organisation can have up to 2,000 units.

### Name your levels

1. Open **Settings**, **Units and roles** (`/dashboard/<slug>/settings/structure`).
2. Under **Levels**, start from a template (**Area and unit**; **State, district and chapter**; **Branches only**) or type your own names. Use **Add a level** for up to four.
3. Select **Save levels**.

### Add a unit

1. Under **Units**, select the add button, which carries your top level's name (for example **Add a region** when the top level is Region).
2. Type a name of 2 to 80 characters and, if you want, a code. Select **Add**.
3. To add a unit underneath, use the button with the next level's name on its row.

Each row shows the level, the code and how many members it has. The pencil button renames a unit or changes its code; the archive button archives it and everything under it.

### Use the unit page

Select a unit's name to open its page (`/dashboard/<slug>/settings/structure/<unitId>`). It shows:

- **Join links**, one for each open plan offered in the unit, ready to copy.
- **Team**: staff whose reach includes this unit.
- **Payments**: the unit's own offline payment instructions, up to 1,000 characters, or the ones it inherits.
- The units on the next level down.
- **Move**, for any unit below the top level: choose a new parent on the same level.
- A link to view members in this unit.

### Member roles

The same page holds **Member roles**, such as Secretary or Systems Engineer. A member's main role prints on their card, and a role can be offered **Only in unit**. Member roles are not staff roles; see [staff and roles](staff-and-roles.md) for those.

## Who can use it

- Building and changing the tree, levels, codes, member roles and unit payment instructions needs `structure.manage` ◆ (`ORG_WIDE_TO_CHANGE`). Staff who hold it for one unit can open **Units and roles** and the unit pages, but they are read-only.
- Limiting staff to a unit is done from the **Team** page with `team.manage`: an invite's **Where** field limits the new member of staff to one unit and everything under it.
- Staff limited to a unit see and act only inside that unit and the units below it, in every list, count, payment, card, report and export. They can read, but never change, organisation-wide settings, and organisation-wide-only permissions (● `ORG_WIDE_ONLY`, such as `reports.gstr1` and `groupings.manage`) are refused to them.

## Turning it on or off

Units are optional. An organisation with no levels and no units simply has no unit level, and its screens leave units out. To start, name at least one level under **Settings**, **Units and roles**, **Levels**. To stop using a unit, archive it rather than deleting it; units are never deleted.

## Screenshots

![Units in the light theme](/screens/units-light.webp)

![Units in the dark theme](/screens/units-dark.webp)

## API

There is no public REST API yet. Unit changes are server actions inside the app, and each one is written to the audit log (`UNIT_CREATED`, `UNIT_MOVED`, `UNIT_ARCHIVED` and others). The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization), with the unit actions in [app/actions/units.ts](../../app/actions/units.ts).

## Related

- [Groupings](groupings.md) divide members in other ways and combine with unit limits.
- [Plans and join forms](plans-and-join-forms.md) for limiting a plan to units.
- [Member cards](member-cards.md) for card number patterns.
- [Payments](payments.md) for unit payment instructions and the collection sheet.
- [Limited staff manual](../manuals/limited-staff.md) and [owners' manual](../manuals/owners.md).
- [Audit actions](/docs/audit-actions).
