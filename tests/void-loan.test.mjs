import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url),'utf8');
const sql = read('supabase/migrations/202610170001_void_test_loans.sql');
const api = read('app/api/[...path]/route.ts');
const ui = read('public/studio-app.js');
const ledger = read('lib/ledger.ts');
test('loan void migration retains loan/receipt records, blocks imported loans, and requires owner',()=>{
 for(const fragment of ['create table if not exists public.loan_voids','public.cove_assert_owner(w)',"target.source <> 'New entry'",'pg_advisory_xact_lock','public.cove_void_test_loan','test_only','expected_active_receipt_ids','reverses_id','insert into public.audit_log','public.cove_cash'])
   assert.ok(sql.includes(fragment),`Missing safety contract: ${fragment}`);
 assert.doesNotMatch(sql,/\bdelete\s+from\s+public\.(loans|payments)/i);
 assert.doesNotMatch(sql,/\bupdate\s+public\.(loans|payments)/i);
});
test('V2.3 API calls authenticated atomic database procedure and snapshots include loan voids',()=>{
 assert.match(api,/path\[2\]==='void'/);
 assert.match(api,/cove_void_test_loan/);
 assert.match(api,/loan_voids/);
});
test('V2.3 UI requires explicit loan ID and test-only acknowledgment',()=>{
 for(const fragment of ['showVoidLoan','void-confirm-id','void-test-only','expected_active_receipt_ids','expected_principal_cents','form-void-loan','data-void-loan'])
   assert.ok(ui.includes(fragment),`Missing confirmation: ${fragment}`);
 assert.ok(ui.includes("loan.source==='New entry'"));
 assert.match(read('app/studio/premium.css'), /#modal-root \.modal-backdrop\{z-index:100\}/);
 assert.match(ledger,/voided_loans:/);
 assert.match(ledger,/release_reversals/);
});
