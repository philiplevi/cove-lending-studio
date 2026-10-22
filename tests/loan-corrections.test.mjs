import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildState} from '../lib/ledger.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/202610220001_loan_corrections.sql');
const api=read('app/api/[...path]/route.ts');
const ui=read('public/studio-app.js');
const css=read('app/studio/premium.css');

test('owner-only SQL plan, optimistic concurrency, atomic correction, and audit',()=>{
 for(const required of [
  'create table if not exists public.loan_corrections','public.cove_assert_owner(w)',
  'public.cove_plan_loan_correction','public.cove_correct_loan','pg_advisory_xact_lock',
  'expected_revision','raise exception \'The loan or receipts changed since preview',
  'receipt_reallocations','old_schedule','new_schedule','old_loan','new_loan',
  'insert into public.audit_log','source_kind=\'loan\'',
  'public.cash_allocations','public.loan_extensions','public.loan_voids',
  'auth.uid()','grant select on public.loan_corrections to authenticated'
 ]) assert.ok(sql.includes(required),`Missing safety requirement: ${required}`);
 assert.match(sql,/revoke all on public\.loan_corrections from public, anon, authenticated/i);
 assert.match(sql,/grant execute on function public\.cove_correct_loan.+authenticated/i);
});
test('receipt gross amounts/IDs remain intact, while allocation components may be corrected with originals archived',()=>{
 assert.match(sql,/update public\.payments set principal_cents=/);
 assert.doesNotMatch(sql,/update public\.payments set (?:amount_cents|paid_on|loan_id|id|source_ref)=/i);
 assert.doesNotMatch(sql,/delete from public\.payments/i);
 assert.match(sql,/not exists\s*\(\s*select 1 from public\.payments rev/);
 assert.match(sql,/sum\(amount_cents\)/);
 assert.match(sql,/Existing net receipts exceed the corrected contract/);
 assert.match(sql,/reallocations := reallocations/);
 assert.match(sql,/Receipt % exceeds the corrected contract/);
});
test('loan detail drawer has an edit button, a two-step correction preview, and audit disclosure',()=>{
 for(const required of ['Edit loan details','data-edit-loan','showEditLoan',
   'form-correct-loan','form-confirm-correction','correction-preview',
   'monthly_rate_pct','first_due_date','frequency','expected_revision',
   'correct-confirm-id','correct-acknowledge','loan_corrections'])
  assert.ok(ui.includes(required),`Missing editor: ${required}`);
 assert.match(ui,/if\(await submitLoanCorrection\(e\)\)return/);
 assert.match(ui,/correct-acknowledge.*checkbox/);
 assert.match(css,/correction-result/);
});
test('API exposes server-side preview and posting; corrected records appear in owner workspace snapshot',()=>{
 for(const required of ['cove_plan_loan_correction','cove_correct_loan','loan_corrections',"path[3]==='preview'", "path[2]==='correct'"])
  assert.ok(api.includes(required),`Missing backend action: ${required}`);
 assert.match(api,/if\(ctx\.role!==\'owner\'\)/);
});
function fixture(){return {
 borrowers:[{id:'C1',name:'Example',status:'Active'}],products:[{id:'LT1',name:'Regular A',monthly_rate:0.1}],
 loans:[{id:'LN1',borrower_id:'C1',product_id:'LT1',principal_cents:1000000,interest_cents:100000,payable_cents:1100000,monthly_rate:.1,term_months:1,release_date:'2026-10-11'}],
 installments:[{loan_id:'LN1',installment_no:1,due_date:'2026-10-26',amount_cents:550000},{loan_id:'LN1',installment_no:2,due_date:'2026-11-11',amount_cents:550000}],
 payments:[{id:'R1',loan_id:'LN1',paid_on:'2026-10-20',amount_cents:300000,principal_cents:250000,interest_cents:50000,method:'Cash'}],
 capital:[{id:'CI1',occurred_on:'2026-10-10',amount_cents:2000000}],outflows:[],audit_log:[],baseline:null,loan_corrections:[]
}}
test('recomputed contract and corrected splits flow through all ledger and maturity metrics',()=>{
 const x=fixture();const before=buildState(x,'2026-10-22');
 assert.equal(before.summary.cash,13000);
 assert.equal(before.summary.principal_outstanding,7500);
 assert.equal(before.summary.gross_outstanding,8000);
 x.loans[0]={...x.loans[0],principal_cents:900000,interest_cents:45000,payable_cents:945000,monthly_rate:.05};
 x.installments=[{loan_id:'LN1',installment_no:1,due_date:'2026-10-26',amount_cents:472500},{loan_id:'LN1',installment_no:2,due_date:'2026-11-11',amount_cents:472500}];
 // Keeps receipt amount constant while moving interest overflow to principal.
 x.payments[0]={...x.payments[0],principal_cents:255000,interest_cents:45000};
 x.loan_corrections=[{loan_id:'LN1',corrected_at:'2026-10-22T10:00:00Z',reason:'Initial monthly interest rate was entered incorrectly'}];
 const after=buildState(x,'2026-10-22');
 assert.equal(after.summary.cash,14000); // Restated disbursement; receipt gross unchanged.
 assert.equal(after.summary.collections,3000);
 assert.equal(after.summary.interest_collected,450);
 assert.equal(after.summary.principal_outstanding,6450);
 assert.equal(after.summary.gross_outstanding,6450);
 assert.equal(after.summary.monthly_interest_run_rate,450);
 assert.equal(after.summary.scheduled_final_collection_date,'2026-11-11');
 assert.equal(after.loan_corrections.length,1);
});
