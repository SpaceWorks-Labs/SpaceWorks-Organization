# Space Works Organization 0.10.1

Released 2026-11-20. The full list of changes is in [CHANGELOG.md](../CHANGELOG.md#0101-2026-11-20).

## Upgrading

Nothing to do. This release changes the README and its artwork only: no migrations, no new environment variables
and no change in behaviour. Rolling back to 0.10.0 works.

## What changed

- The README follows the design system's product README structure, with a rounded light and dark banner and a
  gallery of light and dark screenshot pairs.
- `node scripts/generate-readme-art.mjs` draws the banner and copies the gallery from `public/screens`.

## Known gaps

- The payments, receipts, notifications and member portal captures in `public/screens` show empty states in the
  demo data, so they are left out of the README gallery until they are recaptured with populated data.
