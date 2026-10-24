import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildState} from '../lib/ledger.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/202610240001_cancel_loans.sql');
const api=read('app/api/[...path]/route.ts');
const ui=read('public/studio-app.js');
const css=read('app/studio/premium.css');
const data=()=>({
 borrowers:[{id:'C001',name:'Sample client'}],products:[{id:'LT01',name:'Regular A',monthly_rate:.1}],
 loans:[{id:'LN007',borrower_id:'C001',product_id:'LT01',release_date:'2026-10-10',principal_cents:1000000,interest_cents:100000,payable_cents:1100000,monthly_rate:.1,term_months:1,source:'Imported workbook'}],
 installments:[{loan_id:'LN007',installment_no:1,due_date:'2026-10-25',amount_cents:550000},{loan_id:'LN007',installment_no:2,due_date:'2026-11-10',amount_cents:550000}],
 payments:[],capital:[{id:'CI1',occurred_on:'2026-10-01',amount_cents:1500000}],outflows:[],audit_log:[],baseline:null
});
test('cancellation nets out a mistaken imported loan without deleting it and preserves earlier as-of',()=>{
 const d=data();d.loan_voids=[{loan_id:'LN007',voided_on:'2026-10-24',principal_cents:1000000,reason:'Loan was never actually disbursed',void_kind:'Cancellation',cash_disposition:'Never disbursed'}];
 const previous=buildState(d,'2026-10-23');
 assert.equal(previous.summary.cash,5000);assert.equal(previous.summary.principal_outstanding,10000);
 assert.equal(previous.loans[0].status,'Active');
 const current=buildState(d,'2026-10-24');
 assert.equal(current.summary.cash,15000);
 assert.equal(current.summary.principal_outstanding,0);
 assert.equal(current.summary.gross_outstanding,0);
 assert.equal(current.summary.portfolio_assets,15000);
 assert.equal(current.summary.release_reversals,10000);
 assert.equal(current.summary.net_releases,0);
 assert.equal(current.loans[0].status,'Voided');
 assert.equal(current.loans[0].void_kind,'Cancellation');
 assert.ok(current.activity.some(a=>a.kind==='Loan void'&&a.title.includes('Loan cancelled')));
});
test('fully reversed receipts net to zero before cancellation while leaving both receipts in history',()=>{
 const d=data();d.payments=[
  {id:'R1',loan_id:'LN007',paid_on:'2026-10-15',amount_cents:200000,principal_cents:180000,interest_cents:20000,method:'Cash'},
  {id:'R2',loan_id:'LN007',paid_on:'2026-10-24',amount_cents:-200000,principal_cents:-180000,interest_cents:-20000,reverses_id:'R1',method:'Cash'}
 ];
 d.loan_voids=[{loan_id:'LN007',voided_on:'2026-10-24',principal_cents:1000000,reason:'Loan did not exist',void_kind:'Cancellation'}];
 const result=buildState(d,'2026-10-24');
 assert.equal(result.summary.cash,15000);
 assert.equal(result.summary.collections,0);
 assert.equal(result.payments.length,2);
 assert.equal(result.summary.voided_loans,1);
});
test('cancellation SQL requires owner, zero net receipts, verified funds, imported consent, and account safety',()=>{
 for(const item of ['public.cove_assert_owner(w)','pg_advisory_xact_lock',"v->>'funds_confirmed'",'cash_disposition',"v->>'confirm_imported'",'expected_principal_cents',
   'expected_active_receipt_ids','public.cash_allocations','public.loan_extensions','net_total<>0','net_principal<>0','net_interest<>0',
   'public.cove_cash(w,today_ph)','insert into public.loan_voids','insert into public.audit_log','contract_snapshot','grant execute on function public.cove_cancel_loan'])
  assert.ok(sql.includes(item),`Missing cancellation safeguard: ${item}`);
 assert.doesNotMatch(sql,/\bdelete\s+from\s+public\.(loans|payments|installments|loan_voids)/i);
 assert.doesNotMatch(sql,/\bupdate\s+public\.(loans|payments|installments)\b/i);
});
test('UI exposes a loan cancellation from details, shows blockers and requires cash and ID acknowledgement',()=>{
 for(const t of ['data-cancel-loan','showCancelLoan','submitCancelLoan','form-cancel-loan','cancel-funds-state','cancel-imported','cancel-cash-confirmed','cancel-confirm-id','cancel-reason','expected_active_receipt_ids'])
  assert.ok(ui.includes(t),`Missing client-side cancellation control: ${t}`);
 assert.match(css,/\.cancel-loan-button/);
 assert.match(api, /path\[2\]==='cancel'/);
 assert.match(api, /cove_cancel_loan/);
 assert.match(api, /if\(ctx\.role!=='owner'\)/);
});
