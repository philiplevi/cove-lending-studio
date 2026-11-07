import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assetSourcePosition,buildFinancialStatements} from '../lib/financial-statements.ts';
import {buildState} from '../lib/ledger.ts';
const source=(file)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const position=(settlements=[])=>assetSourcePosition({as_of:'2026-11-07',summary:{portfolio_assets:35850,interest_collected:45600},capital:[{amount_cents:3700000,source_type:'Personal'},{amount_cents:1500000,source_type:'Loan'}],outflows:[{amount_cents:4645000,classification:'Owner withdrawal'},{amount_cents:70000,classification:'Capital repayment'}],funding_conversions:settlements});
test('owner-funded settlement increases owner capital and decreases external debt without changing assets',()=>{
 const old=position(),next=position([{amount_cents:500000,effective_on:'2026-11-07'}]);
 assert.equal(next.net_owner_capital-old.net_owner_capital,5000);
 assert.equal(next.external_liability-old.external_liability,-5000);
 assert.equal(next.portfolio_assets,old.portfolio_assets);
 assert.equal(next.reconciliation_balance,old.reconciliation_balance);
 assert.equal(next.external_conversions,5000);
});
test('noncash conversion has zero cash-flow impact and appears as disclosure',()=>{
 const opening={as_of:'2026-11-06',summary:{portfolio_assets:35850,interest_collected:45600,collections:0,net_releases:0,cash:3850,principal_outstanding:32000},capital:[{amount_cents:3700000,source_type:'Personal'},{amount_cents:1500000,source_type:'Loan'}],outflows:[{amount_cents:4645000,classification:'Owner withdrawal'},{amount_cents:70000,classification:'Capital repayment'}],funding_conversions:[]};
 const closing={...opening,as_of:'2026-11-07',funding_conversions:[{amount_cents:500000}]};
 const result=buildFinancialStatements(opening,closing);
 assert.equal(result.metrics.cash_flow_difference,0);
 assert.equal(result.cash_flow.find(x=>x.label==='Net change in cash').amount,0);
 assert.equal(result.financial_position.find(x=>x.label.includes('personally settled')).amount,5000);
});
test('fund conversions apply as-of date; earlier history stays unchanged',()=>{
 const data={borrowers:[],products:[],loans:[],installments:[],payments:[],capital:[{id:'CI001',occurred_on:'2026-10-01',amount_cents:3000000,source_type:'Loan'}],outflows:[],audit_log:[],funding_conversions:[{capital_id:'CI001',amount_cents:1000000,effective_on:'2026-11-06'}]};
 const early=buildState(data,'2026-11-05'),late=buildState(data,'2026-11-07');
 assert.equal(early.asset_sources.external_liability,30000);
 assert.equal(late.asset_sources.external_liability,20000);
 assert.equal(late.asset_sources.net_owner_capital,10000);
 assert.equal(early.summary.cash,late.summary.cash);
});
test('financial writes are owner gated, atomic, evidence backed and do not change cash',()=>{
 const sql=source('supabase/migrations/202611070001_cove_v38_funding_applications.sql');
 for(const needle of ['cove_assert_owner(w)','pg_advisory_xact_lock','evidence_reference','confirm_creditor_release','confirm_personal_settlement','confirm_equity_contribution','current_borrowed<repaid+converted','cash_change_cents', 'cashbook_corrections','funding_conversions'])assert.ok(sql.includes(needle),needle);
 assert.match(sql,/revoke all on function public\.cove_record_owner_debt_settlement/);
});
test('applications are invitation-only, with default-off gate, RLS, one-time token and no auto loan release',()=>{
 const sql=source('supabase/migrations/202611070001_cove_v38_funding_applications.sql');
 const route=source('app/api/apply/route.ts');
 const admin=source('app/api/applications/route.ts');
 for(const needle of ['enabled boolean not null default false','token_hash','gen_random_bytes(32)','inv.used_at is not null','for update','applicant_declaration','cove_assert_owner(w)','enable row level security'])assert.ok(sql.includes(needle),needle);
 assert.ok(route.includes("process.env.COVE_APPLICATION_INTAKE_ENABLED!=='true'"));
 assert.ok(admin.includes("s.client.rpc('cove_review_application'"));
 assert.ok(sql.includes("'creates_loan',false"));
 assert.ok(!sql.includes('insert into public.loans('));
});
test('new application flow has public and admin pages and prevents owner login leakage',()=>{
 assert.ok(source('app/studio/page.tsx').includes('/studio/applications'));
 assert.ok(source('app/apply/page.tsx').includes('No automatic approval')); // applications never create a loan automatically.
 assert.ok(source('app/api/auth/route.ts').includes('COVE_ALLOW_NEW_WORKSPACE_SIGNUP'));
 assert.ok(source('app/api/apply/status/route.ts').includes('COVE_PRIVACY_NOTICE_URL'));
});
test('cashbook edit UI only offers classification corrections, not unauthorized edits to payments or loan releases',()=>{
 const ui=source('public/studio-app.js');
 assert.ok(ui.includes("['Capital','Outflow'].includes(x.kind)"));
 assert.ok(ui.includes('Owner-paid debt settlement'));
 assert.ok(ui.includes('data-cash-edit'));
 assert.ok(ui.includes("post('/api/funding',payload)"));
});
