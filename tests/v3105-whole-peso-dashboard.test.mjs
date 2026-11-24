import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('../public/studio-app.js',import.meta.url),'utf8');
const getBody=(name)=>{
 const start=ui.indexOf('function '+name+'(');
 const end=ui.indexOf('\nfunction ',start+1);
 assert.ok(start>=0 && end>start,'function '+name+' missing');
 return ui.slice(start,end);
};
const fmtDashboard=vm.runInNewContext(ui.slice(ui.indexOf('const PHP_DASHBOARD='),ui.indexOf('const nfmt='))+'\nfmtDashboard',{Intl,Number});
test('dashboard rounds values to whole Philippine pesos, without changing actual amounts',()=>{
 assert.equal(fmtDashboard(67350.15),'₱67,350');
 assert.equal(fmtDashboard(65466.15),'₱65,466');
 assert.equal(fmtDashboard(2345.6),'₱2,346');
 assert.equal(fmtDashboard(-0.6),'-₱1');
});
test('main dashboard cards, source mix and interest callouts use rounded display',()=>{
 for(const key of ['dashboard','assetSourceMix','capitalSnapshot','monthlyInterestChart','portfolioRisk','collectionPriorities','activityList','contractualInterestBreakdown']){
  const fn=getBody(key);
  assert.match(fn,/fmtDashboard\(/,key);
  assert.doesNotMatch(fn,/(?<![A-Za-z_$])fmt\(/,key+' must not show cents');
 }
});
test('asset source mix displays whole peso funding but retains accurate percentage',()=>{
 const source=getBody('assetSourceMix');
 const asset_sources={gross_capital_infusion:67000,external_funding:15000,owner_draws:36950,external_conversions:0,unclassified_funding:0,net_owner_capital:15050,retained_cash_earnings:47300.15,external_liability:5000,portfolio_assets:67350.15};
 const html=vm.runInNewContext(source+'\nassetSourceMix()',{UI:{data:{asset_sources}},fmtDashboard,Number,Math,esc:String});
 for(const amount of ['₱67,350','₱47,300','₱15,050','₱5,000'])assert.ok(html.includes(amount),amount);
 assert.doesNotMatch(html,/₱[\d,]+\.\d{1,2}/);
 assert.match(html,/22\.3%/);
});
test('cashbook, loans, collections, reports and detailed export retain cents',()=>{
 for(const key of ['loansPage','collectionsPage','transactionsPage','reportsPage','showLoan']){
  const fn=getBody(key);
  assert.match(fn,/(?<![A-Za-z_$])fmt\(/,key+' must retain full precision');
  assert.doesNotMatch(fn,/fmtDashboard\(/);
 }
 assert.match(getBody('assetBridgeChart'),/const fullTable=rows\.map\(r=>.*fmt\(r\.opening_assets\)/);
});
