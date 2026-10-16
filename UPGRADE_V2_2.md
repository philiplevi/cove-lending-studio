# Cove Lending Studio 2.2 — UI Upgrade (Existing Deployment)

This release updates the **interface only**. It keeps the V2.1 Supabase schema, login, same-origin authentication, API routes, and centavo-based ledger calculations. **Do not rerun the SQL migration.** Borrower data stays in the existing cloud database.

## In VS Code (existing `C:\Cove_Lending_Cloud_V2_Source` folder)

1. Download `Cove_Lending_Studio_V2_2_Premium_Source.zip` and extract it to a temporary folder.
2. Copy the files and folders inside `cove-lending-studio/` into the **existing** VS Code project, replacing files when asked. Keep `.git/`, `.env.local`, `package-lock.json`, and any private import files. Do **not** copy the sample screenshot into your application.
3. Confirm the following new files are included:
   - `app/studio/premium.css`
   - `tests/ui-contract.test.mjs`
   - `UPGRADE_V2_2.md`
4. Install/validate locally:

   ```powershell
   npm install --include=dev
   npm run check
   npm audit --omit=dev
   git diff --check
   ```

   Stop if any command fails; do not use Vercel as the first build check.
5. Stage only project code/documentation (not secrets), then review what is actually committed:

   ```powershell
   git add app/studio/page.tsx app/studio/studio.css app/studio/premium.css public/studio-app.js tests/ui-contract.test.mjs package.json package-lock.json README.md CHANGELOG.md UPGRADE_V2_2.md
   git diff --cached --stat
   git diff --cached --check
   git status --short
   git commit -m "Release Cove V2.2 premium lending workspace"
   git push origin main
   ```

   If `package-lock.json` does not exist because installation failed, **stop** and fix installation instead of committing.
6. After Vercel reports **Ready**, sign in to your existing Cove URL. Check the dashboard, Collections screen, loan drawer, receipt posting, and date filters.

## What's new

- Refreshed dark-teal executive layout, high-contrast KPIs, polished charts, smoother navigation, mobile-friendly views.
- New **Collections** register using the **existing** Supabase payment records (not a second ledger) with search and reversal filter.
- Quick actions for loans and collections, with loan drilldowns and existing audited reversal flow.
- 6M/12M cashflow chart range, exposure watch, overdue signals, and clearer accounting descriptions.
- Integrity screen no longer reports `0 of 5 matched` when no comparison baseline exists.
- UI contract tests added to `npm run check`.

## Data and accounting notes

- No borrower/payment data is shipped in this ZIP. Your existing private Supabase workspace remains intact.
- This release does **not** add new loan accounting rules or historical data updates. If you have new October 16 Excel records, treat them as a separate migration/reconciliation step; do not run a second full import into a populated workspace.
- Dashboard due-soon values follow the existing installment schedule logic; they do not represent a bank-confirmed cash forecast.

## Verification boundary

The included Node test suite and browser rendering/interactions were tested against **synthetic**, non-private data. The full Next.js build and live Supabase operations **must** be verified with `npm run check` on your machine because npm dependencies could not be installed in this packaging environment.
