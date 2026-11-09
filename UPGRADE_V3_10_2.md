# Cove Lending Studio V3.10.2 — Asset Mix & Monthly Interest Performance

**Installation target:** V3.10.1. The update changes dashboard HTML/CSS and the client-side interest visual only. **No Supabase SQL migration or environment change is required.**

## Dashboard layout

- **Asset Source Mix:** keep the doughnut and 3-row classified funding breakdown (Net owner capital, Retained lending earnings, Outstanding borrowed capital); keep the 4-part owner capital calculation beneath. Values and percentages come from current Cove ledger state at the selected as-of date. Never use gross capital infusion as if it were current owner capital. Negative funding values continue to use the signed bar fallback instead of false doughnut shares.
- **Scheduled Interest & Maturity:** monthly contractual interest stays in a dark-teal highlight on the left and a seven-month interest column chart appears **on the right**. The chart begins with **Received** (net interest actually collected each month). Switch to **Scheduled** for amounts of each loan's recorded total contractual interest allocated evenly over its scheduled installments, grouped by due month. This scheduled view is only a contract schedule comparison, **not accrued or collected income**. The month labels and bars adjust with the as-of date, and negative receipt months display downward/terracotta bars.
- The **final scheduled due date**, **Collection planner** link and **View interest breakdown** loan-by-loan expander remain underneath. The contract-interest headline is a run rate, not monthly cash income.
- The old Cashbook, Loans, borrower application controls, Financial Statements and Supabase tables are untouched.

## Install

Extract the patch into `C:\Cove_Lending_Cloud_V2_Source` with folder structure preserved; overwrite only the matching patch files. Preserve your project's `.git`, `.env.local`, database and private data.

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
```

**Do not push if typechecking, tests or build fail.** The completed quality gate must run on your Windows VS Code machine.

## Stage and deploy

```powershell
git add -- package.json CHANGELOG.md UPGRADE_V3_10_2.md V3_10_2_RELEASE_MANIFEST.json
git add -- public/studio-app.js app/studio/asset-sources.css
git add -- tests/v3102-dashboard-interest-chart.test.mjs
# If npm install modifies package-lock.json because the package version changed, review it and include it:
# git add -- package-lock.json

git diff --cached --check
git diff --cached --name-only
git status --short
```

Confirm no unrelated Kitchen Stack `test/`, browser previews, `.env.local`, borrower data or credentials are staged. Once verified:

```powershell
git commit -m "Release Cove V3.10.2 asset and monthly interest charts"
git push origin main
```

## Acceptance checks

1. Asset Source Mix: live component amounts and donut percentage add up to identified classified funding; the actual total portfolio asset amount appears separately. Existing historical ₱8 gap remains in Data Integrity until audited correction.
2. Scheduled Interest & Maturity: contractual ₱ headline and 7-month interest chart sit beside each other on desktop. On narrower screens they stack without a horizontal scrollbar.
3. Received chart shows posted **interest allocations only**, not total borrower collections or loan principal. For reversal-heavy months, verify the net amount can be negative.
4. Scheduled view follows recorded agreement and installment due dates, excluding installments beyond the selected as-of date. It does not book income.
5. Click **View interest breakdown** and a borrower name to open their current loan. Check the last scheduled due date and Collection planner link.
6. Validate Loans, Collections, Cashbook, statements and application-management routes still work; public borrower intake remains disabled.

No SQL changes, and no change to ledger financial calculations.
