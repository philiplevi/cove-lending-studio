import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildState} from '../lib/ledger.ts';
const cents=v=>Math.round(v*100);
function fixture(){return {
 borrowers:[{id:'B1',name:'Sample borrower A'},{id:'B2',name:'Sample borrower B'}],
 products:[{id:'P1',name:'Regular',monthly_rate:.1,max_per_loan_cents:cents(20000)}],
 loans:[{id:'L1',borrower_id:'B1',product_id:'P1',release_date:'2026-10-01',principal_cents:cents(1000),interest_cents:cents(100),payable_cents:cents(1100),monthly_rate:.1},
 {id:'L2',borrower_id:'B2',product_id:'P1',release_date:'2026-10-01',principal_cents:cents(500),interest_cents:cents(50),payable_cents:cents(550),monthly_rate:.1}],
 installments:[],payments:[{id:'R1',loan_id:'L2',paid_on:'2026-10-04',amount_cents:cents(550),principal_cents:cents(500),interest_cents:cents(50),source_ref:'X1'}],
 capital:[{id:'C1',occurred_on:'2026-10-01',amount_cents:cents(2000),source_type:'Personal'}],outflows:[],audit_log:[]};
}
test('contractual run-rate detail matches the headline and excludes settled or voided loans',()=>{
 const data=fixture();const before=buildState(data,'2026-10-03');
 assert.equal(before.summary.monthly_interest_run_rate,150);
 assert.deepEqual(before.contractual_interest_loans.map(l=>l.loan_id),['L1','L2']);
 const after=buildState(data,'2026-10-05');
 assert.equal(after.summary.monthly_interest_run_rate,100);
 assert.deepEqual(after.contractual_interest_loans.map(l=>l.loan_id),['L1']);
 assert.equal(after.contractual_interest_loans.reduce((n,l)=>n+l.monthly_interest,0),after.summary.monthly_interest_run_rate);
 data.loan_voids=[{loan_id:'L1',voided_on:'2026-10-06',principal_cents:cents(1000),reason:'Test'}];
 const voided=buildState(data,'2026-10-06');
 assert.equal(voided.summary.monthly_interest_run_rate,0);
 assert.equal(voided.contractual_interest_loans.length,0);
});
test('live checks do not mistake new posted activity for frozen workbook differences',()=>{
 const data=fixture();data.baseline={baseline:{capital:7,collections:3,cash:1,interest_dashboard:200}};
 const snap=buildState(data,'2026-10-05');
 assert.equal(snap.live_integrity.total_checks,5);
 assert.equal(snap.live_integrity.clear_checks,5);
 assert.ok(snap.reconciliation.length>0); // archived comparison still available to other views
 assert.ok(!snap.live_integrity.checks.some(c=>c.label.includes('workbook')));
 assert.equal(snap.summary.cash,1050);
});
test('live checks flag mismatched receipt allocations and repeated source refs without deleting originals',()=>{
 const data=fixture();data.payments.push({id:'R2',loan_id:'L1',paid_on:'2026-10-05',amount_cents:cents(100),principal_cents:cents(90),interest_cents:cents(9),source_ref:'X1'});
 const snap=buildState(data,'2026-10-06');
 assert.equal(snap.live_integrity.receipt_split_issues.length,1);
 assert.equal(snap.live_integrity.duplicate_references.length,1);
 assert.deepEqual([...snap.live_integrity.duplicate_references[0].ids].sort(),['R1','R2']);
 assert.equal(snap.live_integrity.clear_checks,3);
 assert.equal(snap.payments.length,2);
});
test('live checks retain original overallocations rather than hide them with clamped principal',()=>{
 const data=fixture();data.payments.push({id:'R2',loan_id:'L1',paid_on:'2026-10-05',amount_cents:cents(1110),principal_cents:cents(1010),interest_cents:cents(100)});
 const snap=buildState(data,'2026-10-06');
 assert.equal(snap.loans.find(l=>l.id==='L1').principal_outstanding,0);
 assert.equal(snap.live_integrity.allocation_issues.length,1);
 assert.equal(snap.live_integrity.allocation_issues[0].principal_over,10);
});
test('UI uses compact asset source cards, a loan breakdown, and live integrity instead of a workbook score',()=>{
 const ui=readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8');
 for(const fragment of ['function contractualInterestBreakdown','data-loan-id','contractual_interest_loans','live_integrity','Current ledger checks','live.checks']) assert.ok(ui.includes(fragment),fragment);
 assert.ok(!ui.includes('Original workbook vs. live ledger'));
 assert.ok(!ui.includes('Period statements'));
 assert.ok(!ui.includes('Historical variance & definitions'));
 assert.ok(!ui.includes('Report differences'));
});
