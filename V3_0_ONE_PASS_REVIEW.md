# Cove Lending Studio V3.0 — Single-Pass Product Review

This is designed for your preferred **review the whole system once** approach. Keep the financial baseline intact while testing V3 against **staging data**.

| Module | What to inspect | Your decision |
|---|---|---|
| Dashboard | Capital balances, monthly interest, final contractual collection date, cash-basis income/costs | Accept / Change |
| Collection planner | Due today, overdue, due soon, aging, and payment reversals | Accept / Change |
| Loan servicing | Full contractual payoff quote, one-way dated extension, renewal/waiver request log | Accept / Change |
| Borrower statements | Reconciled receipts, reversals, loan balances, print/PDF styling | Accept / Change |
| Bank & wallets | Mapping to original transactions, unassigned items, statement variance | Accept / Change |
| Reminders | Manual message drafts, recorded calls and promises, no automated external delivery | Accept / Change |
| Reporting | 6-month scenarios (50%–100%), capital utilization and concentrations | Accept / Change |
| Audit/security | Operator audit log, private export, backup procedure, owner-only controls | Accept / Change |
| Mobile | Navigation, modal forms, tables, large account lists | Accept / Change |
| Data integrity | Existing Oct 16 historical variances unchanged, no duplicate imports | Accept / Change |

**Capture changes as one backlog:** for each mismatch, record screen, intended business rule, current behavior, example transaction, expected amount, and severity (blocker/important/polish). Avoid editing production loan history during UI acceptance testing. For rules that would change principal, interest, maturity, cash or due dates, confirm the financial meaning before requesting source changes.

## Release safety checkpoint

- [ ] V3 additive SQL migration tested and applied
- [ ] `npm run check` passed in VS Code (including full Next.js production build)
- [ ] `npm audit --omit=dev` reports acceptable outcome
- [ ] Committed source includes all new V3 files; no secrets, private borrower data, backups or account statements
- [ ] Vercel production deployment Ready
- [ ] Existing cash and principal values still reconcile
- [ ] Operations Center loaded and owner authorization verified
- [ ] Staging extensions/reconciliations/follow-ups verified without changing real borrower records

