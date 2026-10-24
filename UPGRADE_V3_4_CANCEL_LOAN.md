# Cove Lending Studio V3.4 — Cancel Loan

This is a **drop-in upgrade for Cove 3.3**. It retains the existing test-only loan void function and adds **Cancel loan** to the loan details drawer for erroneous entries, including imported loans.

## What the feature does

- **Cancel loan** adds a dated reversal of the original loan release, making current principal and contractual receivables zero. The original loan, installments, corrections and receipt history remain in the database.
- All positive receipts must first have **matching, individually audited reversals**. The new cancellation action does **not** refund money or automatically reverse actual payments. Verify that any received cash was physically returned before reversing those receipts.
- Owner must document a reason, confirm the exact loan ID, and declare whether the principal was *never disbursed* or *returned in full*. Imported loans require another explicit acknowledgement because cancellation changes reconciliation with the original workbook.
- If the loan or any receipts are mapped to bank/cash/e-wallet accounts, have approved extensions, or have outflows referencing the loan ID, cancellation is blocked pending reconciliation.
- Historical reports as of a date **before** cancellation retain the old loan. Present-day balances use the dated reversal. **This is not a restatement of historical postings.**
- An existing `loan_voids` table is reused with additional metadata. Underlying ledger status remains `Voided` for financial reporting; the UI shows `Cancelled` for administrative cancellations. The Loans filter **Cancelled / voided** includes both.
- It is deliberately **not possible to permanently delete** posted financial records from this UI.

## Deployment — preserve current workspace

1. Verify you have a recoverable Supabase database backup and export the Cove ledger. Test the procedure on a **separate staging Supabase project** before applying it to production.
2. Copy the files from the upgrade ZIP into the root of `C:\Cove_Lending_Cloud_V2_Source`, retaining `.git`, `.env.local`, and your `package-lock.json`.
3. Apply `supabase/migrations/202610240001_cancel_loans.sql` to staging Supabase first, after the V3.3 migration. Verify all constraints, permitted accounts, and rollback cases. Then apply the exact migration to production. Do **not** rerun earlier database migrations or paste live credentials into VS Code/GitHub.
4. In VS Code, run the full local checks:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
```

5. Stage only Cove V3.4's required paths (new files **must** be included):

```powershell
git add -- "app/api/[...path]/route.ts" app/studio/premium.css lib/ledger.ts public/studio-app.js
git add -- package.json CHANGELOG.md UPGRADE_V3_4_CANCEL_LOAN.md V3_4_RELEASE_MANIFEST.json
git add -- supabase/migrations/202610240001_cancel_loans.sql tests/loan-cancellation.test.mjs
git add -- package-lock.json
git diff --cached --check
git diff --cached --name-only
git status --short
git ls-files --others --exclude-standard
```

Do **not** stage personal data, `.env.local`, `preview*.html`, `test/` from Kitchen Stack, or other unrelated files. Include `package-lock.json` if it changed from dependency installation.

6. Only after all checks, staged-file review, and **staging database tests** pass:

```powershell
git commit -m "Release Cove V3.4 audited loan cancellation"
git ls-tree -r --name-only HEAD -- supabase/migrations/202610240001_cancel_loans.sql tests/loan-cancellation.test.mjs
git push origin main
```

7. Verify Vercel's build is **Ready**. Open **Loans → select loan → Cancel loan** and test first with a newly created *unpaid test loan* in a controlled environment. Confirm the cash bridge, principal, audit journal, and earlier as-of values before using the feature on real records.

## Supabase read-only migration verification

In the Supabase SQL editor, after applying the V3.4 migration:

```sql
select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='loan_voids'
 and column_name in ('void_kind','cash_disposition');
select proname from pg_proc where proname='cove_cancel_loan';
```

Both new columns and the `cove_cancel_loan` function should exist. If migration fails, stop and review the error; do not manually delete loans or create the missing table by hand.

## Acceptance test scenarios (staging only)

- **Never funded**: create a loan, do not post receipts, cancel it with "Never disbursed". Ensure original gross release and counter-entry remain, but current principal and gross balance become ₱0.
- **Receipts exist**: attempt to cancel a loan with a live receipt; verify it is blocked. After funds are actually refunded or confirmed fictitious, reverse each receipt using the existing audit-linked **Reverse** action; then cancel.
- **Imported loan**: verify a separate imported-loan consent is mandatory. The baseline discrepancy should remain visible in Data Integrity.
- **Mapped cash account**: assign a loan release to a cash account; verify cancellation is blocked.
- **Historical as-of**: compare reports before and after cancellation date; prior period should not be silently restated.
- **Duplicate attempt / race**: refresh and try cancelling twice; procedure must reject the second request.
- **Permissions**: only workspace owners may perform the procedure.

**Important:** The code checks recorded receipts and mappings, but it cannot verify whether physical cash was disbursed or returned. That remains a manual control and must not be falsely confirmed. SQL migration and UI have not been exercised against your live Supabase instance here; verify on staging before production use.
