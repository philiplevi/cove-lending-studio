# Cove Lending Studio V3.8 — Funding corrections and borrower-application pilot

## Scope
This upgrade is **not** a public lending launch. It adds:

- Cashbook **Edit classification** on capital and outflow entries, preserving posted amount/date with immutable prior/after audit records.
- **Owner-paid debt settlement**: a noncash conversion of genuinely extinguished external borrowing into owner contributions. No fund-cash or total-asset movement is posted.
- New **Loan applications** owner-only module, invitation generation, and a minimal `/apply` page.
- Approved/declined application status review. **Applications do not automatically create loans, agreements, or disburse funds**.

## Accounting rules and limits
### A. Incorrect source classification
Use Cashbook > Capital > Edit classification **only** if personal funds were incorrectly recorded as external borrowed funding, or vice versa. Classification corrections restate the classification on historical reports. The original classification, reason and acting user are retained. The database blocks any change that would make aggregate external borrowing negative after debt repayments and conversions.

### B. Owner paid external lender personally
Use **Owner-paid debt settlement** when the owner actually paid the lender from personal funds outside the Cove cashbook, the creditor has released the lending business from its obligation, **and the owner makes a documented non-reimbursable equity contribution**. If the business owes the owner reimbursement, it is a change in lender, not owner equity. Record amount, effective date, original funding reference, explanation, and verifiable evidence reference. A linked, signed noncash transaction increases owner capital and decreases external debt by equal amounts; it does not alter fund cash or portfolio assets. A promise to pay, forgiveness from an unrelated creditor, or merely relabeling an outstanding loan is **not** owner capital. Documentation and legal/accounting review are required.

### C. Other cashbook edits
This release does **not** edit posted cash amounts/dates or original borrower receipts in place. For wrong amounts or dates, use an approved reversal/correction sequence rather than changing immutable financial history. Existing loan correction and payment reversal workflows remain available.

## Borrower information collected in this pilot
Initial form: full legal name, email, mobile phone, city/province, employment category, income band, existing monthly debt band, loan amount, term, purpose, self-declared adult status, and a privacy-notice acknowledgment. **No ID photo, selfie, contact-list permission, precise GPS location, national ID number, passwords, or bank credentials are collected.**

After a conditional pre-approval, design a separate private verification step with only necessary KYC, address/income evidence, approved loan disclosures, identity verification, and payment account details. Specify retention and deletion policies. Character references and guarantors require different treatment; do not scrape third-party contacts.

## Before opening to borrowers
1. Verify the applicable SEC lending/financing-company Certificate of Authority and SEC online lending platform recording/disclosure obligations (including SEC MC 20, s.2026) with qualified local counsel/compliance advisers. Verify lending products comply with applicable interest and effective-rate limits. The existing 10% flat monthly rate **must not be presumed lawful** for loans subject to SEC MC 3, s.2022.
2. Finalize and publish a borrower privacy notice, including processing purposes, lawful bases, data retention, service providers, rights, DPO contact, and any credit checks. Review NPC Circular 20-01 as amended by 2022-02, security and breach handling, and NPC registration obligations where applicable.
3. Finalize the borrower-facing lending terms, finance charge/EIR disclosure, complaint process, dispute handling, and the decision manual. Obtain consent/other lawful basis appropriately. No automated credit approval or disbursement in this pilot.
4. Set up HTTPS, spam mitigation, rate limits/WAF, logging, encryption, backup/restore tests, identity verification, and independent security/privacy testing. **Use a separate staging Supabase project with synthetic borrowers first.**
5. Lock down owner workspace registration after the owner account exists by setting `COVE_ALLOW_NEW_WORKSPACE_SIGNUP=false`.

## Required new SQL migration
File: `supabase/migrations/202611070001_cove_v38_funding_applications.sql`

1. Back up the live database using a tested recovery method. Test on an isolated Supabase staging database with a copy of the **schema and synthetic data**, not genuine borrower records.
2. Run the migration once in staging; validate the new tables, RLS, RPC functions and existing transactions.
3. Test classification change and owner settlement with real SQL-backed test cases, including repeat submissions, bad amounts, insufficient external debt, concurrent requests, and missing evidence.
4. Only then run it once in the intended production Supabase project's SQL editor. Do not rerun earlier migrations. New tables are additive; dashboard read-only views tolerate a missing V3.8 table during deployment.

