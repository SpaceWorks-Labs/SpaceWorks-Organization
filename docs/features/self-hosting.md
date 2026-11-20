# Self-hosting

You can run Space Works Organization on your own server. It is open source under the AGPL.

## What it does

- A one-line installer sets up a single server with Docker. It checks the host, asks a few questions and starts the whole stack.
- Three layouts are supported: a single server (VPS), a cloud setup with managed services, and a hybrid with the website on Netlify.
- A free route behind Cloudflare is documented: one always-free VM or a home machine runs the stack, and a Cloudflare Tunnel exposes it without open ports.
- Backups cover the database and stored files, with an optional off-site copy, and can be restored from the menu.
- Updates and rollbacks are a single command.
- The platform super admin account is created on the server only.

## Who can use it

The person who runs the server. Inside the product, only the platform super admin sees platform settings.

## Turning it on or off

Optional parts, such as the bundled storage or the Netlify frontend, are chosen when you install. See the operator guides for the steps.

## Screenshots

![Self-hosting in the light theme](/screens/self-hosting-light.webp)

![Self-hosting in the dark theme](/screens/self-hosting-dark.webp)

## API

There is no public REST API yet. The source is on [GitHub](https://github.com/SpaceWorks-Labs/SpaceWorks-Organization).
