# Cove Lending Studio V2.3 — Audited Void Test Loan

## What this release changes

- Adds **Void test loan** to the loan detail drawer for **New entry** loans only (never imported/historical loans).
- Handles any unreversed test collection receipts and the original loan release **in one atomic PostgreSQL transaction**.
- Adds loan ID re-entry, a 10–500 character reason, an explicit **test-only / no unsettled real money** confirmation, and protection against stale receipt data.
- Retains every loan, installment, receipt, reversal, and audit event. A separate `loan_voids` record cancels the original disbursement on the current **Philippine date**.
- Excludes voided loans from current receivables, overdue balances, portfolio exposure, and loan-availability selectors while retaining the original agreement and history.
- Cashbook records **gross releases** and **voided loan release reversals** separately. Net loan releases = gross releases minus voided releases.
- Supports historical **as-of** views before the void date. It does **not** retroactively rewrite the September/October transactions.

**Never use this workflow for a real loan where money was actually released or collected and not separately resolved in bank/cash records.** It is designed for test-only or mistaken entries with *no unsettled real cash movement*. Formal loan cancellation/refund/write-off is a different workflow.

## Order of operations (important)

1. **Download a snapshot** of your current ledger while signed in: `/api/backup`. Keep it somewhere private. This is a data export, NOT a substitute for a Supabase database backup or point-in-time restore. Ensure Supabase backups are available separately.
2. Go to your **existing** Cove project in Supabase → **SQL Editor** and run **only** `supabase/migrations/202610170001_void_test_loans.sql`. Do NOT rerun the original `202610090001_cove.sql` migration and do not clear the database.
3. Copy the V2.3 files into your existing VS Code project **without touching `.git`, `.env.local`, or your private import files**.
4. Run the full local quality gate:
   ```powershell
   npm install --include=dev
   npm run check
   npm audit --omit=dev
   git diff --check
   git status --short
   ```
   Confirm the build, tests, and audit pass. The historical private-seed test may skip unless you have supplied it locally.
5. Stage modifications **and explicitly include new files**:
   ```powershell
   git add -u
   git add -- supabase/migrations/202610170001_void_test_loans.sql tests/void-loan.test.mjs UPGRADE_V2_3_VOID_LOAN.md
   git diff --cached --check
   git diff --cached --name-only
   ```
   Verify `supabase/migrations/202610170001_void_test_loans.sql` and `tests/void-loan.test.mjs` appear in the staged list. Do not commit borrower JSON, `.env.local`, or unrelated untracked files.
6. Then:
   ```powershell
   git commit -m "Release Cove V2.3 atomic test loan void"
   git push origin main
   ```
7. Verify Vercel reports **Ready**. Open Cove → Loans → your **test** loan → **Void test loan**.

## Safe reversal sequence (all steps inside ONE database transaction)

- Confirm current loan ID, original principal, source (`New entry`), and all outstanding collection receipts. Imported loans are rejected.
- Reject stale data if the receipt list or loan amount changed after the user opened the confirmation.
- Insert a negative reversal record for each **unreversed** receipt on the current Philippine date, with a link back to the original receipt and a separate audit entry. Previously reversed receipts are not reversed again.
- Insert one `loan_voids` row reversing the cash effect of the original release and recording who, when, why, and how many receipts were reversed.
- Recalculate cash balance. Any validation error or negative resulting fund cash **rolls the whole database transaction back**. Nothing is partially voided.

### Example (illustrative, not your real numbers)

A fictitious ₱5,000 loan with two test collections of ₱550 and ₱300:

| Financial effect | Cash change |
| --- | ---: |
| Original loan release | −₱5,000 |
| First test collection | +₱550 |
| Second test collection | +₱300 |
| Reversal of first collection | −₱550 |
| Reversal of second collection | −₱300 |
| **Void loan release** | **+₱5,000** |
| **Net effect of test cycle** | **₱0** |

The original loan and receipt numbers remain in the transaction history and audit trail.

## Acceptance checks (before trusting the feature)

- Loan disappears from the **active** count, receivables, overdue, and upcoming collections; status becomes **Voided** under Loans → Voided.
- Original loan and receipt details are still visible, with signed reversal receipts.
- Cashbook shows the void release and negative receipt reversals; net effect of the whole test cycle is **zero**.
- Current cash + outstanding principal returns to the value before the test loan, **unless unrelated real transactions occurred meanwhile**.
- Historical as-of date before the void still displays the original pre-void loan and payments.
- Repeated attempt to void the same loan fails; imported loans cannot be voided using this test-only workflow.
- No loan can receive a new payment after voiding.
- View audit events for `REVERSE / payment` and `VOID / loan`.

## Verification limits

The new ledger and UI contract tests run with `npm run test:quality`. A live Supabase SQL migration and authenticated RPC integration test must be performed in your test workspace before using the feature for production cleanup. Do not assume the migration is applied until SQL Editor reports success. Use a test borrower/loan, not an imported loan, for the acceptance test.

## Rollback

If the new frontend has issues, you can redeploy your prior V2.2 Git commit; the additive SQL migration can remain installed. Do **not** delete the `loan_voids` table or manually remove reversal receipts once a void is posted. Use a documented accounting correction procedure if the cancellation was itself inappropriate.
