# Cove Lending Studio V3.6 — Live Integrity + Dashboard Refinement

**Upgrade target:** Existing V3.5 application. **No new Supabase migration**, no new dependency, no data import, and no financial writes. Preserve your `.env.local`, `.git`, existing `package-lock.json`, and borrower data.

## What changed

### Data Integrity Center
- Primary monitoring compares **current posted cash, loans, receipts, and reference IDs** as of the chosen date, rather than comparing new activity with the frozen workbook import snapshot.
- Five checks: cashbook transaction rollforward, portfolio assets equation, receipt amount allocation, per-loan allocation caps, and duplicate source references.
- Loan-level exceptions and receipt-reference collisions appear in the issue list, and the audit journal is retained.
- **Important:** internal checks establish arithmetic consistency of entries. They do **not** independently validate cash against a bank statement or evidence that funds were physically received.
- The historic import baseline remains in stored data and is not overwritten, but its changing differences are no longer presented as live failures.

### Dashboard
- Asset Source Mix is more compact: no link to Financial Statements, repetitive help paragraphs, or historic workbook disclosure in the card.
- Interest & Maturity has no Financial Statements button. Expand **View interest breakdown** to see active loan ID, borrower, product, original loan principal, contractual monthly rate and calculated monthly interest. Click a borrower to open the existing loan detail panel.
- Interest remains **contractual flat-rate run-rate**, not realized interest or accrued interest. All values recalculate for the dashboard's selected `as-of` date.

## Install into your current VS Code project
1. Back up the project folder and export an authenticated read-only ledger JSON; maintain a recoverable Supabase database backup.
2. Extract the **upgrade ZIP** into `C:\Cove_Lending_Cloud_V2_Source`, retaining the folder structure and overwriting matching application files. **Do not replace `.env.local` or merge files from another project.**
3. Run:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
```

Every command must pass. Node tests and standalone strict financial-module TypeScript passed in the authoring environment. The full Next.js build must be run in VS Code: the authoring environment did not have cached npm dependencies.

## Stage only the intended files

```powershell
git add -- package.json README.md CHANGELOG.md
git add -- lib/ledger.ts public/studio-app.js app/studio/asset-sources.css
git add -- tests/ui-contract.test.mjs tests/executive-dashboard.test.mjs tests/v36-live-controls.test.mjs
git add -- UPGRADE_V3_6.md V3_6_RELEASE_MANIFEST.json
git diff --cached --check
git diff --cached --name-only
git status --short
git ls-files --others --exclude-standard
```

Verify every new file is staged and no unrelated files, private imports, `.env.local`, previews, or backup files are included.

```powershell
git commit -m "Release Cove V3.6 live integrity and interest drilldown"
git ls-tree -r --name-only HEAD -- tests/v36-live-controls.test.mjs app/studio/asset-sources.css
git push origin main
```

## Production acceptance
- At the selected current date, new capital and new loans must **not** be flagged simply for differing from the original workbook baseline.
- Expected live exceptions may still include historical receipt overallocations and repeated source reference IDs because those receipts are still in the live ledger; the release does not silently repair them.
- Expand **View interest breakdown** and verify the sum equals Monthly Contractual Interest; selecting a loan should open its detail drawer.
- Confirm Asset Source Mix totals still agree with the financial position and that the Financial Statements sidebar route still works.
- Verify both a historical as-of date and a current date. For October 16, 2026, the imported source independently tests against ₱3,850 cash, ₱32,000 outstanding principal, ₱3,700 monthly contractual interest, and January 8, 2027 final due date.

**Important:** No loan, receipt, capital, or cash account record is modified by the patch. There is no new SQL to execute.
