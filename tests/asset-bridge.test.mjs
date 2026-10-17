import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildState} from '../lib/ledger.ts';
const C=v=>Math.round(v*100);
function base(){return {borrowers:[{id:'B',name:'Example'}],products:[{id:'P',name:'Regular',monthly_rate:.10}],
 loans:[{id:'L',borrower_id:'B',product_id:'P',release_date:'2026-01-01',principal_cents:C(1000),interest_cents:C(100),payable_cents:C(1100),monthly_rate:.1}],
 installments:[],payments:[],capital:[{id:'C',occurred_on:'2026-01-01',amount_cents:C(2000)}],outflows:[],audit_log:[],baseline:null};}
test('asset bridge preserves opening + infusion + interest - outflow = actual assets',()=>{
 const input=base();input.payments.push({id:'R',loan_id:'L',paid_on:'2026-02-10',amount_cents:C(550),principal_cents:C(500),interest_cents:C(50)});
 input.outflows.push({id:'D',occurred_on:'2026-03-02',amount_cents:C(100)});
 const s=buildState(input,'2026-03-31');
 assert.deepEqual(s.asset_bridge.map(x=>x.month),['2026-01','2026-02','2026-03']);
 assert.equal(s.asset_bridge[0].closing_assets,2000);
 assert.equal(s.asset_bridge[1].opening_assets,2000);
 assert.equal(s.asset_bridge[1].interest_collected,50);
 assert.equal(s.asset_bridge[2].outflows,100);
 assert.equal(s.asset_bridge.at(-1).closing_assets,1950);
 assert.equal(s.asset_bridge.at(-1).closing_assets,s.summary.portfolio_assets);
 assert.ok(s.asset_bridge.every(x=>Math.abs(x.opening_assets+x.capital_infusion+x.interest_collected-x.outflows+x.allocation_adjustment-x.closing_assets)<.001));
});
test('bridge separately explains historical principal-overallocation adjustments',()=>{
 const input=base();input.payments.push({id:'R',loan_id:'L',paid_on:'2026-02-10',amount_cents:C(1101),principal_cents:C(1001),interest_cents:C(100)});
 const state=buildState(input,'2026-02-28');
 assert.equal(state.summary.principal_outstanding,0);
 assert.equal(state.asset_bridge[1].allocation_adjustment,1);
 assert.equal(state.asset_bridge[1].closing_assets,state.summary.portfolio_assets);
});
test('as-of dates avoid future transactions, and negative receipt reversals restore prior assets',()=>{
 const input=base();input.payments.push({id:'R',loan_id:'L',paid_on:'2026-02-10',amount_cents:C(550),principal_cents:C(500),interest_cents:C(50)});
 input.payments.push({id:'RR',loan_id:'L',paid_on:'2026-03-01',amount_cents:C(-550),principal_cents:C(-500),interest_cents:C(-50)});
 assert.equal(buildState(input,'2026-02-28').asset_bridge.at(-1).closing_assets,2050);
 const after=buildState(input,'2026-03-02');assert.equal(after.asset_bridge.at(-1).closing_assets,2000);
 assert.equal(after.asset_bridge.at(-1).interest_collected,-50);
});
test('asset-movement chart is visible alongside original collections chart with separate controls and export',()=>{
 const js=readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8');
 assert.match(js,/function assetBridgeChart\(/);assert.match(js,/\$\{assetBridgeChart\(\)\}/);
 assert.match(js,/function chartSVG\(/);assert.match(js,/data-asset-range/);
 assert.match(js,/download-asset-csv/);assert.match(js,/allocation_adjustment/);
});
test('loan void offsets release without inventing asset growth',()=>{
 const input=base();input.loan_voids=[{loan_id:'L',voided_on:'2026-02-15',principal_cents:C(1000)}];
 const before=buildState(input,'2026-01-31');
 const after=buildState(input,'2026-02-16');
 assert.equal(before.asset_bridge.at(-1).closing_assets,2000);
 assert.equal(after.asset_bridge.at(-1).closing_assets,2000);
 assert.equal(after.asset_bridge.at(-1).allocation_adjustment,0);
});
