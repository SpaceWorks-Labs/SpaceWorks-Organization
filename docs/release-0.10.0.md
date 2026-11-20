# Space Works Organization 0.10.0

Released 2026-11-20. The full list of changes is in [CHANGELOG.md](../CHANGELOG.md#0100-2026-11-20); this page
covers what an operator needs to know.

## Upgrading

- **Database:** migrations `0023_perf_indexes`, `0024_groupings`, `0025_payment_modes_renewals` and
  `0026_member_messaging`, `0027_card_brand_kit` and `0028_card_versions_templates` are applied by the update.
  - 0023 enables the `pg_trgm` extension for member search. Managed Postgres providers allow it, but check that
    yours does.
  - 0024 adds the `groupings.manage` permission to existing Manager roles.
  - 0025 sets each existing plan's payment mode from its prices: plans whose prices are all zero become Free.
- **Rolling back to 0.9.0:** this works. The new tables and columns are ignored.
- **Sessions:** nothing changes for signed-in people in this release. The 0.9.0 move to server-side sessions
  already signed everyone out once.
- **New optional environment variables:**
  - `MESSAGING_MATTERMOST_HOSTS` and `MESSAGE_LOG_RETENTION_DAYS`.
  - The email provider variables: `EMAIL_PROVIDER`, the SES variables, `RESEND_API_KEY`, `POSTMARK_*` and
    `EMAIL_WEBHOOK_SECRET`.
  - The SMS provider variables: `SMS_PROVIDER`, the Twilio and MSG91 variables, `SMS_WEBHOOK_SECRET` and
    `SMS_DAILY_COUNTRY_CAP`.
  - `CLOUDFLARE_TUNNEL_TOKEN`, used by the installer's Tunnel option only; it is never passed to the app.

  See `docs/CONFIGURATION.md`.

## Behaviour changes to check

- **Staff limits:** staff limited to grouping values see only members inside those values, as unit-limited staff
  do. They cannot create join invites.
- **Recent sign-in:** saving payment gateway or UPI settings, removing staff, creating staff invites and changing
  staff roles now need a recent sign-in. Changing the UPI payee emails the owners.
- **Member messages:**
  - Member notices now go through the organisation's routing. Email stays the default when no other channel is
    linked.
  - Member emails greet people by first name.
  - Revoking, cancelling or withdrawing a membership now ends its card; reinstating restores it with the same
    number.
- **Theme:** the System theme option is gone (owner decision); saved System choices read as Light.
- **Built-in card designs:** these changed. Organisations' saved and approved designs are not changed.
- **Card layer opacity:** a layer's opacity now fades every part it draws. Designs saved before this release look
  the same.

## Known gaps

- **Translations:** the interface is still British English only.
- **Vendor accounts:** the WhatsApp, Telegram, Slack, Discord and Mattermost transports are tested against fake
  servers only. Check each one with your own accounts before relying on it.
- **WhatsApp and the design system:** WhatsApp isn't yet in the design system's provider list (§16). This repository
  records the decision in `docs/decisions.md`.
- **Card editor:**
  - Image alt text isn't written into card PDFs.
  - Curved text joins complex scripts only approximately.
  - Print bleed extends the background colour, not a background picture.
- **Hostname checks:** a host an organisation types in is checked for public addresses once, then resolved again
  when connecting. Pinning the resolved address is planned (see `docs/SECURITY.md`).
