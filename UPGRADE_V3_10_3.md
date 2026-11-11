# Cove Lending Studio V3.10.3 — Nocturne Dashboard & Table Cleanup

This patch recreates the visual direction of your approved **dark teal / emerald / lime** dashboard, without substituting mock values for the live lending ledger.

## What changes

- The `/studio` interface gets a near-black teal background, layered neon-green highlights, illuminated card borders, ring motifs, and closer spacing.
- The portfolio banner and four KPI tiles become shorter and clearer.
- Asset Source Mix, contractual interest, monthly interest chart, portfolio activity, risk analysis, and other dashboard panels share the same visual design.
- The existing signed-funding fallback, capital calculation, due date, interest breakdown, date controls, export controls, and loan operations remain in place.
- Table-oriented Cove pages use one primary page title. Exact duplicates in a table's immediate header are removed, while distinct table/section headings and all table columns remain.
- The top bar uses the **working Refresh portfolio** action rather than inactive notification/help icons.
- The sidebar still scrolls independently so all modules are accessible.
- The dark style is intentionally limited to the main `/studio` workspace: dedicated Financial Statements, Operations Center, and Loan Applications routes keep their established screen layouts. The shared financial data and API remain unchanged.

## Files included

- `app/studio/page.tsx` (imports the final dark stylesheet and restores refresh)
- `app/studio/nocturne.css` (new theme)
- `app/studio/asset-sources.css` (V3.10.2 layout retained for earlier bases)
- `public/studio-app.js` (removes repetitive header notes, preserves real charts and financial calculations)
- `tests/v3102-dashboard-interest-chart.test.mjs` (chart regression tests for earlier bases)
- `tests/v3103-nocturne.test.mjs` (new style and title regression tests)
- `package.json`, `CHANGELOG.md`, `UPGRADE_V3_10_3.md`, and `V3_10_3_RELEASE_MANIFEST.json`

## Apply

1. Keep your `.env.local`, `.git`, Supabase records and existing project files. Back up the folder or make a Git checkpoint first.
2. Extract the **Upgrade Patch** into `C:\Cove_Lending_Cloud_V2_Source`, preserving folders and replacing only matching files.
3. Run in VS Code PowerShell:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
```

4. Only after all checks pass, stage exactly the intended files:

```powershell
git add -- package.json CHANGELOG.md UPGRADE_V3_10_3.md V3_10_3_RELEASE_MANIFEST.json
git add -- app/studio/page.tsx app/studio/nocturne.css app/studio/asset-sources.css
git add -- public/studio-app.js
git add -- tests/v3102-dashboard-interest-chart.test.mjs tests/v3103-nocturne.test.mjs
# If npm install intentionally updated package-lock.json, stage it too:
# git add -- package-lock.json
git diff --cached --check
git diff --cached --name-only
git status --short
```

5. Review staged files. Don't add `.env.local`, `test/` containing Kitchen Stack recordings, previews, seed files, or unrelated changes.
6. Commit and push:

```powershell
git commit -m "Release Cove V3.10.3 Nocturne dashboard visual refinement"
git push origin main
```

If GitHub cannot resolve, do not recommit; retry only `git push origin main` once network/DNS works.

## Acceptance checks after Vercel is Ready

1. Dashboard's deep-teal and lime look matches the approved reference; no blank white panels or hard-to-read gray text.
2. Main title remains one title and table modules do not repeat identical table titles.
3. Refresh, as-of date, New loan, Record collection, 6M/12M chart range, received/scheduled interest toggle, interest breakdown and detail links still work.
4. The Asset Source Mix donut uses live amounts. When owner capital is negative, it switches to signed bars. Unclassified reconciliation amounts remain in Data Integrity.
5. Sidebar scrolls to its last module without browser zoom changes, including short windows and mobile menu.
6. Verify dark table text, status badges and form modals in Loans, Cashbook, Collections, and Reconciliation.
7. Compare live portfolio cash, principal and total assets to pre-update values. **They should not change.**

## Testing limits

This environment ran the automated Node test suite, JavaScript syntax checks, and a browser-rendered layout preview using representative figures. The preview is illustrative, not a capture of your live Supabase workspace. The full Next.js production build, dependency security audit and deployment require your connected VS Code environment.

No new SQL migration or environment variable is needed; this release makes **no financial write or schema changes**.
