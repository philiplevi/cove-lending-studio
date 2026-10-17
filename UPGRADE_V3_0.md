# Cove Lending Studio V3.0 — Consolidated Upgrade

This is **one integrated V3.0 release** of the proposed V2.5–V3.0 roadmap. It is an additive upgrade from V2.4; do not create a new repository or import the spreadsheet again.

## 1. Back up first

- Download the existing `/api/backup` JSON, store it privately, and verify that you have a **recoverable Supabase database backup**, not just a JSON export. Test a restore in a separate environment when possible.
- Confirm the V2.3 loan-voiding migration is installed and your prior sample test loan is already handled.
- Never place `.env.local`, actual borrower records, bank statements, CSV exports, JSON backups or secret keys in the source repository.

## 2. Install the additive SQL migration

**Use a Supabase staging/project clone first if available.** Apply only:

`supabase/migrations/202610170002_cove_v3_operations.sql`

Run it in **SQL Editor** against the same database that hosts Cove V2.4, **after** `202610090001_cove.sql` and `202610170001_void_test_loans.sql` have been applied. This migration creates new operations tables, RLS select policies, and an owner-checked `cove_operations` RPC. It does not rewrite loans, receipts, source installments, cash totals or existing history. Do not rerun the old migrations.

## 3. Apply the source update

- Unzip the **V3.0 Update** into your existing `C:\Cove_Lending_Cloud_V2_Source` folder, replacing only the supplied source files.
- **Keep** `.git/`, `.env.local`, and `package-lock.json` (unless npm itself updates the lockfile).
- `npm install --include=dev` should update `package-lock.json` for the new version number. Use your currently configured Supabase environment and project; **do not** recreate a user or reimport old loans.

### Mandatory local release gate — do not push on failure

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
git status --short
```

`npm run check` includes strict TypeScript, all automated tests and `next build`. Confirm V2.4 checks continue to pass. The tests require Node with `--experimental-strip-types`; Node 24 is recommended and was used in the existing Cove VS Code setup.

### Stage **all** V3.0 files (including new files)

```powershell
git add -- package.json README.md CHANGELOG.md ARCHITECTURE.md lib/ledger.ts lib/management.ts app/api/[...path]/route.ts app/api/operations/route.ts app/studio/page.tsx app/studio/command/page.tsx app/studio/command/command.css supabase/migrations/202610170002_cove_v3_operations.sql tests/v3-operations.test.mjs UPGRADE_V3_0.md V3_0_RELEASE_MANIFEST.json
git add -- package-lock.json
git diff --cached --check
git diff --cached --name-only
git ls-files --others --exclude-standard
```

The `git ls-files --others` result may contain local unrelated files such as `README.txt`; **do not stage them**. Confirm the new migration, route, UI, helper and test file all appear in the staged list. Inspect before commit. Then:

```powershell
git commit -m "Release Cove Lending Studio V3.0 operations suite"
git push origin main
```

Vercel deploys from main. Check build logs; if it fails, retrieve them before making speculative changes. If the SQL migration is not applied, `/studio/command` correctly reports operations unavailable.

## 4. Live acceptance checks (use staging/sample transactions first)

| Area | Test | Expected |
|---|---|---|
| Overview | Open `/studio/command` and select October 16, 2026 | Existing baseline remains cash ₱3,850; principal ₱32,000; monthly contractual interest ₱3,700; final active due Jan 8, 2027, if the underlying live dataset has not changed |
| Borrower statements | Select a borrower and Print / Save as PDF | Original loan records, posted receipts **and reversals** remain visible |
| Early settlement | Open payoff quote | Full remaining contractual amount only; **no waiver auto-applied** |
| Loan extension | Make one staging loan and record an approved 1–365 day extension | As-of **before** extension keeps original schedule; current as-of moves future dates; principal, interest, cash unchanged |
| Cash accounts | Create Bank or E-wallet and assign known transactions | Global cash ledger unchanged; unassigned transactions and unmatched total remain visible |
| Reconciliation | Enter a verified balance | Saves actual, mapped and difference; **does not post balancing transactions** |
| Collection follow-ups | Record a contact, copy draft reminder | Audit log records action; **nothing is automatically sent** |
| Forecast | Change 6-month percentage scenario | Scheduled unpaid installment totals scale transparently; no credit scoring, AI prediction or assumed new loan releases |
| Audit/export | Download raw ledger snapshot and operations JSON | Privacy maintained; **not a complete database restore** |
| Legacy integrity | Review original 2026 variance | Historic ₱8 allocation difference and imported duplicated receipt reference are not silently changed |

## 5. What is and isn't automated

**Working/implemented in source:** payoff quote, borrower statement with browser print/PDF, owner-guarded extensions (one per loan), review-only servicing requests, account tagging and statement reconciliation, collection follow-up log, manual reminder draft, cash-basis margin analysis, forecast scenarios, private operations export, audit entries and no-loss as-of projection.

**Not implemented or requiring external configuration:** automatic email/SMS dispatch and consent management; interest waivers posted to ledger; loan renewals that disburse new funds; multi-step restructures; interaccount cash transfers; automatic bank integration; Supabase scheduled managed backup/restore; MFA policy rollout; AI underwriting or default probability; regulator-specific accounting/tax reporting. These require explicit business rules, integration credentials, and/or authorized approvals. V3 **does not pretend to do them**.

Financial safeguards: Do not use draft servicing notes as approved contract changes. A due-date extension shifts the outstanding future installment dates **without changing interest**, retaining original terms and audit record. Current SQL limits one extension per loan until full schedule-versioning is separately validated. Never test new finance operations directly with actual borrower cash flows.

## 6. Known verification boundary

The build machine used to prepare this package could not access the npm registry. Node automated tests and standalone strict TypeScript checks passed, and the October 16 private seed was replayed as an **offline read-only** check. A full Next.js build and a live Supabase migration/transaction test **must** run in your VS Code/Supabase environment before deployment.
