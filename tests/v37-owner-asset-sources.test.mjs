import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildState} from '../lib/ledger.ts';
import {assetSourcePosition} from '../lib/financial-statements.ts';
const cents=n=>Math.round(n*100);
test('gross infusion includes borrowed money; net owner capital removes borrowed funding and actual owner draws',()=>{
 const a=assetSourcePosition({as_of:'2026-11-06',summary:{interest_collected:46992.15,portfolio_assets:52550.15},capital:[
  {amount:27000,source_type:'Personal'},{amount:10000,source_type:'Loan'},{amount:15000,source_type:'Borrowed'}],outflows:[
   {amount:36450,classification:'Owner withdrawal'},{amount:10000,classification:'Capital repayment'}]});
 assert.equal(a.gross_capital_infusion,52000);
 assert.equal(a.external_funding,25000);
 assert.equal(a.owner_draws,36450);
 assert.equal(a.net_owner_capital,-9450);
 assert.equal(a.external_liability,15000);
 assert.equal(a.retained_cash_earnings,46992.15);
 assert.equal(a.reconciliation_balance,8);
});
test('real ₱1 split reallocation removes legacy ₱8 residual without inventing cash or debt',()=>{
 const products=[{id:'P',name:'Test Loan',monthly_rate:.1,max_per_loan_cents:cents(2000)}];
 const borrowers=[{id:'C',name:'Sample'}];
 const loans=Array.from({length:8},(_,i)=>({id:`L${i}`,borrower_id:'C',product_id:'P',release_date:'2026-01-01',principal_cents:cents(100),interest_cents:cents(10),payable_cents:cents(110),monthly_rate:.1}));
 const payments=Array.from({length:8},(_,i)=>({id:`R${i}`,loan_id:`L${i}`,paid_on:'2026-02-01',amount_cents:cents(110),principal_cents:cents(101),interest_cents:cents(9)}));
 const data={borrowers,products,loans,payments,installments:[],capital:[{id:'C1',occurred_on:'2026-01-01',amount_cents:cents(800),source_type:'Personal'}],outflows:[],audit_log:[]};
 const before=buildState(data,'2026-02-02');
 assert.equal(before.live_integrity.allocation_issues.length,8);
 assert.equal(before.asset_sources.reconciliation_balance,8);
 assert.equal(before.summary.interest_collected,72);
 const corrected={...data,payments:payments.map(p=>({...p,principal_cents:p.principal_cents-cents(1),interest_cents:p.interest_cents+cents(1)}))};
 const after=buildState(corrected,'2026-02-02');
 assert.equal(after.asset_sources.reconciliation_balance,0);
 assert.equal(after.live_integrity.allocation_issues.length,0);
 assert.equal(after.summary.interest_collected,80);
 assert.equal(after.summary.cash,before.summary.cash);
 assert.equal(after.summary.portfolio_assets,before.summary.portfolio_assets);
 assert.ok(after.payments.every(p=>p.amount===110));
});
test('negative owner capital is drawn as a signed bar, never converted to a positive donut share',()=>{
 const source=readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8');
 const style=readFileSync(new URL('../app/studio/asset-sources.css',import.meta.url),'utf8');
 for(const part of ['gross_capital_infusion','Less borrowed capital','Less owner withdrawals','Net owner capital','Retained lending earnings','Outstanding borrowed capital','v37-diverging-bar'])assert.ok(source.includes(part),part);
 assert.ok(!source.slice(source.indexOf('function assetSourceMix(){'),source.indexOf('function capitalSnapshot(){')).includes('Unclassified balance'));
 assert.ok(!source.slice(source.indexOf('function assetSourceMix(){'),source.indexOf('function capitalSnapshot(){')).includes('reconciliation_balance'));
 assert.ok(style.includes('@media(max-width:700px)'));
});
test('optional legacy repair script has all eight specific receipt pairs, preconditions, atomicity, and audit trail',()=>{
 const apply=readFileSync(new URL('../sql/legacy_8_allocation_apply_REVIEW_FIRST.sql',import.meta.url),'utf8');
 for(const part of ['BEGIN;','COMMIT;','loan_corrections','loan_voids','pg_advisory_xact_lock','CORRECT_LEGACY_RECEIPT_ALLOCATION','principal_cents=principal_cents-100','interest_cents=interest_cents+100','paid_principal-loan_row.principal_cents<>100'])assert.ok(apply.includes(part),part);
 assert.ok(!readFileSync(new URL('../sql/legacy_8_allocation_preview.sql',import.meta.url),'utf8').includes('UPDATE public.payments'));
});
