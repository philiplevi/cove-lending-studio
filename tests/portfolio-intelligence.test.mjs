import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildState} from '../lib/ledger.ts';
const c=n=>Math.round(n*100);
function make({payments=[],voids=[]}={}){
 return {
  borrowers:[{id:'B01',name:'Sample A',contact:'',status:'Active'},{id:'B02',name:'Sample B',contact:'',status:'Active'}],
  products:[{id:'P01',name:'Regular',monthly_rate:0.1,max_per_loan_cents:c(20000)}],
  loans:[
   {id:'L01',borrower_id:'B01',product_id:'P01',principal_cents:c(5000),interest_cents:c(1000),payable_cents:c(6000),monthly_rate:.1,release_date:'2026-10-01'},
   {id:'L02',borrower_id:'B02',product_id:'P01',principal_cents:c(10000),interest_cents:c(2000),payable_cents:c(12000),monthly_rate:.07,release_date:'2026-10-01'}
  ],
  installments:[
   {loan_id:'L01',installment_no:1,due_date:'2026-10-10',amount_cents:c(3000)},
   {loan_id:'L01',installment_no:2,due_date:'2026-11-10',amount_cents:c(3000)},
   {loan_id:'L02',installment_no:1,due_date:'2026-10-16',amount_cents:c(4000)},
   {loan_id:'L02',installment_no:2,due_date:'2026-11-16',amount_cents:c(4000)},
   {loan_id:'L02',installment_no:3,due_date:'2026-12-16',amount_cents:c(4000)}
  ],payments,capital:[{id:'C01',amount_cents:c(30000),occurred_on:'2026-10-01',source_type:'Personal'}],outflows:[],audit_log:[],loan_voids:voids,baseline:null
 };
}
const paid=(id,loan,amount,principal,interest,day='2026-10-14')=>({id,loan_id:loan,paid_on:day,amount_cents:c(amount),principal_cents:c(principal),interest_cents:c(interest),method:'Cash'});
test('V2.4 monthly contract run rate and final active-loan due date reflect as-of portfolio',()=>{
 const d=buildState(make(),'2026-10-16');
 assert.equal(d.summary.monthly_interest_run_rate,1200); // 5k×10% + 10k×7%
 assert.equal(d.summary.scheduled_final_collection_date,'2026-12-16');
 assert.equal(d.summary.capital_deployed_pct,50);
 assert.equal(d.summary.available_capital,30000);
 assert.equal(d.collection_intelligence.due_today,4000);
 assert.equal(d.collection_intelligence.past_due,3000);
 assert.equal(d.collection_intelligence.due_next_30_days,3000); // second L01 installment
 assert.equal(d.collection_intelligence.aging[0].amount,3000);
 assert.equal(d.schedule_items.length,5);
});
test('V2.4 partial payment uses oldest-first schedule allocation and preserves financial ledger',()=>{
 const d=buildState(make({payments:[paid('R01','L01',3500,3000,500)]}),'2026-10-16');
 assert.equal(d.collection_intelligence.past_due,0);
 const l1=d.schedule_items.filter(r=>r.loan_id==='L01');
 assert.deepEqual(l1.map(i=>i.amount),[2500]);
 assert.equal(l1[0].paid,500);
 assert.equal(d.summary.interest_collected,500);
 assert.equal(d.summary.principal_outstanding,12000);
 assert.equal(d.summary.monthly_interest_run_rate,1200); // flat contract, not declining-balance interest
});
test('V2.4 full payment removes paid loan from interest run rate and maturity',()=>{
 const d=buildState(make({payments:[paid('R01','L02',12000,10000,2000)]}),'2026-10-16');
 assert.equal(d.summary.monthly_interest_run_rate,500);
 assert.equal(d.summary.scheduled_final_collection_date,'2026-11-10');
 assert.ok(d.schedule_items.every(i=>i.loan_id==='L01'));
});
test('V2.4 void record changes metrics on void date but keeps earlier as-of snapshot',()=>{
 const raw=make({voids:[{loan_id:'L02',voided_on:'2026-10-17',principal_cents:c(10000),reason:'Sample acceptance test reversal'}]});
 const earlier=buildState(raw,'2026-10-16');const later=buildState(raw,'2026-10-17');
 assert.equal(earlier.summary.monthly_interest_run_rate,1200);
 assert.equal(later.summary.monthly_interest_run_rate,500);
 assert.equal(later.summary.scheduled_final_collection_date,'2026-11-10');
 assert.ok(later.schedule_items.every(i=>i.loan_id==='L01'));
});
test('V2.4 empty and settled portfolios give no misleading collection date or coverage percentage',()=>{
 const raw=make({payments:[paid('R1','L01',6000,5000,1000),paid('R2','L02',12000,10000,2000)]});
 const d=buildState(raw,'2026-12-20');
 assert.equal(d.summary.monthly_interest_run_rate,0);
 assert.equal(d.summary.scheduled_final_collection_date,null);
 assert.equal(d.schedule_items.length,0);
 const empty=make();empty.loans=[];empty.installments=[];
 const e=buildState(empty,'2026-10-16');
 assert.equal(e.collection_intelligence.collection_coverage_pct,null);
 assert.equal(e.summary.scheduled_final_collection_date,null);
});
test('V2.4 collection aging and coverage reflect as-of dates, no future leakage',()=>{
 const raw=make({payments:[paid('R1','L01',1000,900,100)]});
 const initial=buildState(raw,'2026-10-09');
 assert.equal(initial.summary.collections,0);
 assert.equal(initial.collection_intelligence.past_due,0);
 const after=buildState(raw,'2026-11-19');
 assert.equal(after.collection_intelligence.past_due,13000); // L01: 5k; L02: 8k
 assert.equal(after.collection_intelligence.aging[0].amount,7000); // Nov 10 + Nov 16
 assert.equal(after.collection_intelligence.aging[1].amount,6000); // Oct 10 partly paid + Oct 16
 assert.equal(after.collection_intelligence.due_to_date,14000);
 assert.equal(after.collection_intelligence.covered_due_to_date,1000);
 assert.equal(after.collection_intelligence.collection_coverage_pct,7.14);
});
test('V2.4 dashboard and planner are wired to projection from a single source',()=>{
 const js=fs.readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8');
 const page=fs.readFileSync(new URL('../app/studio/page.tsx',import.meta.url),'utf8');
 assert.match(js,/function capitalSnapshot\(\)/);assert.match(js,/function schedulePage\(\)/);
 assert.match(js,/capitalSnapshot\(\)/);assert.match(js,/schedule:schedulePage/);
 assert.match(js,/scheduled_final_collection_date/);assert.match(js,/monthly_interest_run_rate/);
 assert.match(page,/data-page="schedule"/);
 assert.match(js,/function filteredSchedule\(\)/);assert.match(js,/scheduleFilter/);
});

