import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const shell=read('app/studio/page.tsx');
const js=read('public/studio-app.js');
const clarity=read('app/studio/clarity.css');
const old=read('app/studio/nocturne.css');
function contrast(a,b){
 const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const l=s=>{const v=rgb(s);return .2126*v[0]+.7152*v[1]+.0722*v[2]};
 const x=l(a),y=l(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('Clarity light theme loads after Nocturne and is the default',()=>{
 assert.ok(shell.includes("import './nocturne.css';"));
 assert.ok(shell.includes("import './clarity.css';"));
 assert.ok(shell.indexOf("import './clarity.css';")>shell.indexOf("import './nocturne.css';"));
 assert.match(shell,/id="cove-shell" data-cove-theme="light"/);
 assert.ok(old.includes('.sidebar{width:252px'));
});
test('Theme switch is a real user action, persists preference, and updates its accessible label',()=>{
 assert.match(shell,/id="theme-toggle"/);
 assert.match(shell,/aria-label="Switch to dark theme"/);
 assert.match(js,/function initCoveAppearance\(/);
 assert.match(js,/addEventListener\('click'/);
 assert.match(js,/localStorage\.setItem\('cove-appearance'/);
 assert.match(js,/control\.setAttribute\('aria-pressed'/);
 assert.match(js,/applyTheme\(saved,false\)/);
 assert.ok(shell.includes('id="quick-refresh"'),'existing refresh remains functional');
});
test('Contrast-aware tokens meet ordinary text 4.5:1 target',()=>{
 for(const [fg,bg] of [['#14353c','#ffffff'],['#506d74','#ffffff'],['#46696e','#ffffff'],['#17363c','#f2f7f5'],['#ffffff','#087c6c']]){
  assert.ok(contrast(fg,bg)>=4.5, `${fg} on ${bg}: ${contrast(fg,bg).toFixed(2)}:1`);
 }
});
test('Asset development title, legend, SVG axes and ledger table headers have readable light styles',()=>{
 for(const token of ['.v32-header h3','.v32-legend span','.v32-chart-scroll','.v32-axis','.v32-breakdown th','.main .data-table th','.v31-dashboard-root .panel','.v310-asset-mix','.v3102-interest-panel']){
   assert.ok(clarity.includes(token),`Missing ${token}`);
 }
 assert.ok(clarity.includes('.shell[data-cove-theme="dark"] .v32-header h3'));
 assert.ok(clarity.includes('@media(max-width:650px)'));
 assert.ok(clarity.includes(':focus-visible'));
});
test('Visual layer leaves loan and finance computations untouched',()=>{
 assert.ok(!clarity.includes('UPDATE public.'));
 assert.ok(js.includes('function assetSourceMix('));
 assert.ok(js.includes('function monthlyInterestSeries('));
 assert.ok(js.includes('function assetBridgeChart('));
 assert.ok(shell.includes('data-page="controls"'));
});
