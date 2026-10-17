import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ui = read('public/studio-app.js');
const shell = read('app/studio/page.tsx');
const premium = read('app/studio/premium.css');

test('V2.2 navigation keeps every operational and reporting screen discoverable', () => {
  for (const page of ['dashboard', 'loans', 'borrowers', 'collections', 'transactions', 'reports', 'controls']) {
    assert.ok(shell.includes(`data-page="${page}"`), `Missing navigation: ${page}`);
    assert.ok(ui.includes(`${page === 'transactions' ? 'transactions:transactionsPage' : page === 'loans' ? 'loans:loansPage' : page === 'borrowers' ? 'borrowers:borrowersPage' : page === 'reports' ? 'reports:reportsPage' : page === 'controls' ? 'controls:controlsPage' : page === 'collections' ? 'collections:collectionsPage' : 'dashboard'}`));
  }
});

test('Collections register uses the existing loan/payment ledger rather than a parallel balance', () => {
  assert.match(ui, /function collectionsPage\(/);
  assert.match(ui, /UI\.data\.payments\.filter/);
  assert.match(ui, /data-modal="payment"/);
  assert.match(ui, /data-loan-id/);
});

test('Dashboard retains cash-basis labels, as-of filtering, and empty-baseline guidance', () => {
  for (const label of ['Collections · this month','Past due','Due next 7 days','Interest received','Total receivables']) assert.ok(ui.includes(label));
  assert.ok(ui.includes('Historical variance & definitions'));
  assert.ok(ui.includes('UI.asof'));
  assert.ok(ui.includes('sourceInterest'));
});

test('Premium styling includes responsive layout and keyboard focus', () => {
  assert.match(premium, /@media\(max-width:680px\)/);
  assert.match(premium, /@media\(max-width:900px\)/);
  assert.match(premium, /:focus-visible/);
  assert.match(premium, /executive-banner/);
});

test('Private workspace API and database migration are retained', () => {
  assert.ok(read('app/api/[...path]/route.ts').includes('export'));
  assert.ok(read('lib/ledger.ts').includes('principal_outstanding'));
  assert.ok(read('supabase/migrations/202610090001_cove.sql').includes('create'));
});
