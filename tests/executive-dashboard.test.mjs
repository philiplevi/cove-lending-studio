import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildState} from '../lib/ledger.ts';
const cents=n=>Math.round(n*100);
function data({payments=[],voids=[]}={}){
 return {borrowers:[{id:'b1',name:'Client 1'},{id:'b2',name:'Client 2'}],products:[{id:'p',name:'Regular',monthly_rate:.1}],
 loans:[{id:'l1',borrower_id:'b1',product_id:'p',release_date:'2026-10-01',principal_cents:cents(5000),interest_cents:cents(1000),payable_cents:cents(6000),monthly_rate:.1},
 {id:'l2',borrower_id:'b2',product_id:'p',release_date:'2026-10-01',principal_cents:cents(10000),interest_cents:cents(2000),payable_cents:cents(12000),monthly_rate:.1}],
 installments:[{loan_id:'l1',installment_no:1,due_date:'2026-10-10',amount_cents:cents(3000)},
 {loan_id:'l1',installment_no:2,due_date:'2026-12-10',amount_cents:cents(3000)},
 {loan_id:'l2',installment_no:1,due_date:'2026-10-16',amount_cents:cents(4000)},
 {loan_id:'l2',installment_no:2,due_date:'2026-11-16',amount_cents:cents(4000)},
 {loan_id:'l2',installment_no:3,due_date:'2026-12-16',amount_cents:cents(4000)}],
 payments,capital:[],outflows:[],loan_voids:voids,audit_log:[],baseline:null};
}
const payment={id:'r1',loan_id:'l1',amount_cents:cents(6000),principal_cents:cents(5000),interest_cents:cents(1000),paid_on:'2026-11-10'};
test('PAR30 is based on whole outstanding principal, not just overdue installments',()=>{
 const snap=buildState(data(),'2026-11-12');
 assert.equal(snap.summary.principal_outstanding,15000);
 assert.equal(snap.summary.principal_at_risk_30,5000);
 assert.equal(snap.summary.par30_pct,33.33);
 assert.equal(snap.summary.par60_pct,0);
 assert.equal(snap.summary.par90_pct,0);
 assert.equal(snap.summary.active_borrowers,2);
 assert.equal(snap.summary.principal_aging.reduce((n,x)=>n+x.principal,0),15000);
 assert.ok(snap.summary.overdue_amount < snap.summary.principal_at_risk_30+snap.summary.gross_outstanding);
});
test('PAR snapshots do not include future lateness and settled loans are not risky',()=>{
 const before=buildState(data({payments:[payment]}),'2026-10-16');
 assert.equal(before.summary.par30_pct,0);
 assert.equal(before.summary.principal_outstanding,15000);
 const after=buildState(data({payments:[payment]}),'2026-11-12');
 assert.equal(after.summary.principal_outstanding,10000);
 assert.equal(after.summary.par30_pct,0);
 assert.equal(after.summary.active_borrowers,1);
});
test('Voiding an unreleased test loan excludes it from principal-at-risk without rewriting earlier as-of history',()=>{
 const voids=[{loan_id:'l1',principal_cents:cents(5000),voided_on:'2026-11-13',reason:'Test void'}];
 assert.equal(buildState(data({voids}),'2026-11-12').summary.par30_pct,33.33);
 assert.equal(buildState(data({voids}),'2026-11-13').summary.par30_pct,0);
});
test('Zero principal has undefined PAR ratio rather than a misleading 0% risk',()=>{
 const d=data();d.loans=[];d.installments=[];
 const empty=buildState(d,'2026-11-12');
 assert.equal(empty.summary.par30_pct,null);assert.equal(empty.summary.par60_pct,null);
 assert.equal(empty.summary.principal_at_risk_30,0);assert.equal(empty.summary.active_borrowers,0);
});
test('Dashboard exposes relevant lending measures and definitions with no second posting ledger',()=>{
 const js=readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/studio/executive.css',import.meta.url),'utf8');
 const page=readFileSync(new URL('../app/studio/page.tsx',import.meta.url),'utf8');
 for(const label of ['TOTAL PORTFOLIO ASSETS','MONTHLY CONTRACTUAL INTEREST','FINAL SCHEDULED DUE DATE','Portfolio quality','PAR30','Collection coverage','Collections to prioritize','Cash withdrawn / spent'])assert.ok(js.includes(label),`Missing ${label}`);
 assert.match(js,/s\.principal_at_risk_30/);assert.match(js,/s\.par30_pct/);assert.match(js,/s\.scheduled_final_collection_date/);
 assert.match(css,/\.v31-metric-grid/);assert.match(css,/@media\(max-width:620px\)/);assert.match(css,/:focus-visible/);
 assert.match(page,/import '\.\/executive\.css';/);
});
