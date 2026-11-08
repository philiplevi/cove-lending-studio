# Cove Lending Studio V3.10 — Dashboard Cleanup & Navigation Polish

## Scope
This patch is a **UI cleanup release** only. It does **not** change database schema, lending calculations, borrower records, or API contracts.

## Included changes

1. **Removed duplicate shell actions**
   - Topbar duplicate **Record collection** shortcut removed.
   - Sidebar duplicate **New loan** button removed.
   - Main dashboard page actions remain the primary entry point.

2. **Cleaner dashboard presentation**
   - Removed the extra dashboard subtitle under **Lending overview**.
   - Removed the long dashboard disclosure footer to reduce note clutter.

3. **More complete product feel**
   - Polished brand mark presentation.
   - Updated `public/favicon.svg`.
   - Replaced utility clutter in the top-right area with cleaner notification/help controls.

4. **Sidebar usability fix**
   - Sidebar now scrolls vertically, so lower modules remain reachable on shorter screens without zooming out.

## Files changed

- `app/studio/page.tsx`
- `app/studio/premium.css`
- `public/studio-app.js`
- `public/favicon.svg`
- `package.json`
- `CHANGELOG.md`

## No migration required

- No Supabase migration.
- No ledger recalculation.
- No environment variable changes.

## Suggested local check

```powershell
npm install --include=dev
npm run check
git diff --check
```

Then stage only the intended files:

```powershell
git add -- package.json CHANGELOG.md UPGRADE_V3_10.md
git add -- app/studio/page.tsx app/studio/premium.css
git add -- public/studio-app.js public/favicon.svg
git diff --cached --check
```
