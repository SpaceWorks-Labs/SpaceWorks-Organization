# Plans and join forms

Plans describe what people can join, and join forms collect what you need to know.

## What it does

- A plan has a name, a fee, a period and optional joining and rejoining fees.
- A plan can need approval. Applications then wait in a queue until staff approve or decline them.
- A plan can be limited to chosen units.
- Join forms are built from questions on each plan: built-in fields, custom questions, choose-several answers, sections and conditional questions that appear only when an earlier answer calls for them.
- A plan can ask for a photo when someone joins.
- One answer is kept for each question, even when the person holds several plans.
- A public join page and unit join links (`?unit=CODE`) bring people in.

## Who can use it

- Creating and editing plans and join forms needs `plans.manage`.
- Approving and managing members needs `members.manage`. Staff limited to a unit can approve only inside that unit.

## Turning it on or off

A plan can be set to accept applications or not, and to need approval or not. Each question is shown or hidden on the plan it belongs to.

## Screenshots

![Plans and join forms in the light theme](/screens/plans-and-join-forms-light.webp)

![Plans and join forms in the dark theme](/screens/plans-and-join-forms-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
