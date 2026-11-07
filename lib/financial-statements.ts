/** Cove V3.5 — read-only, management-basis accounting projections.
 * Entries remain sourced exclusively from the existing ledger. This module never posts.
 * The outflow classification is authoritative; unknown categories remain unreconciled.
 * These are CASH-BASIS management reports, not PFRS-compliant statutory accounts.
 */
type Row=Record<string,any>;
export type StatementSnapshot={as_of:string;summary:Row;capital:Row[];outflows:Row[];funding_conversions?:Row[];payments?:Row[];loans?:Row[]};
const amountCents=(row:Row)=>row.amount_cents!==undefined?Number(row.amount_cents):Math.round(Number(row.amount||0)*100);
const toPeso=(cents:number)=>Math.round(cents)/100;
const cents=(pesos:unknown)=>Math.round(Number(pesos||0)*100);
const norm=(value:unknown)=>String(value||'').trim().toLowerCase();
const sum=(entries:Row[])=>entries.reduce((n,r)=>n+amountCents(r),0);
const classifyFunding=(source:unknown)=>{
 const label=norm(source);
 if(['personal','owner','owner contribution','owner capital','equity','personal funds','own funds'].includes(label))return 'owner';
 if(['loan','borrowed','borrowed capital','external borrowing','third party loan','debt'].includes(label))return 'borrowed';
 return 'unclassified';
};
const classifyOutflow=(classification:unknown)=>{
 const label=norm(classification);
 if(['owner withdrawal','owner draw','owner drawing','owner distribution','owner capital return'].includes(label))return 'owner_draw';
 if(['capital repayment','loan principal repayment','debt principal repayment'].includes(label))return 'borrowed_repayment';
 if(label==='operating expense')return 'operating_expense';
 if(label==='financing cost')return 'financing_cost';
 return 'unclassified';
};
export function assetSourcePosition(s:StatementSnapshot){
 const capital=s.capital||[],outflows=s.outflows||[];
 const funding=(kind:string)=>sum(capital.filter(x=>classifyFunding(x.source_type)===kind));
 const disburse=(kind:string)=>sum(outflows.filter(x=>classifyOutflow(x.classification)===kind));
 const ownerContributions=funding('owner'), borrowedFunds=funding('borrowed'), unknownFunding=funding('unclassified');
 const ownerDraws=disburse('owner_draw'),borrowedRepayments=disburse('borrowed_repayment');
 const operatingExpenses=disburse('operating_expense'), financingCosts=disburse('financing_cost');
 const unclassifiedOutflows=disburse('unclassified');
 const convertedFunding=sum((s.funding_conversions||[]));
 const netOwnerCapital=ownerContributions-ownerDraws+convertedFunding;
 const remainingBorrowed=borrowedFunds-borrowedRepayments-convertedFunding;
 const earnedInterest=cents(s.summary.interest_collected);
 const retainedEarnings=earnedInterest-operatingExpenses-financingCosts;
 const portfolioAssets=cents(s.summary.portfolio_assets);
 // Explicit residual: may include legacy principal/interest allocations, unknown
 // cash classifications, other adjustments. Never invent earnings to close it.
 const residual=portfolioAssets-netOwnerCapital-remainingBorrowed-retainedEarnings;
 const flags:string[]=[];
 if(remainingBorrowed<0)flags.push('Recorded debt repayments exceed recorded external borrowing. Review source classification.');
 if(netOwnerCapital<0)flags.push('Net owner contributions are negative: recorded owner drawings exceed owner contributions. This does not mean assets are owned by someone else.');
 if(unknownFunding||unclassifiedOutflows)flags.push('Unclassified funding or outflows are included in the reconciliation balance until assigned to an appropriate category.');
 if(residual)flags.push('A reconciliation balance remains. It is not presumed to be lending profit or owner money.');
 const result={portfolio_assets:toPeso(portfolioAssets),gross_capital_infusion:toPeso(sum(capital)),owner_contributions:toPeso(ownerContributions),owner_draws:toPeso(ownerDraws),net_owner_capital:toPeso(netOwnerCapital),
  external_funding:toPeso(borrowedFunds),external_repayments:toPeso(borrowedRepayments),external_conversions:toPeso(convertedFunding),external_liability:toPeso(remainingBorrowed),
  interest_received:toPeso(earnedInterest),operating_expenses:toPeso(operatingExpenses),financing_costs:toPeso(financingCosts),
  retained_cash_earnings:toPeso(retainedEarnings),unclassified_funding:toPeso(unknownFunding),unclassified_outflows:toPeso(unclassifiedOutflows),
  reconciliation_balance:toPeso(residual),flags,
  breakdown_valid:netOwnerCapital>=0&&remainingBorrowed>=0&&retainedEarnings>=0&&residual>=0};
 return result;
}
export type StatementLine={label:string;amount:number;kind?:'total'|'subtotal'|'subheading'|'detail';note?:string};
export function buildFinancialStatements(open:StatementSnapshot,close:StatementSnapshot){
 const opening=assetSourcePosition(open),closing=assetSourcePosition(close);
 const diff=(k:keyof typeof opening)=>Number(closing[k])-Number(opening[k]);
 const delta=(k:keyof typeof opening)=>toPeso(cents(closing[k])-cents(opening[k]));
 const interest=delta('interest_received'),opExpense=delta('operating_expenses'),finCost=delta('financing_costs');
 const netProfit=toPeso(cents(interest)-cents(opExpense)-cents(finCost));
 const ownerContributions=delta('owner_contributions'),externalFunding=delta('external_funding'),ownerDraws=delta('owner_draws'),externalRepayments=delta('external_repayments');
 const noncashOwnerSettlements=delta('external_conversions');
 const unclassifiedFunding=delta('unclassified_funding'),unclassifiedOutflow=delta('unclassified_outflows');
 const borrowerReceipts=toPeso(cents(close.summary.collections)-cents(open.summary.collections));
 const releasedNet=toPeso(cents(close.summary.net_releases)-cents(open.summary.net_releases));
 const lendingCash=toPeso(cents(borrowerReceipts)-cents(releasedNet)-cents(opExpense)-cents(finCost));
 const financingCash=toPeso(cents(ownerContributions)+cents(externalFunding)-cents(ownerDraws)-cents(externalRepayments));
 const unclassifiedCash=toPeso(cents(unclassifiedFunding)-cents(unclassifiedOutflow));
 const netCash=toPeso(cents(close.summary.cash)-cents(open.summary.cash));
 const expectedCash=toPeso(cents(lendingCash)+cents(financingCash)+cents(unclassifiedCash));
 const cashDiff=toPeso(cents(netCash)-cents(expectedCash));
 const income:StatementLine[]=[
  {label:'Interest collected — net of reversals',amount:interest},{label:'Cash-basis lending income',amount:interest,kind:'subtotal'},
  {label:'Operating expenses',amount:-opExpense},{label:'Financing costs / interest paid',amount:-finCost},
  {label:'Net cash-basis operating surplus',amount:netProfit,kind:'total'}
 ];
 const cashFlow:StatementLine[]=[
  {label:'Borrower collections (principal + interest)',amount:borrowerReceipts},
  {label:'Loan releases, net of cancellations',amount:-releasedNet},
  {label:'Operating expenses paid',amount:-opExpense},
  {label:'Financing costs paid',amount:-finCost},
  {label:'Net lending operating cash movement',amount:lendingCash,kind:'subtotal'},
  {label:'Owner contributions',amount:ownerContributions},
  {label:'External borrowed funding',amount:externalFunding},
  {label:'Owner withdrawals / distributions',amount:-ownerDraws},
  {label:'Repayments of borrowed principal',amount:-externalRepayments},
  {label:'Net financing cash movement',amount:financingCash,kind:'subtotal'},
  {label:'Unclassified funding received',amount:unclassifiedFunding},
  {label:'Unclassified cash outflows',amount:-unclassifiedOutflow},
  {label:'Unclassified cash movement',amount:unclassifiedCash,kind:'subtotal'},
  {label:'Net change in cash',amount:netCash,kind:'total'},
  {label:'Cash at start of period',amount:Number(open.summary.cash)},
  {label:'Cash at end of period',amount:Number(close.summary.cash),kind:'total'}
 ];
 const position:StatementLine[]=[
  {label:'Cash balance',amount:Number(close.summary.cash)},
  {label:'Outstanding loan principal (net)',amount:Number(close.summary.principal_outstanding)},
  {label:'Total portfolio assets',amount:closing.portfolio_assets,kind:'total'},
  {label:'Outstanding external borrowed principal',amount:closing.external_liability},
  {label:'Memo: debt personally settled by owner (noncash)',amount:noncashOwnerSettlements,kind:'detail'},
  {label:'Net contributed owner capital',amount:closing.net_owner_capital},
  {label:'Accumulated cash-basis lending surplus',amount:closing.retained_cash_earnings},
  {label:'Unclassified / reconciliation balance',amount:closing.reconciliation_balance},
  {label:'Total funding, capital and reconciling items',amount:toPeso(cents(closing.external_liability)+cents(closing.net_owner_capital)+cents(closing.retained_cash_earnings)+cents(closing.reconciliation_balance)),kind:'total'}
 ];
 const warnings=[...closing.flags];
 if(cashDiff)warnings.push('Cash flow does not reconcile to ledger cash. Difference: '+cashDiff.toFixed(2));
 if(opExpense===0&&finCost===0)warnings.push('No classified period expenses were recorded; verify expenses before treating surplus as net profit.');
 if(noncashOwnerSettlements)warnings.push('A documented owner-paid external debt settlement reclassified funding without changing Cove fund cash. Verify lender release evidence.');
 warnings.push('These are cash-basis management statements, not PFRS/IFRS financial statements. Contractual interest receivable, impairment provisions, accruals and income tax are not recognized.');
 return {period:{start:open.as_of,end:close.as_of},income,cash_flow:cashFlow,financial_position:position,
  metrics:{interest,operating_expenses:opExpense,financing_costs:finCost,net_cash_surplus:netProfit,owner_net:closing.net_owner_capital,
   retained:closing.retained_cash_earnings,assets:closing.portfolio_assets,cash_flow_difference:cashDiff},
  source_mix:closing,warnings};
}
