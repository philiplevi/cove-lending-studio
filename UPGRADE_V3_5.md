# Cove Lending Studio V3.5 — Installation and Accounting Guide

**Upgrade target:** Existing functioning V3.4 project with its prior Supabase migrations already applied. No new SQL migration and no new npm dependency.

## Install
1. Back up the working folder and save a **private** read-only ledger export; verify your Supabase backup recovery method.
2. Extract the ZIP into `C:\Cove_Lending_Cloud_V2_Source`, replacing matching files. Preserve `.git`, `.env.local`, any data and your original `package-lock.json`. Do not copy unrelated Kitchen Stack files.
3. In VS Code PowerShell run commands individually:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
git status --short
```

All steps must pass. The authoring environment could run ledger strict TypeScript checks and 58 automated tests, but its npm dependency install timed out, so **full Next.js production build remains unverified until these commands run successfully in VS Code.**

## Stage exact files
```powershell
git add -- package.json tsconfig.json README.md CHANGELOG.md
git add -- lib/ledger.ts lib/financial-statements.ts
git add -- public/studio-app.js app/studio/page.tsx app/studio/asset-sources.css
git add -- app/studio/statements/page.tsx app/studio/statements/statements.css
git add -- tests/financial-statements.test.mjs UPGRADE_V3_5.md V3_5_RELEASE_MANIFEST.json
git diff --cached --check
git diff --cached --name-only
git status --short
```

Make sure the two new CSS files, standalone route, and financial-calculation module are staged. Keep `.env.local`, private borrower records, backup ZIPs and preview files out of Git. Only commit **after** checking the staged file list and any other untracked files.

```powershell
git commit -m "Release Cove V3.5 asset sources and financial statements"
git ls-tree -r --name-only HEAD -- app/studio/statements/page.tsx lib/financial-statements.ts app/studio/asset-sources.css
git push origin main
```

## Live verification (read-only)
1. Wait for Vercel **Ready**. Open Cove Dashboard and verify all other existing modules still load.
2. Set historical as-of **October 16, 2026** and check cash ₱3,850, principal ₱32,000, assets ₱35,850. The historical data classifies only ₱27,000 as personal owner funding, ₱10,000 as borrowed capital, ₱36,450 as owner withdrawals, ₱10,000 as repayment of borrowed principal and ₱300 as financing cost. Its calculated net owner contributions are **−₱9,450**, retained cash-basis surplus **₱45,292**, borrowed principal balance ₱0 and historical reconciliation ₱8.
3. Open **Financial Statements** in the sidebar. Check monthly, quarterly, yearly and custom period buttons. Compare a period's cash-flow opening + net movements against ending fund cash, and period income against posted interest and classified expenses.
4. Test CSV download and Print / Save as PDF (browser print). Do not include private borrower details in shared screenshots.

## Accounting decisions and limitations
- **Owner capital** = personal contributions − owner withdrawals (not minus operational expenses). A negative value is not capped or mislabeled as an ownership ratio.
- **Borrowed funding** = external loan contributions − classified debt-principal repayments. Classification does not imply verified creditor balances.
- **Retained cash-basis lending earnings** = interest cash received (net of receipt reversals) − classified operating expenses − financing costs.
- **Reconciliation balance** = recorded portfolio assets less net owner capital, net borrowed funding and retained cash-basis earnings. Unknown sources/outflows and historical allocation variances are NOT assigned to income.
- **Cash flow** separately shows loan releases, principal+interest receipts, operating/financing costs, capital movements and unclassified funding/outflows.
- **Statement of Financial Position** is a limited management position: cash + loan principal. It excludes accrued interest receivable, ECL/impairment, taxes, and other unrecorded liabilities. Never present it as a PFRS-compliant financial statement.
- **Existing ledger and source balances are never written by this release**. No migrations or edits to historical records.
