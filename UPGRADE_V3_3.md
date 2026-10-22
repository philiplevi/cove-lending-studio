# Cove Lending Studio V3.3 — Audited Loan Corrections

## Why this version exists

Some loans are encoded with incorrect borrower, product, amount, interest rate, term, release date, first installment date, or repayment frequency. V3.3 adds **Edit loan details** to the existing loan drawer. The correction rebuilds the contract and schedule **from origination** and calculates the corresponding ledger balances, without creating a second loan or changing receipt amounts.

## Safety model

1. Owner-only: corrections can be previewed and confirmed only through authenticated server routes and workspace-scoped Supabase RPCs.
2. First click is **Preview recalculation**; preview never changes the database. Second click requires the exact loan ID and a restatement acknowledgment.
3. All changed loan terms, old and regenerated installments, allocation changes, reason, actor, and time are archived in `loan_corrections` and `audit_log`.
4. Existing receipt IDs, dates, paid amounts, references, and reversal links remain unchanged. Unreversed receipts retain their principal/interest split when possible; only allocations that no longer fit the corrected contract are changed and archived.
5. Corrections that produce total payments greater than the corrected total payable are rejected. Correct the receipts first if needed.
6. Voided loans and loans with an approved extension are blocked. A loan release already mapped to a cash/bank/e-wallet account cannot have its principal or release date changed until the mapping is properly addressed.
7. Increasing principal is blocked if its additional amount exceeds current fund cash.
8. This is a **historical restatement**: as-of figures are rebuilt using corrected origination data, including prior months. Original financial values are available in the correction audit journal and previously saved exports. This is not the same as booking a new disbursement today.
9. Imported loan records may be corrected with an explicit reason. Their original import baseline is not rewritten and may then show reconciliation differences.
10. The underlying interest formula is unchanged: `principal × monthly flat rate × contract months`, with centavo rounding; installment splitting follows existing Cove loan-creation rules.

## Stage 0 — Back up your live lending records

Before SQL, export the current Cove ledger JSON at `/api/backup` while signed in and confirm a **recoverable** Supabase database backup/snapshot. This JSON export is not a complete PostgreSQL backup.

Run the SQL migration in a **separate Supabase staging project first** with anonymized test loans and test receipts. This update changes historic financial amounts and must be accepted before production use.

## Stage 1 — Database migration

In Supabase SQL Editor, execute exactly:

`supabase/migrations/202610220001_loan_corrections.sql`

Apply it **after** all V3.0 migrations. Don't rerun the V2 initial schema or reimport historical loans. The migration adds `public.loan_corrections`, `public.cove_plan_loan_correction`, and `public.cove_correct_loan` and refreshes the API schema cache. It does not change any existing loan when installed.

Verify after running:

```sql
select to_regclass('public.loan_corrections') as table_name;
select proname from pg_proc where proname in ('cove_plan_loan_correction','cove_correct_loan');
```

## Stage 2 — Update existing VS Code project

Extract `Cove_Lending_V3_3_Loan_Correction_Upgrade.zip` into the **existing** project folder, preserving `.git`, `.env.local`, and all private data.

Files updated:

- `app/api/[...path]/route.ts`
- `public/studio-app.js`
- `app/studio/premium.css`
- `lib/ledger.ts`
- `package.json`

New files:

- `supabase/migrations/202610220001_loan_corrections.sql`
- `tests/loan-corrections.test.mjs`
- `UPGRADE_V3_3.md`
- `V3_3_RELEASE_MANIFEST.json`

## Stage 3 — Mandatory local quality gate

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
```

A passing local build is necessary but not sufficient: run a staging Supabase RPC test with a loan with payments, a payment reversal, a mapped account, and an imported loan before enabling this on real records.

## Stage 4 — Commit ALL new and updated files

```powershell
git add -- "app/api/[...path]/route.ts" public/studio-app.js app/studio/premium.css lib/ledger.ts package.json
git add -- supabase/migrations/202610220001_loan_corrections.sql tests/loan-corrections.test.mjs UPGRADE_V3_3.md V3_3_RELEASE_MANIFEST.json
git diff --cached --check
git diff --cached --name-only
git status --short
```

Review staged paths carefully. Don't commit `.env.local`, borrower JSON backups, preview HTML or sensitive ledger exports.

```powershell
git commit -m "Release Cove V3.3 audited loan corrections"
git ls-tree -r --name-only HEAD supabase/migrations/202610220001_loan_corrections.sql tests/loan-corrections.test.mjs
git push origin main
```

## Stage 5 — Acceptance test

In a test workspace, create a loan of ₱10,000 at 10% for one month with two installment dates. Post a ₱3,000 receipt split ₱2,500 principal and ₱500 interest. Edit interest rate to 5%, leave principal at ₱10,000, and preview. The preview should show:

- Corrected total payable: ₱10,500.
- Recorded receipt amount remains ₱3,000.
- Only necessary receipt allocation changes, if any.
- Corrected remaining payable: ₱7,500.
- A loan-correction audit record with before and after values.

Then test reducing principal, reversing a receipt, a fully settled loan, and a cash-account-mapped loan; validate cash and principal on the dashboard and compare old and regenerated schedules.

**Important:** A successful database migration and dashboard load do not prove the financial procedure handles every production edge case. Keep backups and validate in staging before actual use.
