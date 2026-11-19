# Staff and roles

Run the organisation with a team, each person holding only the permissions they need.

## What it does

- Each organisation defines its own roles from a fixed list of permissions, for example `members.view`, `payments.manage`, `reports.finance` and `cards.design`.
- Four starter roles come ready: Owner, Manager, Treasurer and Viewer. The Owner holds every permission and cannot be edited or given by invite.
- A role can be held for the whole organisation or for one unit.
- People join the team by a single-use invite link that carries a role and, optionally, a unit.
- You can give someone only a role that grants strictly less than you hold, inside your own reach.
- Every member of staff must set up an authenticator app before the dashboard opens.
- A platform super admin with an authenticator can act in any organisation as its owner. This is never shown as a team seat and is recorded in the audit log.

## Who can use it

- Managing the team needs `team.manage`. Creating and editing roles needs `roles.manage`.
- Transferring ownership is the Owner's alone.

## Turning it on or off

Roles and the team are always on. Members never need an authenticator, only staff do.

## Screenshots

![Staff and roles in the light theme](/screens/staff-and-roles-light.webp)

![Staff and roles in the dark theme](/screens/staff-and-roles-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