SQL smoke queries:

```sql
select to_regclass('public.cashbook_corrections') as corrections,
       to_regclass('public.funding_conversions') as owner_settlements,
       to_regclass('public.loan_application_settings') as applicant_settings,
       to_regclass('public.loan_applications') as applications;
select proname from pg_proc where proname in (
 'cove_correct_cashbook_classification','cove_record_owner_debt_settlement',
 'cove_create_application_invite','cove_submit_loan_application','cove_review_application');
notify pgrst, 'reload schema';
```

## Keep intake OFF by default
`.env.example` includes these optional variables, but **do not put borrower data or API secrets in Git**:

```
COVE_APPLICATION_INTAKE_ENABLED=false
COVE_PRIVACY_NOTICE_VERSION=UNAPPROVED
COVE_PRIVACY_NOTICE_URL=https://your-approved-public-privacy-notice.example/borrower-privacy
COVE_ALLOW_NEW_WORKSPACE_SIGNUP=true
```

In production, leave intake `false`. To enable *after* the compliance/security signoff, the owner must coordinate **both** an environment update (`COVE_APPLICATION_INTAKE_ENABLED=true`, approved notice URL/version, then redeploy) and database setting:

```sql
-- Replace placeholders only after legal, compliance and security approval.
-- Check the workspace ID carefully; SQL Editor does not impersonate the owner's auth session.
select id,name from public.workspaces;
insert into public.loan_application_settings(workspace_id,enabled,privacy_notice_version)
values ('YOUR-WORKSPACE-UUID', true, 'YOUR-APPROVED-NOTICE-VERSION')
on conflict (workspace_id) do update set enabled=excluded.enabled,
 privacy_notice_version=excluded.privacy_notice_version,updated_at=now();
```

The database defaults to disabled, so publishing the website alone does not enable intake. The owner creates a one-time 7-day invitation in `/studio/applications`. An applicant submits through `/apply?invite=...`. The invite secret is stored hashed; the URL is removed from the browser address bar after load. Only the owner can read applicant records. The initial implementation does not send emails or text messages; applicants must receive links privately and be followed up manually.

For a **general public** portal (without invitations), add a verified identity/session process, CAPTCHA, server-side rate limiting, abuse/fraud monitoring, applicant self-service with OTP, and reviewed disclosures before removing invitation requirements.

## Install V3.8 source
1. Extract the **patch** into `C:\Cove_Lending_Cloud_V2_Source`, preserving `.git`, `.env.local`, `.vercel`, and existing sensitive data.
2. Run in VS Code:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
git status --short
```

3. After staging/live migration and local check are successful, stage only new and intended files. The critical new paths are:

```
app/api/funding/route.ts
app/api/applications/route.ts
app/api/apply/route.ts
app/api/apply/status/route.ts
app/apply/page.tsx
app/apply/apply.css
app/studio/applications/page.tsx
app/studio/applications/applications.css
supabase/migrations/202611070001_cove_v38_funding_applications.sql
tests/v38-funding-intake.test.mjs
```

Along with changed `lib/ledger.ts`, `lib/financial-statements.ts`, `app/api/[...path]/route.ts`, `app/api/auth/route.ts`, `app/studio/page.tsx`, `app/studio/asset-sources.css`, `public/studio-app.js`, `package.json`, `.env.example`, `README.md`, `CHANGELOG.md`, and this guide. Check `package-lock.json` if npm altered it.

4. Verify `git diff --cached --check`, `git diff --cached --name-only`, and `git ls-files --others --exclude-standard`. Ensure no `node_modules`, preview fixtures, `.env.local`, investor documents, or private borrower records are committed. Then commit and push as usual.
5. Confirm the production dashboard, loan list, existing collections and statements still reconcile. Test all new mutations on **synthetic staging data**, and confirm that a disabled `/apply` page never accepts personal information.

## Validation performed here
All available Node automated tests pass (74 executed; one private historical test skipped). New TypeScript/TSX modules pass a syntax/transpilation check and `public/studio-app.js` passes `node --check`. The complete Next.js build, npm security audit, SQL migration, live RLS/RPC behavior and full browser interactions **must be verified locally/staging** before deployment. No production SQL or borrower data was changed by creating this package.
