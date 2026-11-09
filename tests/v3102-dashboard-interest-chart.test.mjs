import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const get=(f)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const js=get('public/studio-app.js'),css=get('app/studio/asset-sources.css');
const source=js.slice(js.indexOf('function monthlyInterestSeries('),js.indexOf('function scheduleRows('));
const fmt=(v)=>'₱'+Number(v||0).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:2});
const monthLabel=month=>new Date(month+'-02T12:00:00Z').toLocaleString('en-US',{month:'short',timeZone:'UTC'});
const esc=x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;');
const icon=x=>`<svg data-icon="${x}"></svg>`;
const short=x=>x||'—';
const basic={summary:{monthly_interest_run_rate:5060,active_loans:8,scheduled_final_collection_date:'2026-12-30'}};
const april={month:'2026-04',interest_collected:2800},may={month:'2026-05',interest_collected:3800};
function evaluate(expression,{asOf='2026-07-20',assetBridge=[april,may],loans=[],mode='received'}={}){
 const ctx={UI:{data:{asset_bridge:assetBridge,loans,summary:basic.summary,contractual_interest_loans:[]},asof:asOf,interestChartMode:mode},fmt,esc,icon,short,monthLabel,Date,Math,Number,String,Array,Map};
 return vm.runInNewContext(`${source}\n${expression}`,ctx);
}
test('monthly received chart shows actual seven-month interest, not loan principal or all collections',()=>{
 const rows=evaluate('monthlyInterestSeries(UI.asof,UI.data.asset_bridge,UI.data.loans)');
 assert.equal(rows.length,7);assert.equal(rows[0].month,'2026-01');assert.equal(rows[6].month,'2026-07');
 assert.equal(rows.find(x=>x.month==='2026-04').value,2800);
 assert.equal(rows.find(x=>x.month==='2026-05').value,3800);
 assert.equal(rows.find(x=>x.month==='2026-06').value,0);
 const html=evaluate('monthlyInterestChart()');
 assert.match(html,/Interest received by month/);assert.match(html,/aria-pressed="true"/);assert.match(html,/Interest received/);
 assert.match(html,/class="v3102-interest-bar/);
});
test('scheduled chart uses loan contract interest split across installment due dates, rather than cash earnings',()=>{
 const loans=[{interest:3000,voided_on:null,schedule:[{due_date:'2026-04-10'},{due_date:'2026-05-10'},{due_date:'2026-06-10'}]}];
 const rows=evaluate("monthlyInterestSeries(UI.asof,UI.data.asset_bridge,UI.data.loans,'scheduled')",{loans});
 assert.deepEqual(JSON.parse(JSON.stringify(rows.filter(x=>x.value>0).map(x=>[x.month,x.value]))),[['2026-04',1000],['2026-05',1000],['2026-06',1000]]);
 const html=evaluate('monthlyInterestChart()',{loans,mode:'scheduled'});
 assert.match(html,/Contract interest by due month/);assert.match(html,/data-interest-view="scheduled" aria-pressed="true"/);
});
test('as-of cutoff excludes future receipt months and upcoming scheduled installment dates',()=>{
 const loans=[{interest:2000,schedule:[{due_date:'2026-07-01'},{due_date:'2026-07-30'}]}];
 const rows=evaluate("monthlyInterestSeries(UI.asof,UI.data.asset_bridge,UI.data.loans,'scheduled')",{asOf:'2026-07-15',loans});
 assert.equal(rows.at(-1).value,1000);
 assert.equal(evaluate('monthlyInterestSeries(UI.asof,UI.data.asset_bridge,UI.data.loans).at(-1).value',{asOf:'2026-07-15',assetBridge:[{month:'2026-08',interest_collected:9999}]}),0);
});
test('void date removes later scheduled interest but preserves earlier due periods',()=>{
 const loans=[{interest:300,voided_on:'2026-06-01',schedule:[{due_date:'2026-05-20'},{due_date:'2026-06-20'},{due_date:'2026-07-20'}]}];
 const rows=evaluate("monthlyInterestSeries(UI.asof,UI.data.asset_bridge,UI.data.loans,'scheduled')",{loans});
 assert.equal(rows.find(x=>x.month==='2026-05').value,100);
 assert.equal(rows.find(x=>x.month==='2026-06').value,0);
});
test('negative net interest receipts render a signed negative bar instead of hiding it',()=>{
 const html=evaluate('monthlyInterestChart()',{assetBridge:[{month:'2026-04',interest_collected:100},{month:'2026-05',interest_collected:-200}]});
 assert.match(html,/is-negative/);assert.match(html,/−?₱-?200/);
});
test('dashboard preserves loan drilldown and maturity, responsive card and bars are real SVGs',()=>{
 const html=evaluate('capitalSnapshot()');
 assert.match(html,/MONTHLY CONTRACTUAL INTEREST/);assert.match(html,/View interest breakdown/);
 assert.match(html,/FINAL SCHEDULED DUE DATE/);assert.match(html,/Collection planner/);
 assert.match(html,/v3102-interest-svg/);
 assert.match(css,/\.v3102-interest-main/);assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/svg\.v3102-interest-svg\{display:block;width:100%/);
 assert.match(js,/data-interest-view/);
 assert.ok(!/\.rpc\(|\.insert\(|\.update\(/.test(source));
});
