/** Cove V3 read-only management intelligence. Financial truth comes from buildState.
 * Figures are display projections and NEVER used for database posting. */
type Row=Record<string,any>;
type Snapshot={as_of:string;summary:Row;loans:Row[];payments:Row[];borrowers:Row[];schedule_items:Row[];capital:Row[];outflows:Row[];activity:Row[];audit_log:Row[]};
type Ops={cash_accounts?:Row[];cash_allocations?:Row[];account_reconciliations?:Row[];collection_followups?:Row[];loan_extensions?:Row[];servicing_notes?:Row[]};
type CashAccountView=Row & {id:string;name:string;kind:string;mapped_balance:number;latest_reconciliation:Row|null};
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const money=(x:unknown)=>Number(x||0);
export function borrowerStatement(s:Snapshot,borrowerId:string){
 const borrower=s.borrowers.find(b=>b.id===borrowerId);
 if(!borrower)throw Error('Borrower not found');
 const loans=s.loans.filter(l=>l.borrower_id===borrowerId);
 const loanIds=new Set(loans.map(l=>l.id));
 const payments=s.payments.filter(p=>loanIds.has(p.loan_id)).sort((a,b)=>String(a.paid_on).localeCompare(String(b.paid_on))||String(a.id).localeCompare(String(b.id)));
 return {borrower,as_of:s.as_of,loans,payments,
   total_released:round(loans.reduce((n,l)=>n+money(l.principal),0)),
   principal_outstanding:round(loans.reduce((n,l)=>n+money(l.principal_outstanding),0)),
   contractual_balance:round(loans.reduce((n,l)=>n+money(l.gross_outstanding),0)),
   receipts_net:round(payments.reduce((n,p)=>n+money(p.amount),0))};
}
export function financialPerformance(s:Snapshot){
 const outflows=s.outflows||[];
 const cashInterest=money(s.summary.interest_collected);
 const operatingCosts=round(outflows.filter(o=>o.classification==='Operating expense').reduce((n,o)=>n+money(o.amount),0));
 const financingCosts=round(outflows.filter(o=>o.classification==='Financing cost').reduce((n,o)=>n+money(o.amount),0));
 const notClassified=round(outflows.filter(o=>!['Operating expense','Financing cost','Capital repayment','Owner draw','Other cash outflow'].includes(String(o.classification))).reduce((n,o)=>n+money(o.amount),0));
 const cashBasisMargin=round(cashInterest-operatingCosts-financingCosts);
 const remainingDue=money(s.summary.gross_outstanding);
 return {interest_collected:cashInterest,operating_costs:operatingCosts,financing_costs:financingCosts,
  cash_basis_margin:cashBasisMargin,unclassified_outflows:notClassified,loan_receivable:remainingDue,
  status:'Cash interest less explicitly classified operating/financing expenses; excludes tax, impairment, and accruals.'};
}
const addMonth=(year:number,month:number,delta:number)=>{const d=new Date(Date.UTC(year,month-1+delta,1));return d.toISOString().slice(0,7)};
/** Deterministic scenarios, NOT promises, risk probabilities, or accounting revenue forecasts.
 * Scenario rate only scales scheduled unpaid installments. No automatic new lending. */
export function collectionForecast(s:Snapshot,months=6,collectionFraction=0.85){
 if(!Number.isInteger(months)||months<1||months>24)throw Error('Invalid forecast horizon');
 if(!Number.isFinite(collectionFraction)||collectionFraction<0||collectionFraction>1)throw Error('Invalid scenario rate');
 const asOf=s.as_of;const [year,month]=asOf.split('-').map(Number);
 let projectedCash=money(s.summary.cash);
 const data=[];
 for(let i=0;i<months;i++){
  const period=addMonth(year,month,i);
  const due=round(s.schedule_items.filter(r=>String(r.due_date).slice(0,7)===period&&String(r.due_date)>asOf)
   .reduce((n,r)=>n+money(r.amount),0));
  const projectedCollections=round(due*collectionFraction);
  projectedCash=round(projectedCash+projectedCollections);
  data.push({month:period,scheduled_due:due,scenario_collections:projectedCollections,illustrative_cash:projectedCash});
 }
 return {as_of:asOf,rate:collectionFraction,months:data,
  warning:'Illustration only: assumes selected share of FUTURE scheduled dues is collected in its scheduled month, ignores overdue recovery, new loans, capital flows, expenses, defaults and tax.'};
}
/** Accounts are tagged transaction subsets, never replacements for global cash. */
export function cashAccountCoverage(s:Snapshot,ops:Ops){
 const allocations=(ops.cash_allocations||[]).filter(a=>String(a.occurred_on)<=s.as_of);
 const assigned=new Set(allocations.map(a=>`${a.source_kind}:${a.source_id}`));
 const sourceRows=(s.activity||[]).map(a=>({kind:({Collection:'payment',Release:'loan',Capital:'capital',Outflow:'outflow','Loan void':'loan_void'} as Record<string,string>)[a.kind],id:a.kind==='Loan void'?String(a.loan_id):String(a.id),date:String(a.date),amount:money(a.amount)}))
  .filter(a=>a.kind&&a.date<=s.as_of);
 const uncovered=sourceRows.filter(a=>!assigned.has(`${a.kind}:${a.id}`));
 const accounts:CashAccountView[]=(ops.cash_accounts||[]).map(a=>{
  const amount=round(allocations.filter(x=>x.account_id===a.id).reduce((n,x)=>n+money(x.signed_amount_cents)/100,0));
  const latest=(ops.account_reconciliations||[]).filter(r=>r.account_id===a.id&&r.as_of<=s.as_of)
    .sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at)))[0];
  return {...a,id:String(a.id),name:String(a.name),kind:String(a.kind),mapped_balance:amount,latest_reconciliation:latest||null};
 });
 const totalMapped=round(accounts.reduce((n,a)=>n+a.mapped_balance,0));
 const globalCash=money(s.summary.cash);
 return {accounts,unassigned:uncovered,unassigned_count:uncovered.length,total_mapped:totalMapped,
   global_cash:globalCash,unmapped_cash_difference:round(globalCash-totalMapped),
   complete:uncovered.length===0&&round(globalCash-totalMapped)===0};
}
export function payoffQuote(s:Snapshot,loanId:string){
 const l=s.loans.find(x=>x.id===loanId);if(!l)throw Error('Loan not found');
 return {loan_id:l.id,borrower:l.borrower_name,as_of:s.as_of,
   principal:money(l.principal_outstanding),contractual_interest_remaining:money(l.remaining_interest),
   full_contractual_payoff:money(l.gross_outstanding),eligible:l.status!=='Settled'&&l.status!=='Voided',
   note:'Full unpaid contractual balance only. Any early-settlement discount or waiver requires a separately authorized servicing design; none is applied here.'};
}
