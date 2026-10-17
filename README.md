# Cove Lending Studio 3.0 — Private Financial Operations

A private lending web application built with **Next.js 15, Supabase Auth/PostgreSQL, and Vercel**. This refresh retains your V2 ledger, SQL schema, financial dashboard, and historical-import format. It is intended to replace the existing **source files**, NOT to wipe or recreate the Supabase database.


## New in V3.0

This consolidated release adds the **Operations Center** at `/studio/command` with loan-servicing documentation and controlled due-date extensions, borrower statements/PDF via browser print, cash-account tagging and reconciliation, collection follow-up records, and transparent forecast scenarios. Open [UPGRADE_V3_0.md](UPGRADE_V3_0.md) for staging, SQL migration, complete-file Git staging, test requirements, and explicit limitations. V3 is **not a replacement for licensed accounting, automatic banking, or underwritten credit models**.

The UI and calculations preserve the existing 2.4 financial ledger. The new `202610170002_cove_v3_operations.sql` additive migration is required before accessing the Operations Center.

---

## Previous: V2.2 premium interface release

- Refreshed dark-teal navigation and executive dashboard based on a refined BI-style visual direction.
- Six lending KPIs: monthly collections, receivables, realized interest, active loans, overdue installments and the next 7 days of scheduled collections.
- New **Collections** register backed by the *existing* ledger and receipt entries, with quick posting, filtering, linked loan details and CSV export.
- Responsive navigation and table styling; 6M/12M cashflow chart control; improved reconciliation messages when no historical baseline is present.
- New UI contract tests. No new SQL migration, no historical import, no new credentials.

**Start with [`UPGRADE_V2_2.md`](UPGRADE_V2_2.md)** for the safe drop-in update to your current GitHub/Vercel project.

## Background: previous 2.1 stability fixes

- Fixed TypeScript inferred types in `lib/ledger.ts` and explicitly typed cookie handlers in `lib/supabase.ts` and `middleware.ts`.
- Replaced direct browser-to-Supabase login with a **same-origin POST `/api/auth`** server endpoint. This improves compatibility with restrictive browser networks and gives actionable API errors.
- Added **GET `/api/health`** and a *Check Supabase connection* button on `/login`. The endpoint validates Vercel configuration and attempts a server-to-Supabase network check without returning the API key or borrower data.
- Applied npm **PostCSS `^8.5.23` override** to address the reported vulnerability without a Next.js major-version change.
- Added `*.tsbuildinfo` and private-file protection to `.gitignore`, an `npm run check` quality gate, authentication diagnostics tests, and an example GitHub Actions gate.
- Preserved the initial Supabase SQL migration at `supabase/migrations/202610090001_cove.sql` without modification. **Do not rerun it on the same project.**

## Upgrade an existing VS Code / GitHub project

**Do not create a new repository or new Supabase project.** Your source is already deployed, and your SQL migration is already installed.

1. In VS Code, make a backup or commit any valuable **nonsecret** local edits. Keep `.env.local`, private importer JSON and customer data in a private location, never in Git.
2. Extract this ZIP to a temporary folder. Copy its source files and folders into the existing `Cove_Lending_Cloud_V2_Source` working folder, **replacing the old source files but preserving `.git/`, `.env.local`, and private data**. Do not delete the database or run the old SQL again.
3. Inspect `.env.local` (do not share its actual contents):

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-real-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-publishable-or-anon-key
   ```

   Use the *actual* values from the **same Supabase project** already linked in Vercel. These are browser-publishable values, not `sb_secret_`/service-role keys. Keep the real values in Vercel Production as well. If you change Vercel values, trigger a new deployment.
4. Run from VS Code PowerShell:

   ```powershell
   npm install --include=dev
   npm run check
   npm audit --omit=dev
   git status --short
   git diff --check
   ```

   `npm install --include=dev` writes/updates `package-lock.json` and ensures TypeScript is installed for the quality gate. Commit that lockfile after you have a verified installation; `npm ci` can then be used for subsequent reproducible installs. **Do not use `npm audit fix --force`.**
5. If every command passes, review the changes and commit tracked source files plus `package-lock.json`. Confirm `.env.local`, `private_import/`, `.next/`, and `*.tsbuildinfo` are absent from staged changes. Then push:

   ```powershell
   git add .github .gitignore .env.example app lib middleware.ts public supabase tests package.json package-lock.json tsconfig.json next.config.ts README.md ARCHITECTURE.md
   git diff --cached --stat
   git diff --cached --check
   git commit -m "Stabilize Cove auth, typings and dependency security"
   git push origin main
   ```

6. Vercel redeploys from `main`. Open `https://cove-lending-studio.vercel.app/login` and click **Check Supabase connection**. When it reports online, try **Create your workspace**. Check the Supabase Auth Users and logs if account creation is rejected.

**Important:** GitHub Actions also checks TypeScript/tests/build/audit after you push, but does not replace the local pre-push gate. It intentionally does not contact live Supabase or import personal data.

