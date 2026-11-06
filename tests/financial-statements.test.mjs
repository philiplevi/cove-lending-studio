import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildState} from '../lib/ledger.ts';
import {assetSourcePosition,buildFinancialStatements} from '../lib/financial-statements.ts';
const c=n=>Math.round(n*100);
function fixture(){return {borrowers:[{id:'C1',name:'Example'}],products:[{id:'P1',name:'Loan',monthly_rate:.1,max_per_loan_cents:c(10000)}],
 loans:[{id:'L1',borrower_id:'C1',product_id:'P1',release_date:'2026-10-02',principal_cents:c(500),interest_cents:c(100),payable_cents:c(600),monthly_rate:.1}],installments:[],
 payments:[{id:'R1',loan_id:'L1',paid_on:'2026-10-10',amount_cents:c(150),principal_cents:c(50),interest_cents:c(100)}],
 capital:[{id:'I1',occurred_on:'2026-10-01',amount_cents:c(1000),source_type:'Personal'}],
 outflows:[{id:'O1',occurred_on:'2026-10-12',amount_cents:c(100),classification:'Operating expense'},
 {id:'O2',occurred_on:'2026-10-20',amount_cents:c(200),classification:'Owner withdrawal'}], audit_log:[]};}
test('owner contribution and lending surplus are distinct and reconcile',()=>{
 const s=buildState(fixture(),'2026-10-21');const mix=s.asset_sources;
 assert.equal(s.summary.cash,350);assert.equal(s.summary.principal_outstanding,450);assert.equal(s.summary.portfolio_assets,800);
 assert.equal(mix.net_owner_capital,800);assert.equal(mix.retained_cash_earnings,0);assert.equal(mix.reconciliation_balance,0);
 assert.equal(mix.breakdown_valid,true);
});
test('negative net contributed capital is retained as signed, not relabeled as income',()=>{
 const snap={as_of:'2026-10-16',summary:{interest_collected:45592,portfolio_assets:35850},
 capital:[{amount:27000,source_type:'Personal'},{amount:10000,source_type:'Loan'}],
 outflows:[{amount:36450,classification:'Owner withdrawal'},{amount:10000,classification:'Capital repayment'},
 {amount:300,classification:'Financing cost'}]};
 const mix=assetSourcePosition(snap);
 assert.equal(mix.net_owner_capital,-9450);
 assert.equal(mix.external_liability,0);
 assert.equal(mix.retained_cash_earnings,45292);
 assert.equal(mix.reconciliation_balance,8);
 assert.equal(mix.breakdown_valid,false);
 assert.ok(mix.flags.some(f=>f.includes('negative')));
});
test('period statement separates principal flows from earned interest and classifications',()=>{
 const x=fixture(),opening=buildState(x,'2026-10-01'),closing=buildState(x,'2026-10-21');
 const rep=buildFinancialStatements(opening,closing);
 assert.equal(rep.metrics.interest,100);
 assert.equal(rep.metrics.operating_expenses,100);
 assert.equal(rep.metrics.net_cash_surplus,0);
 assert.equal(rep.metrics.cash_flow_difference,0);
 assert.equal(rep.cash_flow.find(r=>r.label==='Borrower collections (principal + interest)').amount,150);
 assert.equal(rep.cash_flow.find(r=>r.label==='Loan releases, net of cancellations').amount,-500);
 assert.equal(rep.cash_flow.find(r=>r.label==='Owner withdrawals / distributions').amount,-200);
 assert.equal(rep.financial_position.at(-1).amount,800);
});
test('reversals and cancellation prevent phantom income and receivables',()=>{
 const x=fixture();x.payments.push({id:'R2',loan_id:'L1',paid_on:'2026-10-22',amount_cents:c(-150),principal_cents:c(-50),interest_cents:c(-100),reverses_id:'R1'});
 x.loan_voids=[{loan_id:'L1',principal_cents:c(500),voided_on:'2026-10-23',reason:'Test cancellation'}];
 const start=buildState(x,'2026-10-21'),end=buildState(x,'2026-10-23');const rep=buildFinancialStatements(start,end);
 assert.equal(rep.metrics.interest,-100);assert.equal(rep.metrics.cash_flow_difference,0);
 assert.equal(end.summary.principal_outstanding,0);assert.equal(end.summary.interest_collected,0);
});
test('navigation and dashboard keep one capital source mix, while statements are standalone',()=>{
 const ui=readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8');
 const studio=readFileSync(new URL('../app/studio/page.tsx',import.meta.url),'utf8');
 const statements=readFileSync(new URL('../app/studio/statements/page.tsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../app/studio/asset-sources.css',import.meta.url),'utf8');
 assert.match(studio,/href="\/studio\/statements"/);
 assert.match(ui,/function assetSourceMix\(\)/);assert.match(ui,/\$\{assetSourceMix\(\)\}/);
 assert.ok(!ui.includes('Capital & Earnings Position'));
 assert.match(ui,/\$\{assetBridgeChart\(\)\}/);
 for(const label of ['Income Statement','Cash Flow Statement','Statement of Financial Position','Custom range','Print / Save PDF','Export CSV'])assert.ok(statements.includes(label),`Missing ${label}`);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(statements,/\/api\/state\?as_of=/);
});
