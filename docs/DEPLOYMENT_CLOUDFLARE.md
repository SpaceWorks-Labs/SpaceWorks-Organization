# Free hosting behind Cloudflare

The whole platform cannot run on Cloudflare's free compute alone (see [What does not run on Workers](#what-does-not-run-on-workers)).
The free route is to run the bundled stack on one always-free virtual machine, or a machine at home, and put
Cloudflare in front of it:

| Piece | Where | Why |
|---|---|---|
| The stack (app, worker, beat, PostgreSQL, Redis) | One always-free VM, or a home server | The app needs a long-running Node process, Postgres, Redis and background jobs. |
| HTTPS, DNS, CDN, basic WAF | Cloudflare (free plan) | Terminates HTTPS and shields the server. |
| Cloudflare Tunnel | `cloudflared` container on the server | Dials out to Cloudflare, so the server needs **no open ports**. |
| File storage | Cloudflare R2 | Files live outside the VM and survive its loss. |
| Email | Resend free tier (or Amazon SES) | Needs a verified sending domain. |

Free tiers change. Check each provider's current limits and terms before you rely on them, and
watch for idle-resource reclamation rules on always-free VMs.

## 1. Get a server

### Option A: Oracle Cloud Always Free (Arm)

1. Create an Oracle Cloud account (a payment card is asked for identity checks; stay inside the Always Free
   resources).
2. Create a compute instance: image **Canonical Ubuntu** (a current LTS), shape **VM.Standard.A1.Flex**
   (Ampere Arm; check the current Always Free allowance for OCPUs and memory and give the stack as much as it
   allows), a public IPv4 address, and your SSH public key. Capacity in a region is sometimes full; try again later
   or in another availability domain.
3. Release images support `aarch64`, so Arm is fine.
4. Firewall: **you do not need to open any inbound port except SSH.** Leave the security list as it is (SSH only).
   Oracle's Ubuntu images also ship host firewall rules; keep them. The tunnel only makes outbound connections.
5. Update the machine and reboot: `sudo apt update && sudo apt full-upgrade -y && sudo reboot`.

### Option B: a machine at home

Any 64-bit Linux box (x86_64 or arm64) that stays on. Nothing needs forwarding on your router. A home connection
that changes IP address is not a problem, because the tunnel dials out.

## 2. Add your domain to Cloudflare

Add your domain to a free Cloudflare account and switch its nameservers to Cloudflare's. You will use a host name
such as `members.example.org`.

## 3. Create the tunnel

1. In the Cloudflare dashboard open **Zero Trust** (it asks you to pick a plan; choose the free one), then
   **Networks → Tunnels → Create a tunnel → Cloudflared**.
2. Name it, then on the install page choose the **Docker** connector. **Copy only the token**: the long string after
   `--token`. Do not run the command it shows; the installer starts the connector for you. Treat the token as a
   secret: anyone who has it can run your tunnel.
3. On the **Published application / Public hostname** step add:
   - **Hostname:** `members.example.org`
   - **Service type:** `HTTP`
   - **URL:** `backend:3000`

   `backend` is the app's name on the stack's private Docker network, where the connector runs. Cloudflare creates
   the DNS record (a proxied `CNAME` to the tunnel) for you.

## 4. Install

On the server:

```bash
curl -fsSL https://raw.githubusercontent.com/SpaceWorks-Labs/SpaceWorks-Organization/main/install.sh | bash
```

Answer the questions (see the README); the choices that matter here:

- **HTTPS:** `4) Cloudflare Tunnel`. Enter your public domain, then paste the tunnel token (it is hidden as you
  type). The installer writes it only to the owner-only `.env` as `CLOUDFLARE_TUNNEL_TOKEN`; it is never printed,
  and the app itself never receives it.
- **File storage:** `2) External S3-compatible bucket`, with your R2 details (section 6).
- **Email:** your relay's details (section 7).

The installer chooses `SWO_LAYER='cloudflared'`, which adds `docker/compose.cloudflared.yml`: Caddy is switched
off, no port is published, and a pinned `cloudflare/cloudflared` container runs beside the app with a health check.
Check the connector with `bash scripts/vps-status.sh`: `cloudflared` should be listed as healthy, and the tunnel
shows **Healthy** in the Cloudflare dashboard.

