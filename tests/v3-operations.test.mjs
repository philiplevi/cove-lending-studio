import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildState} from '../lib/ledger.ts';
import {borrowerStatement,financialPerformance,collectionForecast,cashAccountCoverage,payoffQuote} from '../lib/management.ts';
const cents=x=>Math.round(x*100);
function raw(){return {
 borrowers:[{id:'C001',name:'Sample Borrower',contact:'',status:'Active'}],
 products:[{id:'LT01',name:'Regular',monthly_rate:.1,max_per_loan_cents:cents(20000)}],
 loans:[{id:'LN001',borrower_id:'C001',product_id:'LT01',release_date:'2026-10-01',principal_cents:cents(10000),interest_cents:cents(2000),payable_cents:cents(12000),monthly_rate:.1,term_months:2,source:'New entry'}],
 installments:[{loan_id:'LN001',installment_no:1,due_date:'2026-10-20',amount_cents:cents(3000)},{loan_id:'LN001',installment_no:2,due_date:'2026-11-04',amount_cents:cents(3000)},{loan_id:'LN001',installment_no:3,due_date:'2026-11-19',amount_cents:cents(3000)},{loan_id:'LN001',installment_no:4,due_date:'2026-12-04',amount_cents:cents(3000)}],
 payments:[],capital:[{id:'CI001',occurred_on:'2026-10-01',amount_cents:cents(15000),source_type:'Personal'}],
 outflows:[],audit_log:[],loan_voids:[],loan_extensions:[],baseline:null};}
