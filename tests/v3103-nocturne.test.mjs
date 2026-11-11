import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const css=read('app/studio/nocturne.css');
const js=read('public/studio-app.js');
const shell=read('app/studio/page.tsx');
const sources=read('app/studio/asset-sources.css');

test('nocturne is the final visual layer; actual routes and sidebar scroll survive',()=>{
 assert.ok(shell.includes("import './nocturne.css';"));
 assert.ok(shell.indexOf("import './nocturne.css';")>shell.indexOf("import './asset-sources.css';"));
 assert.match(css,/\.sidebar\{[^}]*overflow-y:auto/);
 for(const page of ['dashboard','loans','borrowers','collections','schedule','transactions','reports','controls'])assert.ok(shell.includes(`data-page="${page}"`));
 for(const url of ['/studio/statements','/studio/command','/studio/applications'])assert.ok(shell.includes(`href="${url}"`));
});
test('dark styling matches the approved teal-lime direction without hiding critical controls',()=>{
 for(const x of ['--cove-night','--cove-lime','--cove-teal','.v31-hero','.v31-metric-grid','.v310-asset-mix','.v3102-interest-panel','.v31-analytical-grid','.data-table'])assert.ok(css.includes(x),x);
 assert.ok(css.includes('@media(max-width:650px)'));
 assert.ok(css.includes(':focus-visible'));
 assert.ok(shell.includes('id="quick-refresh"'),'refresh is functional');
 assert.ok(!shell.includes('title="Notifications"'),'inert notification UI should not appear');
});
test('real funding and interest remain derived from the ledger, not the reference mockup',()=>{
 assert.match(js,/function assetSourceMix\(/);
 assert.match(js,/const m=UI\.data\.asset_sources/);
 assert.match(js,/const hasNegative=rows\.some/);
 assert.match(js,/function monthlyInterestSeries\(/);
 assert.match(js,/function contractualInterestBreakdown\(/);
 assert.match(js,/function assetBridgeChart\(/);
 assert.match(js,/UI\.data\.summary/);
 assert.ok(!js.includes('vs. prior period'),'no invented growth claims');
 assert.match(sources,/v310-donut/);
});
test('one title is used for exact-duplicate table headings; table headers remain',()=>{
 assert.match(js,/function removeDuplicateTableTitles\(root\)/);
 assert.match(js,/\.table-card > \.table-section-header h3/);
 assert.match(js,/if\(normalize\(heading\.textContent\)!==title\)return/);
 assert.match(js,/main\.dataset\)main\.dataset\.coveView=UI\.page/);
 assert.match(js,/<th>Loan \/ Borrower<\/th>/);
});
