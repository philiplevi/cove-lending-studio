## V3.4 — Owner-controlled loan cancellation (October 24, 2026)
- Added **Cancel loan** to each current loan drawer, including imported loans when separately acknowledged.
- Does not hard-delete financial history. Requires real disbursement and refund verification, zero outstanding receipts, and a reason.
- Database procedure inserts a dated release contra-entry and audit snapshot atomically; it blocks unresolved payments, mapped transactions, loan extensions and linked cash outflows.
- Cancellation appears as **Cancelled** in the interface and remains within the existing Voided reporting filter; preserved V2.3 test-only void remains available for test entries.
- Changes to existing reports only take effect on the cancellation date; historical as-of positions remain unchanged.

## V3.2 — Portfolio asset-movement chart (October 2026)

- Restored **Factors increasing assets** directly on the executive dashboard, alongside existing collections/release comparisons.
- Shows opening portfolio assets, monthly capital infusions, interest cash receipts, cash outflows, closing portfolio assets, and any separately disclosed allocation-adjustment amount.
- Added All history / 12 months / 6 months controls, hover details, monthly audit table, and CSV export.
- Handles past-dated reporting, receipt reversals, loan voids, and months without transactions without creating or mutating ledger records.
- No database migration; retains the historical ₱8 principal/interest classification difference as a disclosed reconciliation item.

## V3.1 — Executive Dashboard & Portfolio Risk (2026-10-17)

- Rebuilt the lending dashboard around a high-priority financial overview, a readable capital and interest module, portfolio-quality panel, action-oriented collection queue, and source-backed charts.
- Principal-weighted PAR30, PAR60 and PAR90 **proxies** and five principal aging buckets. These exclude special renegotiation treatment unless the loan is past due; see definitions.
- Added active-borrower count, collection-coverage explanation and prioritized follow-up list. Kept historical interest reference inside a collapsible disclosure rather than displaying it as the headline.
- Preserved existing cashbook, transactions, V3 Operations Center, loan voiding and extensions. No SQL migration.
- WCAG-minded contrast and responsive typography with user-selectable as-of date.
- Added tests for PAR denominators, past-date behavior, settled/voided loans, and empty portfolios.

## V3.0 — Consolidated financial operations suite

- Loan servicing: as-of-safe due-date extensions, original term preservation, full contractual payoff quote; review-only interest waiver, renewal and restructure requests.
- Borrower statements with loan history, receipts and reversals, and print-to-PDF.
- Cash/bank/e-wallet account mapping with double-count prevention, bank statement reconciliation snapshots and explicit unassigned balances; does not mutate global ledger cash.
- Collection follow-up history, promise tracking and manual reminder drafts (no unsolicited external messages).
- Cash-basis income/expense segmentation, forward installment cash scenarios, and audit/export operations center.
- Additive owner-guarded and RLS-protected SQL migration; no change to imported records or original V2.3 loan void RPC.
- As-of-sensitive extension projection and explicit tests for history, reversals, voids, coverage and forecasts.
- Scope exclusions and secure release checklist: `UPGRADE_V3_0.md`.

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

## 2.4.0 — Capital & collection intelligence

- Added live active-capital summary panel, monthly contractual flat interest and latest due date of active loans, with separate cash-basis interest and legacy-source comparison.
- Added Collection planner with loan/borrower search, overdue, due today, next 7/30 day filters, partial-payment application and receipt action.
- Added contractual due coverage and four aging buckets to Insights & Reports.
- Added seven portfolio intelligence tests plus one render smoke test; retained V2.3 voided-loan logic and historical snapshots.
- No Supabase migration. Full local quality gate required before deploying to Vercel.

## 3.3.0 — Audited loan detail corrections
- Added **Edit loan details** to the loan drawer with borrower, product, principal, rate, term and repayment-date/frequency controls.
- Added an authenticated owner-only SQL preview/commit transaction, with optimistic concurrency and mandatory reason/confirmation.
- Regenerates loan schedule and recomputes receipt splits where required, preserving receipt amounts, dates and references and archiving all old values.
- Blocks incompatible corrections involving voided loans, approved extensions, mapped cash releases, or overpaid corrected contracts.
- Added correction audit history, UI, tests, and a staging-first release guide. Existing SQL migrations and imported source baseline are preserved.
