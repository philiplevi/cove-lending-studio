# Changelog

## 2.1.0 — Source stabilization
- Same-origin Next.js auth handler fixes dependency on browser-to-Supabase signup fetch.
- Public read-only health endpoint but exposes only connection status and safe error descriptions.
- Corrected strict TypeScript errors in ledger and Supabase cookies.
- PostCSS `^8.5.23` npm override without upgrading Next to 16.
- Added authentication diagnostics unit tests, pre-push validation and GitHub Actions workflow.
- Improved ignored temporary and private files; retained Supabase schema and data import protocol.

### Must verify before production rollout
Full dependency installation, Next.js type-check/build and vulnerability audit **were not runnable from the generation environment without npm registry access**. Run `npm install --include=dev`, `npm run check`, and `npm audit --omit=dev` on a connected local machine. Then validate real Supabase signup and workspace creation.
