# Changelog

## 2.2.0 — Premium user experience

- Redesigned executive dashboard with dark teal + emerald visual identity, portfolio asset banner and six meaningful lending KPIs.
- Added dedicated Collections register: search, month/reversal filters, loan links, CSV export and existing post-payment workflow.
- Added cashflow chart 6M/12M controls, portfolio concentration and overdue attention summary.
- Simplified menu labels, improved mobile navigation/overlay, keyboard-friendly loan row access and form legibility.
- Improved reconciliation messaging for workspaces without an imported baseline and detected repeated source receipts more precisely.
- Added UI contract checks. Ledger, authentication endpoints, and database schema are unchanged.
- Full Next.js production build requires local `npm run check` before pushing.

# Changelog

## 2.1.0 — Source stabilization
- Same-origin Next.js auth handler fixes dependency on browser-to-Supabase signup fetch.
- Public read-only health endpoint but exposes only connection status and safe error descriptions.
- Corrected strict TypeScript errors in ledger and Supabase cookies.
- PostCSS `^8.5.23` npm override without upgrading Next to 16.
- Added authentication diagnostics unit tests, pre-push validation and GitHub Actions workflow.
- Improved ignored temporary and private files; retained Supabase schema and data import protocol.

### Must verify before production rollout
Full dependency installation, Next.js type-check/build and vulnerability audit **were not runnable from the generation environment without npm registry access**. Run `npm install --include=dev`, `npm run check`, and `npm audit --omit=dev` on a connected local machine. Then validate real Supabase signup and workspace creation.

## 2.3.0 — Atomic void test loan and receipt reversal (2026-10-17)

- Added V2.3 additive SQL migration with `loan_voids` journal and owner-only atomic `cove_void_test_loan` RPC.
- Voids remaining receipts (once) and offsets original release without physical deletion or retroactive editing.
- Introduced clear user confirmation, read-only void preview, audit events, and voided loan status.
- Reconciles principal, overdue, cash, reporting, monthly cash bridge, and as-of histories with void entries.
- Added defensive tests for voided loan cash math, already-reversed receipts, and integration contract.
- SQL migration must be applied before the V2.3 code is deployed. Live Supabase integration testing is still required.
