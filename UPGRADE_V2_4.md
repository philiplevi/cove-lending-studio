# Cove Lending Studio V2.4 — Collection Planner & Portfolio Intelligence

V2.4 is an **additive, read-only analytics and user-interface release** built on V2.3. It does not introduce a database table, modify existing transaction procedures, or require a Supabase SQL migration. All writes continue through the V2.3 owner-scoped, transaction-safe endpoints.

## Changes

- Dashboard: "Active capital & earnings" panel (capital infusion, actual interest collected, disbursements, capital/assets, deployed principal, utilization, contractual monthly interest, monthly borrowing funding cost if recorded, and scheduled final due date).
- Live as-of recalculation: current monthly contracted flat interest is `sum(original loan principal × approved monthly rate)` for loans whose contractual balance remains unpaid and are not voided as of that date.
- "Scheduled final collection" is the **maximum installment due date across active loans**, not a guarantee of collection. Fully settled and voided loans do not contribute; earlier as-of snapshots are preserved.
- Collection planner: outstanding installments with due dates, partial-payment allocation (oldest-first, net of reversals), today, past due, upcoming 7 and 30 days, and searchable borrower/loan filters.
- Reports: age-bucket analytics (1–30, 31–60, 61–90, 90+ days), cumulative scheduled collection coverage, contractual income run rate, contract maturity and capital utilization.
- Existing ledger, borrowers, collection posting, cashbook, reconciliation, authentication, and V2.3 voiding features remain unchanged.

## Important definitions

- **Monthly contractual interest** is a flat-rate contract run-rate, not accrued revenue or monthly cash received. As loans become fully settled or voided, they leave the run-rate. Partial principal repayments do not reduce the flat contractual monthly amount.
- **Interest collected** comes from payment allocations; it is cash basis. A legacy spreadsheet dashboard may show a different interest amount. If a baseline exists the V2.4 capital panel shows it separately as a **fixed imported reference**, while Cove retains the transaction-ledger value.
- **Active capital utilization** is outstanding principal divided by `(cash + outstanding principal)`. The assets value does not deduct any unrecorded liabilities or credit losses.
- **Collection coverage** is cumulative posted receipts applied against installments due through the as-of date, capped per loan at contractual dues to date. It is a planning indicator rather than an accounting collection-efficiency rate.
- **Scheduling** uses the installment schedule saved with each loan and net signed payments. No messages/reminders are automatically sent. The planner does not alter receipt principal/interest allocations in the database.

## Verified October 16, 2026 reference snapshot

Against the separately supplied latest workbook (not included in the source ZIP), the pure ledger projection produced:

| Metric | Result |
| --- | ---: |
| Capital infused | PHP 37,000 |
| Cash | PHP 3,850 |
| Outstanding principal | PHP 32,000 |
| Capital / portfolio assets | PHP 35,850 |
| Capital utilization | 89.26% |
| Contractual monthly interest run-rate | PHP 3,700 |
| Latest scheduled due date among active loans | 2027-01-08 |
| Interest collected per receipt allocation | PHP 45,592 |
| Interest earned per original dashboard reference | PHP 45,600 |
| Existing historical interest-allocation difference | PHP 8 |

**Do not commit the workbook, borrowers, backups, `.env.local`, or private seed into GitHub.**

## Install in existing VS Code project

1. Back up your current V2.3 source and confirm the live database export/restore plan before changing the app.
2. Extract `Cove_Lending_V2_4_UI_Update.zip`; copy its contents over `C:\Cove_Lending_Cloud_V2_Source`, preserving your `.git`, `.env.local`, any local `private_import` folder, and your `package-lock.json`.
3. Run in the VS Code terminal, **individually**:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
git status --short
```

4. If all checks pass, stage **all changed and newly created V2.4 files** (this step is necessary; earlier releases omitted new files):

```powershell
git add -- package.json README.md CHANGELOG.md lib/ledger.ts public/studio-app.js app/studio/page.tsx app/studio/premium.css tests/portfolio-intelligence.test.mjs UPGRADE_V2_4.md V2_4_RELEASE_MANIFEST.json
# If npm updated the lockfile, stage it too:
git add -- package-lock.json
git diff --cached --check
git diff --cached --name-only
git ls-files --others --exclude-standard
```

5. Ensure the new test, upgrade guide and manifest are included; inspect unexpected untracked files before committing. Then:

```powershell
git commit -m "Release Cove V2.4 collection planner and capital intelligence"
git push origin main
```

6. Confirm Vercel's new deployment is Ready. Sign in and open Dashboard and Collection planner. Change the as-of date; confirm mature/settled/voided loan behavior. Test on a non-production workspace if new transactions are required.

## Quality status of this generated source

- Standalone **strict TypeScript ledger check**: passed.
- **24 automated tests passed; 1 historical private-seed test skipped**. V2.4 tests cover as-of, partial and full payments, void timing, loan maturity, aging, collection coverage, and a Node-based UI rendering smoke check.
- JavaScript syntax check: passed.
- Direct reconciliation against the supplied updated workbook: PHP 3,700 monthly contractual run rate, 2027-01-08 final scheduled date, PHP 35,850 assets and 89.26% utilization: passed.
- A **full Next.js production build and production dependency audit could not be run here** because the npm registry was unreachable. Both are required locally with `npm run check` and `npm audit --omit=dev` before pushing.
- No live Supabase integration or real-world lending transaction was performed by this patch.
