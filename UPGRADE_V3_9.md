# Cove Lending Studio V3.9 — Application Review & Tracking

**Installation target:** Existing Cove V3.8. This is **not authorization to launch public lending**. It is a controlled invitation-only application pilot. Owner-only finance ledger remains unchanged.

## What is new

1. **Application operations** (`/studio/applications`): searchable queue, detailed application review, four verification checks (Identity, Income, Affordability, Terms), decisions, immutable event history.
2. **Manual approval gate**: the database now requires Under Review and four Verified checks before status can become Approved. Approval is an administrative status only; it does not create a borrower loan, authorize an interest rate, create a contract, or disburse funds.
3. **Applicant tracking** (`/track`): a two-factor knowledge mechanism using an application reference plus a separate **256-bit random tracking code**. It returns only status, dates, and a generic next-step message. No borrower contact/income/document details or internal reviewer notes leave the owner area.
4. **Reissue access**: the owner can issue a new tracking code for an old or lost-code application. The previous code immediately stops working. Only the hash of a code is stored in Postgres; the raw code is displayed once.
5. **Document-check metadata**: owner may record whether identity, income, affordability, and terms have been requested, received, verified or rejected; evidence reference and note. This is **not a document upload or remote ID-verification service**.

## Before database migration

- Back up the production database and verify you can restore it. Use a separate Supabase **staging** project with synthetic data for acceptance tests.
- Verify that V3.8 migration `202611070001_cove_v38_funding_applications.sql` already ran.
- Leave `COVE_APPLICATION_INTAKE_ENABLED=false` and the approved-notice version disabled until authorization, pricing, product disclosures, privacy, and operational security reviews are finished. Do not flip switches merely to test in production.
- Ensure owner workspace signup is locked down after account provisioning (`COVE_ALLOW_NEW_WORKSPACE_SIGNUP=false`).

## Database migration (Supabase SQL Editor, NOT VS Code PowerShell)

Execute **only**:

`supabase/migrations/202611080001_cove_v39_application_reviews.sql`

It adds one tracking-hash column, two owner-only review tables, and RPC procedures. It replaces the existing `cove_review_application` function with a stricter function that blocks bypassing verification. It revokes anonymous access to the original V3.8 submission RPC, routing submissions through the V3.9 wrapper that creates a tracking code.

Post-migration smoke queries (in Supabase SQL Editor):

```sql
select to_regclass('public.loan_application_checks') as checks,
       to_regclass('public.loan_application_events') as events;
select column_name from information_schema.columns
where table_schema='public' and table_name='loan_applications'
  and column_name='tracking_secret_hash';
select proname from pg_proc where proname in (
  'cove_v39_submit_loan_application','cove_v39_track_application',
  'cove_v39_issue_tracking_code','cove_v39_set_application_check',
  'cove_review_application');
notify pgrst, 'reload schema';
```

**Staging security tests**:

- Anonymous user cannot SELECT application details or the checklist/events tables, or invoke owner review/check functions.
- Wrong tracking code fails with a generic message; reference alone is insufficient.
- Used/expired invitations cannot be reused; no new submission possible while intake is OFF.
- Existing V3.8 submissions can be given a tracking code by owner; they cannot be tracked before that.
- New submitted application shows code once; status inquiry works with ID + code.
- Approval is rejected from Submitted, or when any of four checks is not Verified; four verified checks from Under Review permit administrative Approved status.
- No application review operation creates a loan or changes cash/principal/asset totals.

## Install source into VS Code

Copy the **V3.9 Patch ZIP** into `C:\Cove_Lending_Cloud_V2_Source`, preserving `.git`, `.env.local`, private records and other files. Run:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
```

The supplied ZIP intentionally does **not** contain `node_modules`, `.git`, `.env.local`, or `package-lock.json` (the latter comes from your existing project). If `npm install` changes `package-lock.json`, include it with the commit.

Stage specific files (avoid Kitchen Stack's stray `test/` folder, `app/globals.css`, `public/sw.js`, previews, and all private data):

```powershell
git add -- package.json package-lock.json README.md CHANGELOG.md
git add -- UPGRADE_V3_9.md V3_9_RELEASE_MANIFEST.json
git add -- app/apply/page.tsx app/apply/apply.css
git add -- app/api/apply/route.ts app/api/applications/route.ts
git add -- app/api/apply/track/route.ts app/track/page.tsx
git add -- app/studio/applications/page.tsx app/studio/applications/applications.css
git add -- supabase/migrations/202611080001_cove_v39_application_reviews.sql
git add -- tests/v39-application-workflow.test.mjs
git diff --cached --check
git diff --cached --name-only
git ls-files --others --exclude-standard
```

Once full local checks, staging migration and live schema compatibility all pass, commit and push:

```powershell
git commit -m "Release Cove V3.9 applicant verification and tracking"
git push origin main
```

## How to accept-test

In staging (with synthetic applicants only): enable **both** the environment intake gate and `loan_application_settings` for that staging workspace, using a real approved test privacy notice. Generate invitation in the owner applications page. Submit sample form; save reference and tracking code. Visit `/track` and verify status. As owner, record each verification with evidence references (never government ID numbers), mark Under Review, then Approved. Retest `/track` after each change. Test Declined and Information Required with separate sample applications. Verify original funding reports are unchanged.

## Explicitly NOT delivered in V3.9

- No uploaded IDs, photos or payslips. These require private object storage, malware scanning, encryption, least-privilege access, explicit retention and deletion policies, and a privacy impact assessment.
- No borrower accounts, OTP login, notifications, automated credit scoring, loan contracts, e-signature, automatic approval, or automatic disbursement.
- No public anonymous mass submission. Invitation-only, disabled by default.
- No regulatory approval implied. Verify SEC lending authority and online-platform disclosure/recording requirements as applicable, NPC data privacy requirements, product pricing, responsible-collections policy and disclosures before opening access.

## Regulatory reference starting points

- SEC online lending platform recording list (SEC MC 20, s. 2026): https://www.sec.gov.ph/lending-companies-and-financing-companies-2/list-of-recorded-online-lending-platforms
- SEC 2026 advisories: https://www.sec.gov.ph/lending-companies-and-financing-companies-2/advisories-and-notices/
- NPC Circular 20-01 on personal data in loan-related transactions: https://privacy.gov.ph/wp-content/uploads/2020/10/NPC-Circular-No.-20-01.pdf

These are starting points, not a determination that Cove or its loan products meet regulatory requirements.
