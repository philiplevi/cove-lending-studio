# Cove Lending Studio V3.7 — Owner Capital & Legacy Allocation Correction

## What changed

- Keeps the current premium off-white, deep-teal, emerald palette and existing modules.
- **Asset source mix** shows a compact owner capital calculation: gross capital infused (including external borrowing), *less originally borrowed capital*, less *owner withdrawals*, equals net owner capital. The gross borrowed amount is different from the remaining borrowed liability after repayments.
- Shows a **signed funding composition** chart beside the calculation, with retained cash-basis lending earnings, outstanding borrowed capital, and net owner capital. Negative owner capital remains negative—no fabricated ownership percentage or deceptive doughnut.
- Keeps the asset-development chart, collection planner, loan correction/cancellation, and the separate Financial Statements module.
- Removes the small historical reconciliation line from the Asset Source Mix dashboard card. **Data Integrity and Financial Statements continue to surface real differences until they are corrected.**
- Includes a **separate, optional** preview and manually applied repair for eight verified 2025–2026 imported receipt allocations. The repair is *not run by installing the code*.

## Accounting definitions

- Gross capital infused = the sum of capital transactions, **including borrowed money**.
- Borrowed capital introduced = cumulative contributions labeled Loan / Borrowed / Borrowed capital / External borrowing, regardless of amounts repaid.
- Owner withdrawals = cash outflows explicitly classified **Owner withdrawal** / **Owner drawing** / **Owner capital return**, **not** all expenses or debt repayments.
- Net owner capital = gross capital infused - borrowed capital introduced - other unclassified funding - owner withdrawals. When all infusion sources are properly classified, this reduces to: gross - borrowed - owner withdrawals.
- Outstanding borrowed capital = borrowed capital introduced - repayments of debt principal.
- Retained lending earnings = actual interest collected - classified operating expenses - financing charges (cash basis; does not estimate taxes, accruals, impairment or expected credit losses).
- Funding balance can be signed: if net owner capital is negative, show it as negative. This is **not** the same as owner percentage of assets; the composition chart is a set of signed balances, not a percentage pie.
- A remaining reconciliation balance is *not* automatically treated as revenue or capital, and remains reviewable outside the dashboard.

## Reconciliation of the inherited ₱8 variance

An analysis of the source imported October 16, 2026 ledger found **eight loans** where recorded principal allocations exceed contractual principal by ₱1 each, with matching ₱1 shortages in interest allocation. Cash amounts and gross amounts were correct.

On the October 16 example, *if all eight source receipts are verified and reclassified*:

| | Before | After |
| --- | ---: | ---: |
| Cash | ₱3,850 | ₱3,850 |
| Principal outstanding | ₱32,000 | ₱32,000 |
| Total portfolio assets | ₱35,850 | ₱35,850 |
| Interest collected (ledger) | ₱45,592 | ₱45,600 |
| Allocation/reconciliation difference | ₱8 | ₱0 |
| Loan allocation exceptions | 8 | 0 |

This is **not a new cash transaction, revenue deposit, or write-off**. It reallocates the original eight receipt components by one peso each. Receipt IDs, gross receipt amounts, dates and loan contracts are unchanged. Historical as-of reporting of allocations WILL be restated (with audit records explaining why); this is different from an adjustment posted on a new date.

### Production safeguards — required before applying the optional repair

1. Export a read-only ledger snapshot and verify a restorable Supabase database backup. A JSON export is **not** a SQL backup.
2. In the **correct Supabase project**, run **`sql/legacy_8_allocation_preview.sql`**. It must return **eight READY rows for one workspace**, one per identified original loan/receipt pair.
3. Check the original source receipts and confirm the last receipt split genuinely should shift ₱1 **from principal to interest** on each loan. If any original receipt shows a different allocation or the pattern changed, **do not run the apply script**; use your audited correction workflow instead.
4. Validate both scripts in a staging copy of your actual database. Review and authorize the correction.
5. **Only after approval**, manually execute `sql/legacy_8_allocation_apply_REVIEW_FIRST.sql` once in Supabase SQL Editor. It locks, validates all eight targets and records individual before/after audit entries in `audit_log`. Any mismatch aborts the entire transaction.
6. Check Data Integrity and a statement dated October 16; confirm the expected changes. The duplicate historical external receipt reference is a **separate issue** and remains visible until independently investigated.

**Never run the optional correction automatically as part of a deployment or scheduled job.** Its execution from the SQL Editor records a manual method with a null `actor_id` (the SQL Editor is an administrator connection), and the pre/post evidence should be retained with the approval record.

## Install the code patch

Extract `Cove_Lending_V3_7_Asset_Source_and_Legacy_Reconciliation_Patch.zip` into your current Cove V3.6 workspace, without overwriting `.git`, `.env.local` or borrower data. The ZIP contains changed source files and new tests.

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
```

Before GitHub push, review all staged and untracked files, including new tests and SQL **as documentation only**:

```powershell
git add -- package.json lib/financial-statements.ts public/studio-app.js app/studio/asset-sources.css
git add -- tests/v37-owner-asset-sources.test.mjs
git add -- sql/legacy_8_allocation_preview.sql sql/legacy_8_allocation_apply_REVIEW_FIRST.sql
git add -- README.md CHANGELOG.md UPGRADE_V3_7.md V3_7_RELEASE_MANIFEST.json
git diff --cached --check
git diff --cached --name-only
git status --short
git ls-files --others --exclude-standard
```

Do **not** stage any private imported borrower data, `.env.local`, `node_modules`, the Kitchen Stack project files, or local previews. Keep existing `package-lock.json` if npm has not changed dependencies; examine any lockfile changes independently before staging.

After review and quality checks:

```powershell
git commit -m "Release Cove V3.7 owner capital mix and audited legacy reconciliation tools"
git push origin main
```

**No Supabase schema migration is needed** for the dashboard. The optional **data correction** is a separate, manually approved database action.

## Acceptance checks

- The dashboard shows owner capital contributions separately from borrowed funding, and owner withdrawals separately from operating costs and repayment of borrowed principal.
- Negative owner capital is correctly displayed, with both positive and negative signed bars.
- All portfolio assets/cash/principal figures are unchanged by deploying the UI patch.
- The original loan-level and asset-development charts remain visible.
- Data Integrity still reports true exceptions; the ₱8 disappears only after an approved, fully validated allocation correction.
- Financial Statements remain a separate module and report interest correctly for each selected period.