## First owner signup and diagnosis

- There are **no hardcoded accounts or passwords**. Register with your own email/password on the sign-up page.
- Registration runs through `/api/auth` on the Cove server, which talks to Supabase. This avoids cross-origin browser fetches during signup.
- If **Check Supabase connection** reports a missing or malformed URL/key, correct the values in Vercel **Production** (and `.env.local` for local tests), then redeploy. Secret-type values in Vercel may not be retrievable locally with `vercel env pull`; use the original values from Supabase.
- If the connection check says **online** but signup reports **Database error saving new user**, use **Supabase → Logs → Auth** to inspect the workspace bootstrap trigger `public.cove_on_signup()`. We cannot resolve this class of error by changing React code alone.
- If signup succeeds but says to verify your email, follow the verification email and sign in. Configure **Supabase → Authentication → URL Configuration** with the deployed domain. If you have disabled public signup before creating the owner, re-enable it temporarily in your project or create the account using the appropriate admin workflow.
- Network testing is non-destructive; no signup/ledger records are created by `/api/health`.

## Historical data and consistency

Existing Cloud V2 data remains in Supabase. New source code **does not reset it**. If your workspace is empty, the one-time `/import` screen can accept the original *separate* `Cove_Lending_Private_Import.json`. Never place that file in the source repository or `/public`.

Expected original October 8, 2026 controls: capital ₱37,000; releases ₱219,000; collections ₱236,100; outflows ₱52,750; cash ₱1,350; outstanding principal ₱27,083; cash + principal ₱28,433; interest collected ₱44,176. The legacy ₱7 allocation discrepancy and duplicate receipt reference are preserved for reconciliation rather than automatically overwritten.

## Project layout

| Directory | Responsibility |
|---|---|
| `app/login/page.tsx` | Owner registration and sign-in UI, connection diagnostics |
| `app/api/auth/route.ts` | Same-origin signup/login with Supabase SSR cookies |
| `app/api/health/route.ts` | Safe server-side configuration/network health check |
| `middleware.ts` | Enforces authentication before private pages and ledger API |
| `app/api/[...path]/route.ts` | Ledger reads, transactional writes and one-time import |
| `lib/ledger.ts` | Read-only centavo-based financial dashboard calculations |
| `supabase/migrations/` | **Existing** migration, unchanged; do NOT rerun |
| `public/`, `app/studio/` | Premium dashboard and responsive interface (V2.2 overrides in `premium.css`) |
| `tests/` | Unit checks for ledger and authentication/config diagnostics |
| `.github/workflows/quality.yml` | Secondary GitHub quality gate |

## Security and operational limitations

- **Local tests passed**, including the historical seed when supplied separately. This V2.2 archive could not complete an `npm install`, full Next.js type-check/build, or `npm audit` in the packaging environment because the npm registry was inaccessible. Source-level Node tests and headless browser interaction checks using synthetic data passed. Run `npm install --include=dev`, `npm run check`, and `npm audit --omit=dev` on your connected VS Code machine **before deploying**. It would be inaccurate to label this archive production-verified.
- `GET /api/health` checks server connectivity to Supabase, not the correctness of RLS or all Auth/SQL policies. Full signup and database end-to-end tests require access to your actual Supabase project.
- Do not expose finance records via the public assets, GitHub, logs, or screen shares. Use a private GitHub repo, protected Vercel deployment, and verified row-level security.
- Self-service signup creates a **separate private workspace** per new user. After owner setup, close unneeded public signups and consider MFA. Test access with another account before storing live personal financial data.
- V2 remains a lightweight private lender ledger, not formal accrual accounting or a licensed lending platform. Bank/GCash reconciliation, underwriting, audit retention, regulatory/privacy controls, automatic backups/restores and accountant review remain future work.

### V2.3 test-loan void

For existing users upgrading from V2.2, see [`UPGRADE_V2_3_VOID_LOAN.md`](./UPGRADE_V2_3_VOID_LOAN.md). Run the **additive** `supabase/migrations/202610170001_void_test_loans.sql` in your existing Supabase project *before* deploying the V2.3 app. No existing transactions are deleted. This action is strictly for mistaken/test entries where no real money is outstanding.

## V2.4 — Collection planner and capital intelligence

The dashboard now includes the active-capital financial summary, monthly flat-rate **contractual interest run rate**, and maximum installment due date among active loans. A new Collection planner provides all unpaid installments grouped by selected as-of date and collection urgency, with oldest-first receipt application. Reports include portfolio-aging buckets and scheduled collection coverage. There is **no new SQL migration** for V2.4.

Definitions, deployment checks, and the October 16 validation baseline are documented in `UPGRADE_V2_4.md`.

### Single-pass review workbook

Review all modules and capture requested corrections in one list using `V3_0_ONE_PASS_REVIEW.md` rather than reviewing each interim version separately.