test('V3 as-of maturity extension shifts future installments without changing financial amounts',()=>{
 const input=raw(); input.loan_extensions=[{id:'abc',loan_id:'LN001',effective_on:'2026-10-16',previous_maturity:'2026-12-04',new_maturity:'2027-01-08',reason:'Agreed extension for borrower'}];
 const before=buildState(input,'2026-10-15'); const after=buildState(input,'2026-10-16');
 assert.equal(before.summary.scheduled_final_collection_date,'2026-12-04');
 assert.equal(after.summary.scheduled_final_collection_date,'2027-01-08');
 assert.equal(after.loans[0].schedule[0].due_date,'2026-11-24');
 assert.equal(after.loans[0].schedule[3].due_date,'2027-01-08');
 assert.equal(after.summary.cash,before.summary.cash);
 assert.equal(after.summary.principal_outstanding,before.summary.principal_outstanding);
 assert.equal(after.summary.monthly_interest_run_rate,before.summary.monthly_interest_run_rate);
 assert.equal(input.installments[0].due_date,'2026-10-20'); // original untouched
});
test('V3 paid and reversed receipts are both represented in borrower statements',()=>{
 const input=raw();input.payments=[{id:'R1',loan_id:'LN001',paid_on:'2026-10-05',amount_cents:300000,principal_cents:250000,interest_cents:50000},{id:'R2',loan_id:'LN001',paid_on:'2026-10-07',amount_cents:-300000,principal_cents:-250000,interest_cents:-50000,reverses_id:'R1'}];
 const statement=borrowerStatement(buildState(input,'2026-10-17'),'C001');
 assert.equal(statement.receipts_net,0);assert.equal(statement.payments.length,2);
 assert.equal(statement.principal_outstanding,10000);
 assert.equal(statement.contractual_balance,12000);
});
test('V3 payoff does not invent interest waivers',()=>{
 const quote=payoffQuote(buildState(raw(),'2026-10-17'),'LN001');
 assert.equal(quote.full_contractual_payoff,12000);
 assert.equal(quote.contractual_interest_remaining,2000);
 assert.match(quote.note,/discount or waiver/);
});
test('V3 cash profitability excludes principal collections, owner drawings and capital',()=>{
 const input=raw();input.outflows=[
 {id:'D1',occurred_on:'2026-10-05',classification:'Operating expense',amount_cents:5000},
 {id:'D2',occurred_on:'2026-10-05',classification:'Financing cost',amount_cents:1000},
 {id:'D3',occurred_on:'2026-10-05',classification:'Capital repayment',amount_cents:25000},
 {id:'D4',occurred_on:'2026-10-05',classification:'Withdrawal',amount_cents:20000},
 ];input.payments=[{id:'R1',loan_id:'LN001',paid_on:'2026-10-05',amount_cents:300000,principal_cents:250000,interest_cents:50000}];
 const p=financialPerformance(buildState(input,'2026-10-17'));
 assert.equal(p.interest_collected,500);assert.equal(p.operating_costs,50);assert.equal(p.financing_costs,10);
 assert.equal(p.cash_basis_margin,440);assert.equal(p.unclassified_outflows,200);
});
test('V3 forecast scenarios are transparent and only use future unpaid installments',()=>{
 const s=buildState(raw(),'2026-10-16');const fc=collectionForecast(s,3,.5);
 assert.equal(fc.months[0].scheduled_due,3000);
 assert.equal(fc.months[0].scenario_collections,1500);
 assert.equal(fc.months[1].scheduled_due,6000);
 assert.equal(fc.months[2].scheduled_due,3000);
 assert.match(fc.warning,/ignores overdue recovery/);
});
test('V3 account tagging does not alter the fund cashbook, and unmapped is visible',()=>{
 const s=buildState(raw(),'2026-10-17');const ops={cash_accounts:[{id:'bank',name:'Main',kind:'Bank'}],cash_allocations:[{account_id:'bank',source_kind:'capital',source_id:'CI001',occurred_on:'2026-10-01',signed_amount_cents:1500000}]};
 const r=cashAccountCoverage(s,ops);
 assert.equal(r.accounts[0].id,'bank');assert.equal(r.accounts[0].name,'Main');assert.equal(r.accounts[0].kind,'Bank');
 assert.equal(r.total_mapped,15000);assert.equal(r.global_cash,5000);
 assert.equal(r.unassigned_count,1);assert.equal(r.unmapped_cash_difference,-10000);
 assert.equal(r.complete,false);
});
test('V3 loan void remains separate from extension and forecast',()=>{
 const input=raw();input.loan_voids=[{loan_id:'LN001',voided_on:'2026-10-18',principal_cents:cents(10000)}];
 const early=buildState(input,'2026-10-17');const later=buildState(input,'2026-10-18');
 assert.equal(early.summary.active_loans,1);assert.equal(later.summary.active_loans,0);
 assert.equal(collectionForecast(later,3,1).months[0].scheduled_due,0);
 assert.equal(later.summary.cash,15000);
});
test('V3 SQL migration adds owner-guarded atomic operations and read-only RLS',()=>{
 const sql=fs.readFileSync(new URL('../supabase/migrations/202610170002_cove_v3_operations.sql',import.meta.url),'utf8');
 for(const table of ['loan_extensions','cash_accounts','cash_allocations','account_reconciliations','collection_followups','servicing_notes'])assert.match(sql,new RegExp(`create table if not exists public\\.${table}`));
 assert.match(sql,/public\.cove_assert_owner\(w\)/);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on function public\.cove_operations/);assert.match(sql,/grant execute on function public\.cove_operations/);
 assert.match(sql,/Original|original|existing loan|Existing overdue/);
});
test('V3 route protects client writes and applies same workspace filter',()=>{
 const api=fs.readFileSync(new URL('../app/api/operations/route.ts',import.meta.url),'utf8');
 assert.match(api,/x-cove-request/);assert.match(api,/s\.role!=='owner'/);assert.match(api,/eq\('workspace_id',s\.workspace\)/);
 assert.match(api,/cove_operations/);
 const view=fs.readFileSync(new URL('../app/studio/command/page.tsx',import.meta.url),'utf8');
 for(const label of ['Loan servicing','Borrower statements','Cash reconciliation','Follow-ups','Audit & security'])assert.ok(view.includes(label));
 assert.match(view,/Print \/ Save as PDF/);assert.match(view,/collectionForecast/);assert.match(view,/api\/operations/);
});