test('V2.4 dashboard, collection planner, filters and insights render without runtime errors', async()=>{
 const fixture=buildState(make(),'2026-10-16');
 const elements=Object.fromEntries(['main','modal-root','drawer-root','nav-warning','breadcrumb'].map(id=>[id,{innerHTML:'',style:{},textContent:''}]));
 const document={querySelectorAll:()=>[],getElementById:id=>elements[id]||(elements[id]={innerHTML:'',style:{},textContent:''}),addEventListener:()=>{},querySelector:()=>null};
 const context=vm.createContext({console,document,window:{scrollTo(){}},fetch:async()=>({ok:true,json:async()=>fixture}),Intl,Date,Math,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8'),context);
 await new Promise(r=>setTimeout(r,15));
 assert.match(elements.main.innerHTML,/MONTHLY CONTRACTUAL INTEREST/);
 assert.match(elements.main.innerHTML,/1,200/);
 assert.match(elements.main.innerHTML,/Dec 16, 2026/);
 vm.runInContext("UI.page='schedule';render()",context);
 assert.match(elements.main.innerHTML,/Unpaid installment schedule/);
 vm.runInContext("UI.scheduleFilter='Overdue';render()",context);
 assert.match(elements.main.innerHTML,/Overdue/);
 vm.runInContext("UI.page='reports';render()",context);
 assert.match(elements.main.innerHTML,/Past-due aging/);
});
