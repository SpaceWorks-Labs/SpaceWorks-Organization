# Reports and analytics

Understand membership and money, with every figure counted the same way each time.

## What it does

- Organisation reports have tabs for overview, units, members, renewals, applications, money, tax and receipts, and team activity.
- Filters cover period, plan and unit.
- The units tab compares the units one level below with drill-down.
- Reports export as CSV, and the overview prints as a PDF snapshot.
- Platform analytics for the super admin compare organisations and show trends. They contain counts and totals only, never a member's name, email or phone.
- All figures are counted in house from the application's own data. No outside provider is involved.
- Web visits (Reports, Web visits) shows views of the organisation's public pages by day and by page, with a CSV. Visits are counted by Space Works itself without cookies or personal details. The platform overview shows platform and per-organisation totals.

## Who can use it

- Membership reports need `reports.membership`. Money and tax need `reports.finance`. Team activity needs `audit.view`.
- Platform analytics are for the super admin only.
- Web visits needs `reports.membership` and is open to staff limited to a unit, because it is public-page information rather than member data.

## Turning it on or off

Reports are always on. Staff limited to a unit see only their own units.

## Screenshots

![Reports and analytics in the light theme](/screens/reports-and-analytics-light.webp)

![Reports and analytics in the dark theme](/screens/reports-and-analytics-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