To switch an existing install, edit `.env` (see [Moving between modes](DEPLOYMENT_VPS.md#moving-between-modes)):

```bash
SWO_LAYER='cloudflared'
CLOUDFLARE_TUNNEL_TOKEN='<token>'
PUBLIC_APP_BASE_URL='https://members.example.org'
```

remove `ALLOW_PLAIN_HTTP`, then `scripts/spaceworks-compose.sh bundled up -d`.

## 5. HTTPS and the client address

- **SSL/TLS mode.** With a Tunnel, the browser's HTTPS ends at Cloudflare and the hop to your server is carried
  inside the tunnel's own encrypted connection, not over the public internet to an origin port. There is no origin
  certificate to manage, and **Full (strict)** is not needed. Leave the SSL/TLS mode as the dashboard offers and
  turn on **Always Use HTTPS**.
- **Client address.** The layer sets `TRUSTED_PROXY_IP_HEADER` to `cf-connecting-ip` for the app. This is safe
  only because the tunnel is the app's sole way in: the app publishes no port, so the header can only come from
  Cloudflare. Never also expose the app's port directly, or anyone could forge the header and dodge rate limits.
  The bundled stack's default (`x-real-ip`, set by Caddy) is unchanged for the other layers.
- **Sign-in and card links** use `PUBLIC_APP_BASE_URL`, which must be the `https://` address you published.

## 6. Storage on R2

Create a private R2 bucket and an API token limited to it, exactly as in
[Object storage on Cloudflare R2](DEPLOYMENT_CLOUD.md#object-storage-on-cloudflare-r2). In the installer enter
`https://<account-id>.r2.cloudflarestorage.com`, region `auto`, the bucket and the key pair. R2 has a free
allowance; check Cloudflare's current limits. Files are served through the app, so no public bucket or CORS
rules are needed.

## 7. Email with Resend

Cloudflare's free plan does not send transactional email; use Resend's free tier or Amazon SES (check their current
limits).

1. In Resend, **Domains → Add domain** for your sending domain and add the DNS records it shows (SPF, DKIM) in
   Cloudflare DNS. Set them to **DNS only** (grey cloud). Wait until Resend shows the domain as verified.
2. Create an API key limited to sending.
3. Either:
   - at install time, use Resend's SMTP relay (`smtp.resend.com`, port `465`, login `resend`, the API key as the
     password); or
   - in `.env` set the API provider, then `scripts/spaceworks-compose.sh bundled up -d`:

     ```bash
     EMAIL_PROVIDER='resend'
     RESEND_API_KEY='<api key>'
     EMAIL_FROM='Your Organisation <noreply@example.org>'
     ```
4. Bounces and complaints: in Resend add a webhook to
   `https://members.example.org/api/email/webhooks/resend` for the delivery events, copy its signing secret
   (`whsec_…`) into `EMAIL_WEBHOOK_SECRET`, and restart. Unverified requests are refused.
5. Send a test message from **Super admin → Settings**.

## 8. Backups to R2

The stack already writes local backups (see [Backups and restore](DEPLOYMENT_VPS.md#backups-and-restore)). A free VM
can be reclaimed or lost, so keep an encrypted copy elsewhere: open the [installer menu](DEPLOYMENT_VPS.md#the-installer-menu)
and choose **off-site copies** (option 5, run nightly by `scripts/vps-offsite-backup.sh`). It asks for
an S3-compatible bucket: use a **second R2 bucket** and a token limited to it, not the app's file bucket.
Everything is encrypted with an `age` key before upload; keep the private key in a password manager, off the
server. A restore on a new machine is covered in
[Restore on a new server](DEPLOYMENT_VPS.md#restore-on-a-new-server).

## 9. Cloudflare settings on the free plan

**Block the internal hooks.** The tunnel forwards straight to the app, so Caddy's block of `/api/internal/*` is
not in the path. These endpoints also demand the `CRON_SECRET` bearer, but keep them private anyway. In
**Security → WAF → Custom rules** add a rule, action **Block**:

```text
(starts_with(http.request.uri.path, "/api/internal/"))
```

**Rate limiting.** The app rate limits sign-in, forms and APIs itself, per client address. A Cloudflare rate-limit
rule on `/login` and `/start` is an optional extra layer; check which rule types and how many your plan allows. In
**Security → Settings** keep **Bot Fight Mode** on, but do not challenge `/api/webhooks/*` or `/api/email/webhooks/*`:
payment and email providers call those. If a challenge blocks them, add a skip rule for those paths.

**Caching.** Cloudflare caches only static file types by default, so most dynamic pages are already not cached.
Make it explicit with **Caching → Cache Rules**:

| Rule | Action |
|---|---|
| Path starts with `/api`, `/dashboard`, `/account`, `/super-admin`, `/pay`, `/verify`, `/login` | **Bypass cache** |
| Path starts with `/_next/static` or `/brand` | **Eligible for cache**, edge TTL: respect origin (the files are fingerprinted and immutable) |

Never cache anything that carries sessions, money state, member records, cards or `/verify` pages. Turn off any
setting that rewrites HTML (Rocket Loader, Auto Minify) if it appears; it can break the app's scripts.

## What does not run on Workers

Cloudflare Workers and Pages on the free plan cannot host this app by themselves:

- Workers allow only a small amount of CPU time per request on the free plan (check the current limit); a Next.js
  server-rendered app with Server Actions and PDF and image work exceeds it.
- Cards and photos use native modules (`sharp`) that do not run in the Workers runtime.
- It needs PostgreSQL 16 and Redis, which Workers cannot run (a hosted database would work only with a different
  data layer than this one).
- The worker and beat roles are long-running BullMQ processes; Workers are request-driven.

Hence the VM plus Tunnel design above.

## Optional and experimental: website on Workers

The split layout in [DEPLOYMENT_NETLIFY.md](DEPLOYMENT_NETLIFY.md) renders the public site from the `frontend/`
workspace and sends data through a signed gateway to the backend. In principle that frontend could be built for
Cloudflare Workers with the OpenNext Cloudflare adapter instead of Netlify, with the same environment values
(`BACKEND_ORIGIN`, `FRONTEND_GATEWAY_SECRET`, …) and the backend installed with **Website: 2) No, backend only**.
**This is experimental and untested here**: no build script, Wrangler configuration or CI covers it, and the
frontend may need changes to run in the Workers runtime. Netlify is the supported split target.

## Troubleshooting

- **502 or "Bad gateway":** the tunnel is up but cannot reach `backend:3000`. Check the public hostname's service
  is `HTTP` with URL `backend:3000`, and `scripts/spaceworks-compose.sh bundled ps`.
- **Tunnel shows Down:** `scripts/spaceworks-compose.sh bundled logs cloudflared`; the server needs outbound
  access to Cloudflare. A wrong or rotated token fails to connect: update `CLOUDFLARE_TUNNEL_TOKEN` in `.env`
  and `up -d`.
- **Everyone shares one rate limit or sees "unknown" addresses:** the app is receiving no `cf-connecting-ip`, for
  example because traffic reached it by another route. Use the tunnel only.
