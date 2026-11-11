# Cove Lending Studio V3.10.4 — Clarity Light Theme

## What this patch fixes

The V3.10.3 Nocturne palette caused low-contrast text in lower dashboard cards, especially **Factors increasing assets**, its legend, SVG axes, footnotes, and tables.

Clarity Light is now the default for `/studio`. The existing dark navigation sidebar and teal portfolio hero remain. A functioning top-bar **Switch to dark theme / Switch to light theme** button saves the preference in the browser (`cove-appearance` in local storage). If storage is disabled, the app loads in Light mode.

All financial calculations, history, modals, actions, and Supabase API contracts remain unchanged. The SQL migrations and borrower-application intake settings are not touched. Other dedicated routes (`/studio/statements`, `/studio/command`, and `/studio/applications`) retain their existing layouts.

## Package files

- `app/studio/page.tsx` — loads Clarity after Nocturne; adds theme toggle; light default
- `app/studio/clarity.css` — accessible light palette and contrast overrides; dark chart title repair
- `public/studio-app.js` — working, locally persisted theme toggle with accessible label
- `tests/v3104-clarity-theme.test.mjs` — regression and contrast checks
- `package.json`, `CHANGELOG.md`, `UPGRADE_V3_10_4.md`, `V3_10_4_RELEASE_MANIFEST.json`

## Install from current V3.10.3

1. Back up your project and confirm you have the latest V3.10.3 source. Extract the patch at the project root and preserve `.git` and `.env.local`.
2. From PowerShell in `C:\Cove_Lending_Cloud_V2_Source` run:

```powershell
npm install --include=dev
npm run check
npm audit --omit=dev
git diff --check
```

3. Stage exactly these files, including any intentional `package-lock.json` update from npm install:

```powershell
git add -- app/studio/page.tsx app/studio/clarity.css public/studio-app.js
git add -- tests/v3104-clarity-theme.test.mjs
git add -- package.json CHANGELOG.md UPGRADE_V3_10_4.md V3_10_4_RELEASE_MANIFEST.json
# If package-lock.json changed to the matching root version, stage it too:
# git add -- package-lock.json
git diff --cached --check
git diff --cached --name-only
git status --short
```

4. Review staged changes. Do not stage private data, `.env.local`, test recordings, or unrelated files. Only after checks pass:

```powershell
git commit -m "Release Cove V3.10.4 Clarity light theme"
git push origin main
```

## Acceptance checks after Vercel is Ready

1. `/studio` opens in **Light** mode by default on a fresh browser profile. The sidebar stays deep teal; all dashboard cards and lower modules use light surfaces with readable text.
2. The top-bar moon control switches to **Dark**, its label changes to "Switch to light theme", and the preference persists after refresh.
3. Navigate to the **Factors increasing assets** chart: heading, all legend labels, axes, columns, and chart footer are visible without zooming.
4. Open **Loans**, **Borrowers**, **Collections**, **Cashbook** and **Reconciliation**: column headers, financial figures, statuses, filters and row details are readable.
5. Test `New loan`, `Record collection`, `Refresh`, as-of date, cashbook filtering, monthly chart modes, loan interest breakdown, export and sidebar scrolling.
6. Confirm cash, outstanding principal, total assets and borrower balances match pre-update values.
7. Confirm mobile viewport has no full-page horizontal scroll and tables scroll within their own containers where necessary.

## Testing limitations

The source was exercised with Node's test runner and its light layout was previewed using a static HTML fixture with representative figures. This is not a live production screenshot. Run the complete Next.js build and audit in your local VS Code environment before pushing.

**No Supabase schema migration or environment changes are required.**
