# Cove Lending Studio V3.10.5 — Whole-Peso Dashboard Display

## Scope
Presentation-only update to round Dashboard currency amounts to whole Philippine pesos. Does not round or modify stored values, loan totals, cashbook entries, financial statements or exports. Percentage precision remains unchanged.

## Release checks
- `npm install --include=dev`
- `npm run check`
- `npm audit --omit=dev`
- `git diff --check`

## Changed files
`public/studio-app.js`, `package.json`, `CHANGELOG.md`, `tests/v3101-asset-donut.test.mjs`, `tests/v3102-dashboard-interest-chart.test.mjs`, `tests/v3105-whole-peso-dashboard.test.mjs`, `UPGRADE_V3_10_5.md` and `V3_10_5_RELEASE_MANIFEST.json`.

No Supabase migration. Retains prior V3.10.4 Clarity Light and Folio monthly reporting integration. For a fresh dashboard, hard-refresh the browser after production deploy.
