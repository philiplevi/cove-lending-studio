# Cove Lending Studio V3.1 — Research and dashboard design specification

## Sources consulted

1. IBM Carbon Design System, **Color & accessibility**, https://www.carbondesignsystem.com/building-blocks/foundations/accessibility/color — aim for at least 4.5:1 body text contrast and 3:1 large text / meaningful UI components; never rely on color alone for meaning.
2. IBM Carbon Design System, **Color overview**, https://www.carbondesignsystem.com/building-blocks/foundations/color/overview — predominantly neutral surfaces; save saturated colors for key actions and meaningful states.
3. IBM Carbon Design System, **Typography**, https://www.carbondesignsystem.com/building-blocks/foundations/typography/overview — use readable neutral-colored text and deliberate size/weight hierarchy.
4. IBM Design Language, **Data visualization basics**, https://www.ibm.com/design/language/data-visualization/design/basics/ — avoid dense grids and chart clutter, use legends and exact units.
5. CGAP, **Measuring Results of Microfinance Institutions**, https://www.cgap.org/sites/default/files/researches/documents/CGAP-Technical-Guide-Measuring-Results-of-Microfinance-Institutions-Minimum-Indicators-That-Donors-and-Investors-Should-Track-Jul-2009.pdf — active loan counts, outstanding principal, portfolio at risk >30 days, cash recovery and loan portfolio quality.
6. CGAP/FinDev Gateway, **Performance Indicators for Microfinance Institutions**, https://www.findevgateway.org/sites/default/files/publications/files/mfg-en-toolkit-performance-indicators-for-microfinance-institutions-technical-guide-3rd-edition-2003.pdf — portfolio-at-risk should be based on *entire outstanding principal of affected loans*, not merely the overdue installment.

## Design system

- Font: Inter when installed, fallback to Segoe UI/Arial; no runtime font download. Base interface 14 px; dashboard body 11–13 px; card label 11 px; headline 35–51 px; section title 18–21 px; tabular numbers for comparison.
- Page: pale neutral #f4f7f8. White data panels with subtle border #dce5e8 and very light shadow; executive hero #123540.
- Primary action/chart color: deep teal #0f766e. Risk warning uses subdued terracotta #af574c; amber for due today; cool blue-gray for supporting chart series.
- Contrast: prominent labels #536d75 (5.51:1 on white), body muted #58727b (5.11:1 on white), teal link #076f68 (6.03:1 on white). Verify additional state colors in actual browser contexts.
- Layout: one hero, four compact KPI cards, two earnings features, capital mini-ledger, performance/risk row, collections/portfolio mix row, activity/concentration row. Adapt at 1450, 1190, 900, 620 and 410 px widths.
- Interactions: keep as-of date, recording actions, chart 6/12-month switch, loan drill-through and prioritized payment action. Financial definitions are visible next to risk metrics.

## Lending metric definitions / limitations

| KPI | Definition | Caveat |
|---|---|---|
| Portfolio assets | Ledger cash + outstanding principal | Excludes other assets and liabilities |
| Liquid cash | Posted capital + collections + void release reversals – releases – cash outflows | May be negative; not necessarily bank balance |
| Outstanding principal | Loan-level unpaid principal (capped at zero) | Historical allocation exception retained |
| Total receivables | Unpaid principal + uncollected contractual interest | Contract amount, not accounting carrying amount |
| Collections this month | Net cash receipts posted for the selected calendar month | Includes corrections/reversals; not income |
| Active borrowers | Distinct borrowers with active contracts | Open loan statuses derived from ledger |
| Monthly contractual interest | Sum of original loan principal × agreed flat monthly rate across active loans | Contract run-rate; not accrued or cash-earned income |
| Scheduled final collection | Latest effective installment due date among active loans | Not a promised repayment date |
| Active capital utilization | Outstanding principal ÷ (cash + outstanding principal) | Only meaningful for positive portfolio assets |
| PAR30/60/90 proxy | Principal outstanding of active loans whose oldest unpaid installment is **more than** 30/60/90 days past due ÷ all outstanding principal | Fully renegotiated/restructured exposure not separately tagged; **not a full formal CGAP PAR** |
| Principal aging | Whole unpaid principal allocated by each loan's oldest days-past-due interval | Different from overdue installment totals |
| Overdue installments | Sum of contractual installments unpaid after their due date | Do not compare directly with PAR numerator |
| Collection coverage | Posted receipts applied to cumulative contractual dues ÷ contractual dues through as-of date | Does not prove on-time repayment; returns — if none due |
| Borrower exposure | Outstanding principal by borrower ÷ entire outstanding principal | Concentration indicator only; not credit scoring |

**No ungrounded default rate, loss allowance, write-off, net income or automated lending decision is claimed.** Those require business rules/data that do not yet exist.
