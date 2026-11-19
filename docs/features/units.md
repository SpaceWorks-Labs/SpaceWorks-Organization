# Units

Units let an organisation mirror how it is really arranged, such as areas and branches.

## What it does

- The organisation names its own levels, up to four, for example "Area" then "Unit". Nothing is fixed by the product.
- It builds a tree of units. Each unit has a short code of 1 to 6 letters or digits, unique inside the organisation.
- The code is used in join links (`?unit=CODE`) so people join the right unit, and in card numbers.
- A unit can move only to a parent on the same level. Its subtree moves with it. Levels and card numbers never change.
- Plans can be limited to some units, and a limited plan is also offered to everything below those units.

## Who can use it

- Building and changing the unit tree needs the `structure.manage` permission.
- Staff given a role for one unit see and act only inside that unit and the units below it. They can read, but not change, organisation-wide screens.

## Turning it on or off

Units are optional. An organisation that does not add any simply has no unit level. Names and levels are set under Settings, in the structure section.

## Screenshots

![Units in the light theme](/screens/units-light.webp)

![Units in the dark theme](/screens/units-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
