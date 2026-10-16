import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildState} from '../lib/ledger.ts';
function fixture(){
  return{borrowers:[{id:'C001',name:'Example Borrower',contact:'',status:'Active'}],products:[{id:'LT01',name:'Regular Loan A',monthly_rate:0.1,max_per_loan_cents:1000000}],
    loans:[{id:'LN0001',borrower_id:'C001',product_id:'LT01',principal_cents:100000,interest_cents:10000,payable_cents:110000,monthly_rate:0.1,term_months:1,release_date:'2026-09-01'}],
    installments:[{loan_id:'LN0001',installment_no:1,due_date:'2026-09-15',amount_cents:55000},{loan_id:'LN0001',installment_no:2,due_date:'2026-09-30',amount_cents:55000}],
    payments:[{id:'R000001',loan_id:'LN0001',paid_on:'2026-09-15',amount_cents:55000,principal_cents:50000,interest_cents:5000,method:'Cash',source_ref:'R000001'}],
    capital:[{id:'CI001',occurred_on:'2026-09-01',amount_cents:200000,source_type:'Personal'}],outflows:[],audit_log:[],baseline:null};
}
test('cash balance, interest, principal, assets, and due status reconcile from cents',()=>{
 const s=buildState(fixture(),'2026-10-09');
 assert.equal(s.summary.cash,1550); assert.equal(s.summary.principal_outstanding,500);
 assert.equal(s.summary.portfolio_assets,2050);assert.equal(s.summary.interest_collected,50);
 assert.equal(s.summary.gross_outstanding,550);assert.equal(s.summary.overdue_amount,550);
 assert.equal(s.loans[0].status,'Overdue');assert.equal(s.summary.overdue_loans,1);
});
test('as-of filtering excludes future payments and remains stable',()=>{
 const x=fixture();
 const s=buildState(x,'2026-09-10');assert.equal(s.summary.cash,1000);assert.equal(s.summary.principal_outstanding,1000);
 assert.equal(s.summary.collections,0); assert.equal(s.summary.overdue_amount,0);
});
test('reversal is accounted for as a signed transaction',()=>{
 const x=fixture(); x.payments.push({id:'R000002',loan_id:'LN0001',paid_on:'2026-10-01',amount_cents:-55000,principal_cents:-50000,interest_cents:-5000,method:'Cash',reverses_id:'R000001'});
 const s=buildState(x,'2026-10-09');assert.equal(s.summary.collections,0);assert.equal(s.summary.principal_outstanding,1000);assert.equal(s.summary.cash,1000);
});
const seedPath = new URL('../private_import/legacy_seed.json', import.meta.url);
test('historic spreadsheet import reconciles against the private seed', {skip:!fs.existsSync(seedPath)},()=>{
 const path=seedPath;
 const seed=JSON.parse(fs.readFileSync(path,'utf8'));
 const cents=v=>Math.round(Number(v)*100);
 const input={borrowers:seed.borrowers,products:seed.products.map(p=>({...p,max_per_loan_cents:cents(p.max_per_loan)})),
   loans:seed.loans.map(l=>({...l,principal_cents:cents(l.principal),interest_cents:cents(l.total_interest),payable_cents:cents(l.total_payable)})),
   installments:seed.loans.flatMap(l=>l.schedule.map((due_date,i)=>({loan_id:l.id,installment_no:i+1,due_date,amount_cents:Math.floor(cents(l.total_payable)/l.schedule.length)+(i<cents(l.total_payable)%l.schedule.length?1:0)}))),
   payments:seed.payments.map(p=>({...p,paid_on:p.date,amount_cents:cents(p.amount),principal_cents:cents(p.principal),interest_cents:cents(p.interest),source_ref:p.source_id})),
   capital:seed.capital.map(c=>({...c,occurred_on:c.date,amount_cents:cents(c.amount),source_type:c.source,funding_interest_cents:cents(c.monthly_interest_expense)})),
   outflows:seed.outflows.map(o=>({...o,occurred_on:o.date,amount_cents:cents(o.amount)})),audit_log:[],baseline:{source_name:seed.metadata.source,baseline:seed.spreadsheet_summary}};
 const s=buildState(input,'2026-10-08');
 assert.equal(s.summary.capital,37000);assert.equal(s.summary.releases,219000);assert.equal(s.summary.collections,236100);
 assert.equal(s.summary.cash,1350);assert.equal(s.summary.principal_outstanding,27083);assert.equal(s.summary.portfolio_assets,28433);
 assert.equal(s.summary.interest_collected,44176);assert.equal(s.summary.active_loans,6);
 assert.ok(s.exceptions.find(x=>x.includes('R000024')));
});
