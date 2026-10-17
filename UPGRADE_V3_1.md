# Cove V3.1 — Premium Executive Dashboard update

**Target:** Your existing deployed V3.0 Next.js/Supabase project. No database migration. Preserve `.git`, `.env.local`, private imports, and the production Supabase project.

## Install

1. Back up your current VS Code project. Do not commit borrower data or credentials.
2. Extract `Cove_Lending_V3_1_Dashboard_Upgrade.zip` and copy its file paths into your existing project folder, overwriting only matching files. The new CSS and test files must also be copied.
3. From `C:\Cove_Lending_Cloud_V2_Source`, run:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
git status --short
```

4. Stage **all** required paths; new files are not captured by `git add -u`:

```powershell
git add -- app/studio/page.tsx app/studio/executive.css public/studio-app.js lib/ledger.ts tests/ui-contract.test.mjs tests/executive-dashboard.test.mjs package.json README.md CHANGELOG.md DESIGN_RESEARCH_V3_1.md UPGRADE_V3_1.md V3_1_RELEASE_MANIFEST.json
git diff --cached --check
git diff --cached --name-only
git ls-files --others --exclude-standard
```

5. Ensure all intended files are staged and no secrets, imports, mock previews, or generated build caches are staged. If `npm install` changed `package-lock.json`, stage that file after inspecting the diff.

```powershell
git commit -m "Redesign Cove V3.1 executive lending dashboard"
git ls-tree -r --name-only HEAD app/studio/executive.css tests/executive-dashboard.test.mjs
git push origin main
```

6. Wait for Vercel **Ready**. Sign in and test the dashboard at a fixed date (e.g., 2026-10-16). Check metrics below and mobile navigation. No SQL run is required.

## Baseline cross-check (October 16, 2026)

- Capital introduced: ₱37,000
- Net cash: ₱3,850
- Outstanding principal: ₱32,000
- Portfolio assets: ₱35,850
- Monthly contractual interest: ₱3,700
- Final scheduled due date: 2027-01-08
- Receipt-ledger interest: ₱45,592
- Spreadsheet reference interest: ₱45,600 (historical variance ₱8)
- PAR30 proxy: 0% for that date in the updated private workbook; dependent on posting/effective dates

## Test disclosure

- In this packaging environment: 39 automated tests passed including private old historical seed when mounted temporarily; 6/6 October 16 headline values matched separately; strict financial-module TypeScript passed, browser desktop/mobile smoke checks passed with synthetic data.
- **The full Next.js production build and npm audit could not be run here** due to unavailable npm registry. Run the commands above in VS Code before pushing.
- Historical loans may show documented mismatches; V3.1 does not alter original allocations or write to Supabase by itself.
