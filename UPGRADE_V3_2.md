# Cove Lending Studio V3.2 — Factors Increasing Assets

**Purpose:** Restore the original Google Sheets monthly asset-building chart inside the V3.1 executive dashboard. This is a source-only upgrade. No Supabase schema changes or historical-data imports are required.

## Upgrade on Windows in VS Code

1. Keep a copy of your current project and confirm your latest cloud ledger backup is secure. Never commit `.env.local`, private JSON imports, or borrower records.
2. Extract `Cove_Lending_V3_2_Asset_Movement_Upgrade.zip`. Copy the exact nested paths over your existing source files in `C:\Cove_Lending_Cloud_V2_Source`. Preserve the `.git` directory and local settings.
3. In VS Code PowerShell, run these separately:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
git status --short
```

4. Stage **both modified and new files**:

```powershell
git add -- lib/ledger.ts public/studio-app.js app/studio/executive.css tests/asset-bridge.test.mjs package.json README.md CHANGELOG.md UPGRADE_V3_2.md V3_2_RELEASE_MANIFEST.json
git diff --cached --check
git diff --cached --name-only
git ls-files --others --exclude-standard
```

   Check no source files are missing and no `.env.local`, previews, backups, or borrower files are staged. Stage `package-lock.json` only if changed by npm; inspect the change first.

5. Commit and verify that the **new test** is tracked, then push:

```powershell
git commit -m "Restore portfolio asset movement chart in V3.2"
git ls-tree -r --name-only HEAD tests/asset-bridge.test.mjs
git push origin main
```

6. Once Vercel shows **Ready**, open the dashboard and inspect the new **Factors increasing assets** section (below collections/risk, above collection priorities). Set the as-of date to **2026-10-16** for the baseline checks. Use 6/12/All history, CSV, and *See exact monthly breakdown*. On mobile, swipe sideways inside the graph to see all months.

## Reconciliation definitions

- **Opening / prior month assets:** prior month-end cash + principal outstanding (or zero at the start of lending history).
- **Capital:** posted funding inflows in the month.
- **Interest:** *net* actual interest allocated in posted collections in the month, including any reversals.
- **Outflows:** recorded owner withdrawals, financing costs and expenses; negative factors.
- **Allocation adjustment:** measured difference needed to reconcile to actual loan-level cash + principal because of historic overallocations/rounding; does not create income or a new transaction.
- **Closing assets:** cash + outstanding principal as of month-end, or the selected as-of day within the latest month.

Note: Releases and principal recoveries move between cash and receivables; they do not directly increase total portfolio assets. Unlike cashflow charts, this is an **assets bridge**. Historical monthly spreadsheet totals may be lower than recomputed loan-level values owing to an accumulated ₱8 principal-allocation difference. The original entries are preserved.

## As-of 2026-10-16

- Closing portfolio assets: ₱35,850
- Cash: ₱3,850
- Outstanding principal: ₱32,000
- Cumulative owner contributions: ₱37,000
- Cumulative interest receipts on ledger: ₱45,592
- Cumulative outflows: ₱46,750
- Historical cumulative adjustment: ₱8

Thus: ₱37,000 + ₱45,592 − ₱46,750 + ₱8 = ₱35,850.

## Limitations

- No write operations, new database tables, or UI-driven editing of historical variances.
- Tooltips are on the SVG bars/points; the expandable table and CSV expose the exact numbers if tapping a chart is difficult.
- For unusual negative-asset positions, the displayed closing-assets line may fall below the zero axis; monitor financial controls separately.
- Local quality tests do not replace browser validation against your live Supabase project.
