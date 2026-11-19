# Organisations

Each organisation is its own tenant, with its own members, plans, team and settings.

## What it does

- Every organisation is separate. Its members, money and settings are never visible to another organisation.
- A person can sign up an organisation, and the platform super admin reviews it before it goes live. The super admin can also create one directly.
- An organisation can be public or unlisted. Public organisations appear in the directory at `/organisations` and take applications from anyone. Unlisted ones are reached only by their link.
- The super admin can set limits on members and team size for each organisation.

## Who can use it

- Anyone with an account can apply to create an organisation.
- The platform super admin approves, declines or creates organisations.
- Inside an organisation, settings need the `org.settings` permission. Deleting an organisation and transferring ownership belong to the Owner alone.

## Turning it on or off

- The super admin can switch new account sign-ups on or off for the whole platform.
- Each organisation chooses whether it is listed in the public directory.

## Screenshots

![Organisations in the light theme](/screens/organisations-light.webp)

![Organisations in the dark theme](/screens/organisations-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
