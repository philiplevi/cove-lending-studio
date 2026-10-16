# Cove Lending Studio 2.1 — Stable Source Refresh

A private lending web application built with **Next.js 15, Supabase Auth/PostgreSQL, and Vercel**. This refresh retains your V2 ledger, SQL schema, financial dashboard, and historical-import format. It is intended to replace the existing **source files**, NOT to wipe or recreate the Supabase database.

## What changed in this release

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
| `public/`, `app/studio/` | Premium dashboard and responsive interface |
| `tests/` | Unit checks for ledger and authentication/config diagnostics |
| `.github/workflows/quality.yml` | Secondary GitHub quality gate |

## Security and operational limitations

- **Local tests passed**, including the historical seed when supplied separately. This archive could not complete an `npm install`, full Next.js type-check/build, or `npm audit` in the generation environment because the npm registry was inaccessible. Run `npm install --include=dev`, `npm run check`, and `npm audit --omit=dev` on your connected VS Code machine **before deploying**. It would be inaccurate to label this archive production-verified.
- `GET /api/health` checks server connectivity to Supabase, not the correctness of RLS or all Auth/SQL policies. Full signup and database end-to-end tests require access to your actual Supabase project.
- Do not expose finance records via the public assets, GitHub, logs, or screen shares. Use a private GitHub repo, protected Vercel deployment, and verified row-level security.
- Self-service signup creates a **separate private workspace** per new user. After owner setup, close unneeded public signups and consider MFA. Test access with another account before storing live personal financial data.
- V2 remains a lightweight private lender ledger, not formal accrual accounting or a licensed lending platform. Bank/GCash reconciliation, underwriting, audit retention, regulatory/privacy controls, automatic backups/restores and accountant review remain future work.
