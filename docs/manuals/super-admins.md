# Super admins manual

What a platform super admin can do in Super admin, how acting inside an organisation works, and why super admins are managed only on the server.

## Who is a super admin

A super admin runs the platform for everyone on it. The account is a normal user with the super-admin flag, and the flag is the only thing the app checks. Anyone else who opens `/super-admin` gets "not found", so the panel never reveals that it exists.

### Created only on the server

Super admins are created, given passwords, cleared of a lost authenticator and revoked only on the server, with [scripts/admin.sh](../../scripts/admin.sh):

```bash
bash scripts/admin.sh create --email you@example.org
bash scripts/admin.sh set-password --email you@example.org
bash scripts/admin.sh reset-mfa --email you@example.org
bash scripts/admin.sh revoke --email you@example.org
bash scripts/admin.sh list
```

> **Important:** There is no in-app or emailed way to make a super admin or reset their password, and there never will be. Password reset emails, in-app password changes, passkeys and sign-in with Google, GitHub or Apple are all refused for super-admin accounts.

The installer's menu option for lost access runs the same commands. See [Super admins](../DEPLOYMENT_VPS.md#super-admins) in the server guide.

### Signing in

Sign in at `/login` with email and password. If password sign-in is switched off for everyone else, use `/login?admin=1`. Turn on an authenticator app under **Account, Security**: you need one before any organisation's dashboard opens, and an account that reaches every organisation deserves it.

## The Super admin screens

| Screen | Route | What it is for |
| --- | --- | --- |
| Overview | `/super-admin` | The platform at a glance and what needs you |
| Organisations | `/super-admin/orgs` | Every organisation, applications to review, and the "Taking applications at /start" switch |
| Add an organisation | `/super-admin/orgs/new` | Skip the application: set it up as active and invite its owner |
| An organisation | `/super-admin/orgs/<id>` | Decisions, application details, review history, team, invites, directory listing and limits |
| Organisation analytics | `/super-admin/orgs/<id>/analytics` | Totals for the last 12 months; viewing it is audited |
| Reports | `/super-admin/reports` | Organisations, members across them, usage, payments and instance health, as counts |
| Analytics | `/super-admin/analytics` | Six tabs, as totals: Overview, Growth, Money, Organisations, Operations and Web |
| Users | `/super-admin/users` | Every account, with verification, two-step sign-in, teams and sessions |
| Email | `/super-admin/email` | Email volume from the outbox; recipients and contents are never shown |
| Messaging | `/super-admin/messaging` | The platform's own channels for member reminders and notices |
| Audit log | `/super-admin/audit` | Security and application activity, with sensitive values redacted |
| Monitoring | `/super-admin/monitoring` | Health checks and request stats for this server |
| Operations | `/super-admin/operations` | Backups, queues, delivery, retention and maintenance |
| Auth | `/super-admin/auth` | Sign-in method switches, single sign-on, SMS for phone codes, and new account creation |
| Security | `/super-admin/security` | Sign-in methods, blocked addresses, sensitive activity and the list of super admins |
| Storage | `/super-admin/storage` | Database size, largest tables and each organisation's footprint |
| Settings | `/super-admin/settings` | Sign-in providers, the email provider, email and backups, and web analytics |

## Reviewing organisations

An application arrives as `PENDING_REVIEW`. The decisions open to you depend on its status:

| Decision | From | To | Note to the owners |
| --- | --- | --- | --- |
| Approve | `PENDING_REVIEW`, `CHANGES_REQUESTED` | `ACTIVE` | Optional |
| Ask for changes | `PENDING_REVIEW` | `CHANGES_REQUESTED` | Required |
| Decline | `PENDING_REVIEW`, `CHANGES_REQUESTED` | `REJECTED` | Required; the web address is held for 30 days |
| Suspend | `ACTIVE` | `SUSPENDED` | Required |
| Reactivate | `SUSPENDED`, `ARCHIVED` | `ACTIVE` | Optional |
| Archive | `ACTIVE`, `SUSPENDED` | `ARCHIVED` | None; no email is sent |

Owners are emailed for every decision except archiving. On an organisation's page you can also list it in the public directory and cap its members and team size (leave a limit empty for no cap). See [Organisations](../features/organisations.md).

## Acting as an organisation's owner

A super admin with a verified email and an authenticator can open any organisation's dashboard, for example from **Organisation dashboard** on its page, and act as its Owner with every permission. This is a deliberate platform decision with safeguards:

- You are never on the team: not listed, not counted against limits and not emailed.
- Entering an organisation writes `SUPER_ADMIN_ORG_ENTERED` (at most once per half hour per organisation), and every change writes `SUPER_ADMIN_ORG_ACTION` with the permission used.
- The organisation's activity log lists you as "Platform super admin", and a banner shows on every page you open there.
- Money rules still apply: paid payments are never edited or deleted.

> **Warning:** A compromised super-admin account reaches every organisation. Keep super admins few and their authenticators on.

## Analytics stay aggregate

Platform reports and analytics show totals and counts only, never a member's name or contact details. To see member records you must enter the organisation as above, which is audited.

## Platform analytics tabs

**Analytics** has a tab for each question. **Growth**, **Money** and **Organisations** share a range of 30 days, 90 days, 12 months or the financial year (April to March), compared with the same length just before it; **Operations** takes 7, 30 or 90 days.

- **Growth:** organisations and members, joined, renewed, lapsed and reinstated, and the renewal and churn rates, each against the previous period.
- **Money:** collected, refunds, net, online against in hand, and what is outstanding now, one section for each currency and never added across them.
- **Organisations:** a sortable ranking with growth, renewal rate, net revenue and last activity; a row opens that organisation's analytics.
- **Operations:** whether the outbox, email, messages, SMS codes, sign-ins, background jobs and storage are healthy, by day.

See [Reports and analytics](../features/reports-and-analytics.md#platform-analytics-tabs).

## Platform settings

- **Sign-in:** password is on by default; every other method is off until you switch it on under Auth and configure it. See [Sign-in](../features/sign-in.md).
- **Email:** choose SMTP, Amazon SES, Resend or Postmark under Settings. Organisations may bring their own provider for member emails. See [Email and chat notifications](../NOTIFICATIONS.md).
- **Text messages:** pick Twilio or MSG91 under Auth for phone sign-in codes.
- **Secrets** are encrypted and never shown again after saving.

## Related

- [Quickstart for platform operators](../guides/start/quickstart-operator.md)
- [Security](../SECURITY.md), [Configuration](../CONFIGURATION.md), [Reports](../REPORTS.md)
- [Audit actions](/docs/audit-actions)
