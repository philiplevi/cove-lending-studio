import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../app/studio/asset-sources.css',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('function assetSourceMix(){'),source.indexOf('function capitalSnapshot(){'));
const fmt=(v)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:2,minimumFractionDigits:0}).format(v).replace('PHP','₱');
const fmtDashboard=(v)=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',maximumFractionDigits:0,minimumFractionDigits:0}).format(v).replace('PHP','₱');
const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const render=(asset_sources)=>vm.runInNewContext(renderer+'\nassetSourceMix()',{UI:{data:{asset_sources}},fmt,fmtDashboard,esc});
const example={gross_capital_infusion:52000,external_funding:10000,owner_draws:36450,net_owner_capital:5550,retained_cash_earnings:46292.15,external_liability:0,portfolio_assets:51850.15,unclassified_funding:0,external_conversions:0};
test('asset source mix doughnut uses actual identified funding, not historical gross infusion',()=>{
 const html=render(example);
 assert.match(html,/class="v310-donut"/);
 assert.match(html,/Identified funding/);
 assert.ok(html.includes(fmtDashboard(51842.15)));
 assert.ok(html.includes(fmtDashboard(51850.15)));
 assert.match(html,/89\.3%/);
 assert.match(html,/10\.7%/);
});
test('negative owner capital uses signed chart, not doughnut',()=>{
 const html=render({...example,net_owner_capital:-9450,external_funding:25000,external_liability:15000,retained_cash_earnings:46992.15});
 assert.doesNotMatch(html,/class="v310-donut"/);
 assert.match(html,/v37-diverging-bar/);
});
test('capital formula and zero funding remain clear and no ledger changes',()=>{
 const html=render(example);
 for(const label of ['Capital infusion','Less borrowed capital','Less owner withdrawals','Net owner capital'])assert.ok(html.includes(label));
 const zero=render(Object.fromEntries(Object.keys(example).map(k=>[k,0])));
 assert.match(zero,/v310-donut-empty/);
 assert.doesNotMatch(renderer,/\.insert\(|\.update\(|fetch\(|\.rpc\(/);
 assert.match(css,/\.v310-mix-row/);
});
