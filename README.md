# Cove Lending Studio — Cloud Edition (V2)

A **deployment-ready source project** for a private personal lending operations workspace. This is a Next.js frontend and API layer backed by Supabase PostgreSQL. It reuses the tested V1 premium interface, adds Supabase authentication, database row-level isolation, and **atomic financial posting functions**. **It has not yet been deployed or tested against a live Supabase project.**

## What's inside

- Dashboard — portfolio assets, cash, principal and gross receivables, collections, releases, realized interest, active/overdue loans, product mix, cash-flow movement, borrower concentration, upcoming collections
- Loan ledger — product interest rates, contract installments, balances, individual repayment history, loan origination
- Borrowers — permanent client IDs and aggregate exposure
- Cashbook — fund inflows, releases, collections, expenses, withdrawals, financing costs
- Intelligence — collection and lending patterns, interest received, portfolio concentration
- Data integrity — frozen workbook comparison, audit journal, allocation exceptions, source receipt collisions, read-only JSON extracts
- Owner login — Supabase Auth (email/password) and protected routes
- Security — RLS `SELECT` restricted to workspace membership; direct table writes denied by RLS; signed-in owner mutations through database `SECURITY DEFINER` procedures; reversible receipts (not destructive deletes)
- One-time private import — separate historical JSON with 4 borrowers, 4 products, 34 loans, 79 receipts, 6 capital entries, 13 outflows

## Deploy to your existing accounts (no Python required)

### A. Create a dedicated Supabase PROJECT (under your existing Supabase account)

1. Create a **new private Supabase project**, in a suitable region. A separate project avoids modifying schemas and authentication triggers in your other applications.
2. Open **SQL Editor** and execute `supabase/migrations/202610090001_cove.sql` as a single migration. Review the SQL first. It adds an `auth.users` trigger that creates a workspace and four loan products when a **new user** signs up.
3. Open **Project Settings → API**. Retrieve your Supabase **Project URL** and **publishable / anon key** (not the service-role key).
4. Under **Authentication → URL Configuration**, set Site URL to your future Vercel domain; include appropriate redirect URLs. Enable email authentication. If you use email confirmation, configure SMTP/allowlist appropriately.
5. Create your own first user through the application's signup page. Then **disable public self-signup** in Supabase Auth settings or limit registration to administrator-controlled invites, so random people cannot create new empty workspaces. Enable MFA for the owner when you configure it, and verify your project's email settings.

### B. Push the code to a PRIVATE GitHub repository

- Extract the **source ZIP** to a **personal** computer. The actual borrower data is provided as a **separate JSON download**, intentionally NOT contained in the source ZIP. If you place it under `private_import/`, Git will ignore that folder. Do not upload the private JSON to GitHub.
- Run `npm install` and `npm run dev` if testing locally (Node.js 20+ recommended).
- Configure environment variables locally via `.env.local` (copy `.env.example`). Never commit `.env.local` or a Supabase service-role key.
- Use your existing GitHub workflow to commit and push the project. **Keep repository visibility PRIVATE.**

### C. Deploy on Vercel

1. Import the GitHub repository into Vercel.
2. Select framework **Next.js** and use default build `npm run build`.
3. Set the following Vercel environment variables for Production and Preview:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-project-publishable-key
   ```

   The publishable key is designed for browser access; **RLS must be enabled and correct**, which is why the migration is required.
4. Deploy, then update your Supabase Auth Site URL to the canonical deployed HTTPS domain.
5. Sign up and sign in at `/login` using your owner account.
6. Open `/import`. Upload the **separately downloaded `Cove_Lending_Private_Import.json`** **directly through the authenticated browser**. This transfer is only to your signed-in application; the file is not stored in public site assets or your Git repo. The database migration is all-or-nothing and import is allowed only once into an empty ledger.
7. Open the **Data integrity** section and verify the **October 8, 2026** totals below before posting any new transactions.

### Imported control totals (historical as of 2026-10-08)

| Financial measure | Imported source |
|---|---:|
| Capital infusions | ₱37,000 |
| Loans released | ₱219,000 |
| Collections | ₱236,100 |
| Other outflows | ₱52,750 |
| Cash balance | ₱1,350 |
| Outstanding principal by loan | ₱27,083 |
| Gross receivables including contract interest | ₱35,200 |
| Collected interest per receipt ledger | ₱44,176 |
| Cash + outstanding principal | ₱28,433 |

**Preserved exceptions:** Monthly summary shows ₱27,076 principal and ₱44,183 interest; seven loans have historical ₱1 principal over-allocation; duplicate source receipt reference `R000024` is retained as two distinct entries; `LN0031` exceeds its regular loan product limit. These have NOT been silently corrected. Confirm against original bank/GCash statements before treating the migration as final.

## Files and responsibilities

| Path | Purpose |
|---|---|
| `app/studio/` | Premium V1 dashboard shell embedded in Next.js |
| `public/studio-app.js` | Original chart/dashboard and data-entry front end |
| `app/api/[...path]/route.ts` | Authenticated API that maps V1 calls to Supabase |
| `lib/ledger.ts` | Read-only report projections in integer centavos |
| `supabase/migrations/202610090001_cove.sql` | DB tables, RLS, Auth workspace bootstrap, atomic posting and import procedures |
| `app/login/` | Email/password login and initial registration |
| `app/import/` | Authenticated one-time historical import UI |
| Separate `Cove_Lending_Private_Import.json` download | Borrower PII and transactions; **not included in source ZIP / repository** |
| `tests/ledger.test.mjs` | Financial snapshot, historical reconciliation and reversal tests |

## Current limitations — read before using real money

1. **Not yet production validated.** Database migration and browser-to-Supabase integration still require a live environment and end-to-end QA. The Next.js build could not be verified here because npm package registry access was unavailable. Pure ledger unit tests did pass.
2. **Role model** initially provides one owner per private workspace. The RLS design supports members, but the staff-invite/approval interface is not implemented. Self-service signup should be disabled after registering the owner.
3. **Financial basis** follows the workbook's flat monthly interest model and manually split principal/interest receipts. This is not full accrual accounting or an independently audited GL. Backdated operations use a current-cash check; point-in-time cash insufficiency warnings are not yet implemented. Payment schedules use 15-day increments for semi-monthly loans.
4. **Portfolio reporting** currently loads records into an authenticated server function, then calculates dashboard views. It is designed for a small private lending portfolio; for more than several thousand records, move summaries and pagination to SQL views/RPCs.
5. **Backups**: the Data Integrity screen exports a **read-only JSON ledger snapshot**, not a complete PostgreSQL database backup and not an automated restore. Configure and test independent managed database backups/recovery before live use.
6. **Security/compliance**: before real deployment, independently test RLS with two distinct accounts, verify MFA/SMTP, arrange vulnerability review, data minimization/retention, privacy notices, lending compliance and data breach procedures appropriate to your business and location. No service-role key or private customer file should be placed in public assets.
7. **Extensibility**: bank/GCash account-level reconciliation, maker-checker loan approvals, rescheduling, configurable repayment hierarchy, collection reminders, uploaded loan documents and formal double-entry GL are future work.

## Test commands

```bash
npm run test:ledger   # Pure data projection, does not need Supabase account
npm run typecheck     # After npm install
npm run build         # After npm install
```

**Company-issued laptop:** after deployment, use a browser only where company acceptable-use policies allow. Initial project deployment and account administration should be done on your personal device.
