# Space Works Organization 0.11.0

Released 2026-11-21. The full list of changes is in [CHANGELOG.md](../CHANGELOG.md#0110-2026-11-21); this page
covers what an operator needs to know.

## Upgrading

- **Database:** migrations `0029_area_cards`, `0030_certificates` and `0031_public_page_drafts` are applied by the
  update.
  - 0029 adds contact columns to units and lets a card design belong to a unit.
  - 0030 adds the certificate tables and gives the new `certificates.issue` and `certificates.design` permissions
    to every existing Manager role (the Owner holds everything already). Treasurer, Viewer and custom roles are
    unchanged.
  - 0031 adds draft and publisher details to the public page and a table of published versions.
- **Settings:** nothing to configure. There are no new environment variables.
- **Rolling back to 0.10.2:** this works, with one caution. The new tables and columns are ignored, and the
  `certificates.*` permissions on roles are ignored. Version 0.10.2 does not know about area card designs, so before
  you roll back, send each area back to the organisation's design (**Settings, Cards**, **Use organisation design**)
  so no older code can mistake an area's design for the organisation's.

## What changed

- **Certificates.** A new **Certificates** area (`/dashboard/<org>/certificates`): design a page, have the Owner
  approve it, then issue numbered certificates to chosen members, a plan or a smart group, email the PDF, download
  PDF or PNG or a batch, and revoke with a reason. Each certificate has a QR to a public check page. Members see
  theirs at `/account/certificates` when member accounts are on. See [Certificates](features/certificates.md).
- **Public page editor.** The editor is now visual: click text on the page to change it, drag sections, undo and
  redo, and preview in light or dark at desktop, tablet or phone width. Drafts autosave, and each publish is kept in
  a version history of the last 20. Eight new blocks (live numbers, areas directory, columns, button group, icon
  list, divider, badges, members' area) bring the total to 28. See [Public page](features/public-page.md).
- **Area pages.** Every unit has a page at `/o/<slug>/a/<CODE>` from the same published page, with its own plans,
  numbers and contact details. They are in the sitemap.
- **Per-area cards and contacts.** A unit can have its own card design and number series, and its own email, phone
  and website for card backs. See [Member cards](features/member-cards.md) and [Units](features/units.md).
- **Platform analytics.** Growth, Money, Organisations and Operations tabs under **Super admin, Analytics**. See
  [Reports and analytics](features/reports-and-analytics.md#platform-analytics-tabs).
- **Message kinds.** There are now 18 member message kinds; `certificate-issued` carries the certificate PDF by email.
- **Fix:** count charts show whole-number ticks only.

## Behaviour to know

- **Card order.** A card uses its member's role design, then the nearest area design, then its plan's, then the
  organisation's. An organisation that sets nothing per area sees no change.
- **Card numbers.** Adding area numbering never changes a card number already issued. Only cards numbered from now on
  use the area's series.
- **Contact details** on a card back come from the member's area, one detail at a time, then the unit above, then the
  organisation. Cards are drawn on demand, so existing members' cards show the new details at once.
- **Certificates and approval.** A design can't be used until the Owner has approved it. After that, certificates
  already issued are drawn from the design's current live version, so an approved change restyles them.
- **Certificate limits.** One issue request covers up to 200 members and is refused, never cut short, when more
  match. A member holding a valid certificate of the same design and title is skipped.
- **The public check page** shows the holder's name only while the certificate is valid, and never the reason.
- **Publishing the page** updates the organisation's page and every area page together. The older **Live counts**
  block is hidden on area pages, because its numbers cover the whole organisation.
- **Platform analytics** are cached for five minutes and show aggregates only.

## Known gaps

- **Page editor, simultaneous edits:** autosave is last write wins. Two people editing the draft at once can
  overwrite each other.
- **Page editor, in-place text:** you can't start editing in place on an empty field or on a Markdown body; use the
  section's settings for those.
- **Certificates follow the live design:** issued certificates are drawn from the design's current live version, not
  a frozen copy of what was approved when they were issued.
- **Check page image:** the certificate check page draws no image of the certificate.
- **Brand kit:** the brand kit's saved logos aren't offered in the certificate designer. Upload a picture instead.
- **Card numbers already issued** never change when area numbering is added, so a member keeps the number they have
  even if their area now numbers differently.
- **Area contact details** are not yet used in the card designer's sample download, which still shows the organisation's, or on certificates, whose `{website}`, `{email}` and `{phone}` always print the organisation's.
- **Translations:** the interface is still British English only.
