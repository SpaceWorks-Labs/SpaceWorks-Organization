# Hosting the site on Netlify

Space Works Organization can run as one server (a VPS with the installer), or **split**: the public pages and
dashboards render on Netlify, and every database, payment and email operation runs on your backend server.
This guide covers the split setup, which is how the public landing page is hosted.

## How the split works

- The `frontend/` workspace builds the same UI as the main app. Its `proxy.ts` forwards page data reads and
  Server Actions to the backend through a fixed allowlist (`frontend/catalog.json`), signed with a shared
  secret. No database URL or payment secret is ever set on Netlify.
- The landing page (`/`) needs no backend data, so it renders even while the backend is down. Sign-in,
  `/start`, dashboards and member pages need the backend.

## 1. Run the backend

Install the backend on a VPS with the one-line installer (see the README) and answer **Website: 2) No, backend
only**. It asks for the Netlify website's HTTPS origin, requires HTTPS for the backend's own domain, and writes
to the install's `.env`:

- `DEPLOYMENT_MODE=backend`, so it serves only the API and Server Actions.
- `FRONTEND_GATEWAY_SECRET`: 64 random hex characters, also set on Netlify (copy it from `.env`).
- `PUBLIC_APP_BASE_URL`: the public site address (the Netlify domain or your own), which becomes
  `NEXT_PUBLIC_BASE_URL` and `AUTH_URL`.

In the cloud topology set the same three values in `cloud.env` ([DEPLOYMENT_CLOUD.md](DEPLOYMENT_CLOUD.md)).

## 2. Create the Netlify site

1. In Netlify, add a new site from the GitHub repository `SpaceWorks-Labs/SpaceWorks-Organization`.
2. **Base directory:** leave empty (the repository root). **Package directory:** `frontend`.
3. The build command and publish directory come from `frontend/netlify.toml`.
4. Set these environment variables in the Netlify UI (Site configuration → Environment variables):

| Variable | Value |
|---|---|
| `BACKEND_ORIGIN` | Your backend's HTTPS origin, for example `https://api.example.org` |
| `NEXT_PUBLIC_BACKEND_ORIGIN` | The same value as `BACKEND_ORIGIN` |
| `NEXT_PUBLIC_BASE_URL` | The site's public address, for example `https://space-works-organization.netlify.app` |
| `FRONTEND_GATEWAY_SECRET` | The same secret as on the backend |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | A stable base64 key of 16, 24 or 32 bytes (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_HOSTED_BY` | Optional footer credit, for example `Shaan Shoukath, Systems Engineer` |

`FRONTEND_TRUSTED_IP_HEADER` and the Node version are already set in `frontend/netlify.toml`.

5. Deploy. Public `NEXT_PUBLIC_*` values are inlined at build time, so redeploy after changing them.

## 3. Check it

- `/` shows the landing page with "Hosted by …" in the footer when `NEXT_PUBLIC_HOSTED_BY` is set.
- `/login` signs in through the backend.
- `/start` submits an application, and the backend's outbox emails the applicant.

## The website as a container instead of Netlify

The same build is published as `ghcr.io/spaceworks-labs/spaceworks-organization-frontend`. Run it with the
variables in the table above and `FRONTEND_TRUSTED_IP_HEADER=x-real-ip` behind a proxy that overwrites
`X-Real-IP`; the public origins are applied when the container starts, so one image serves any domain.

## Hosting on one server instead

Answer **Website: 1) Yes** in the installer (`DEPLOYMENT_MODE` stays unset) and point your domain at the VPS; the same app then serves the landing
page, dashboards and API together. `NEXT_PUBLIC_HOSTED_BY` works the same way there.
