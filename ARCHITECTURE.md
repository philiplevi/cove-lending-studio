# Cove Lending Studio 2.1 Architecture

**Source refresh:** The V2 database, financial ledger and imported records remain compatible. Authentication now uses the same-origin `/api/auth` route and `/api/health` connection diagnostics. See `README.md` for the verified upgrade sequence.

# Cove Lending Cloud — Technical Architecture

```text
Browser (HTTPS)
  |
  +--> Vercel / Next.js
  |       /login     Supabase email-password Auth
  |       /studio    Existing Cove Premium dashboard
  |       /import    One-time private seed upload
  |       /api/...   Session verification and report projections
  |
  +--> Supabase Auth cookie (SSR refresh through middleware)
            |
            v
      Supabase PostgreSQL
        Workspace/Membership (RLS isolation)
        Borrowers + Products
        Loans + Installment schedules
        Payments + correction entries
        Capital + Cash outflows
        Audit log + frozen original baseline
        cove_post RPC          atomic validated writes
        cove_import_legacy RPC one-time transactional import
```

## Trust boundaries

1. Browser Supabase key is **publishable** and never confers cross-tenant DB rights.
2. Every report API request verifies `auth.getUser()`, retrieves an RLS-filtered workspace membership, and applies the workspace ID to all data queries.
3. Direct client table writes are excluded by RLS (SELECT-only policies). Financial mutations are PostgreSQL procedures that demand owner membership, coordinate with an advisory transaction lock, validate amounts in centavos, and insert an audit entry in the same transaction.
4. Historical import is owner-only, idempotence-protected, and all-or-nothing. The seed is distributed separately from source code and is deliberately Git-ignored if placed in `private_import/`.
5. The legacy interface is served as static JS while Next.js handles its authentication and API boundary. A future UI refactor can port it fully to React components without changing the SQL accounting engine.

## Financial invariants

- `cash = sum(capital) - sum(loan releases) + sum(payment receipts including reversals) - sum(outflows)`.
- `principal outstanding` is capped per loan at zero, preventing historical negative principal allocations from reducing other loans' receivables.
- `gross receivables` reflect contracted payable minus actual receipts, not principal alone.
- `assets = cash + principal outstanding`; do **not** capitalize unearned contractual interest as a current asset.
- `amount = allocated principal + allocated interest`, contract limits enforced on **new** payments.
- `reversals` are immutable new negative entries; original receipts are retained.
- `term × flat monthly rate` determines contract interest as in the workbook; APR/EIR is **not** calculated here.

## Known before-launch work

- Apply migration to NEW Supabase project, sign up owner, private seed import, compare frozen totals, test write/reverse/refresh/logout, and exercise RLS with account B.
- Configure email confirmation, signup rules, MFA and tested backups.
- Replace pure Node read aggregation with server-side SQL aggregates before large-scale deployments.
- Add account-level cash balances and a general ledger before regulatory/accounting reliance.

## Scope of automated testing

The pure reporting tests exercise cash, payable, outstanding principal, historical as-of dates, reversals, and imported historical totals. They do **not** execute Postgres migrations or browser/API integration; production release requires those separately.


## V3.0 extension

`lib/management.ts` holds pure, read-only statement/forecast/cash-basis logic. `/studio/command` is a separate authenticated Next.js client screen. `/api/operations` uses the existing Supabase owner context and the single-transaction PostgreSQL `cove_operations` function from migration `202610170002`. `loan_extensions` provides as-of-effective future due-date shifts without modifying the `installments` or `loans` source records. `cash_allocations` is a memorandum classification table: it never changes cash balances. See `UPGRADE_V3_0.md` for scope boundaries.
