const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const budgetCode = fs.readFileSync(path.join(root, 'views/budget.js'), 'utf8');

function createBudgetContext() {
  const storage = new Map();
  const context = {
    console,
    Date,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    document: {
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, addEventListener() {} }),
      body: { appendChild() {} },
    },
    checkSupa: async () => false,
    supaFetch: async () => [],
    currentUser: () => 'PMO User',
    isPMO: () => true,
    loadMemos: () => [],
    loadBudgetPools: () => [],
    loadSettings: () => ({ projects: [] }),
    memoStatusKey: memo => memo.status,
    money: value => String(value),
    esc: value => String(value ?? ''),
    alert: () => {},
    confirm: () => true,
    prompt: () => '',
  };
  vm.createContext(context);
  vm.runInContext(budgetCode, context, { filename: 'views/budget.js' });
  return context;
}

function createActualSpendContext() {
  const context = createBudgetContext();
  vm.runInContext(appCode, context, { filename: 'app.js' });
  return context;
}

test('one-time manual expense contributes once in its expense month', () => {
  const context = createBudgetContext();
  const occurrences = context.manualExpenseOccurrences({
    frequency: 'one_time',
    expenseDate: '2025-11-15',
    amount: 12500,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(occurrences)), [{ month: '2025-11', amount: 12500 }]);
});

test('monthly manual expense is distributed inclusively without duplicating memo data', () => {
  const context = createBudgetContext();
  const expense = {
    frequency: 'monthly',
    startMonth: '2025-11',
    endMonth: '2026-01',
    amount: 1000,
  };
  assert.equal(context.manualExpenseAmountInRange(expense, '2025-12', '2026-01'), 2000);
  assert.equal(context.manualExpenseMonthValue(expense, '2025-11'), 1000);
});

test('voided manual expenses are excluded from calculations', () => {
  const context = createBudgetContext();
  const occurrences = context.manualExpenseOccurrences({
    frequency: 'one_time',
    expenseDate: '2025-11-15',
    amount: 12500,
    voidedAt: '2026-06-29T00:00:00Z',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(occurrences)), []);
});

test('Phase 3 canonical Actual Spend combines memo, historical, and infra exactly once', () => {
  const context = createActualSpendContext();
  const rows = context.reconcileActualSpendSources(
    [{ memoNo:'MEMO-1', status:'completed', project:'AOA-MP', type:'sl', total:3000, createdAt:'2026-01-01' }],
    [{ id:'HIST-1', referenceNo:'OLD-1', project:'AOA-MP', expenseType:'hw', frequency:'monthly', startMonth:'2026-01', endMonth:'2026-03', amount:1000 }],
    [{ id:'INFRA-1', project:'AOA-MP', program:'Cloud', monthly_cost:500, start_month:'2026-01', end_month:'2026-02' }],
    [],
  );
  assert.equal(rows.length, 3);
  assert.equal(context.calculateActualSpend(rows), 7000);
  assert.deepEqual(Array.from(new Set(rows.map(row => row.source))).sort(), [
    'Approved Memo', 'Infra Cost', 'Manual / Historical Expense',
  ].sort());
});

test('Phase 3 historical and infra projections use inclusive coverage and shared validation', () => {
  const context = createActualSpendContext();
  const historical = context.manualExpenseToActualSpend({
    id:'HIST-1', project:'TTB', expenseType:'dep', frequency:'monthly',
    startMonth:'2026-01', endMonth:'2026-03', amount:200, description:'Rollout',
  });
  const infra = context.infraCostToActualSpend({
    id:'INFRA-1', project:'TTB', program:'Cloud', monthly_cost:400,
    start_month:'2026-01', end_month:'2026-02',
  });
  assert.equal(historical.amount, 600);
  assert.equal(infra.amount, 800);
  assert.equal(context.validateActualSpendRecord(historical).valid, true);
  assert.equal(context.validateActualSpendRecord(infra).valid, true);
});

test('Phase 3 reconciliation skips invalid legacy source rows without hiding valid spend', () => {
  const context = createActualSpendContext();
  const rows = context.reconcileActualSpendSources(
    [
      { memoNo:'VALID', status:'completed', project:'AOA-MP', type:'sl', total:1000, createdAt:'2026-01-01' },
      { memoNo:'ZERO', status:'completed', project:'AOA-MP', type:'sl', total:0, createdAt:'2026-01-01' },
    ], [], [], [],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].referenceNo, 'VALID');
});

test('Actual Spend year filter includes records whose coverage overlaps the selected year', () => {
  const context = createActualSpendContext();
  assert.equal(context.actualSpendRecordInYear({ startDate:'2025-11', endDate:'2026-02' }, '2026'), true);
  assert.equal(context.actualSpendRecordInYear({ startDate:'2025-01', endDate:'2025-12' }, '2026'), false);
  assert.equal(context.actualSpendRecordInYear({ createdAt:'2024-06-01T00:00:00Z' }, '2024'), true);
});

test('Actual Spend detail uses a responsive layout without a horizontal scroll table', () => {
  assert.match(budgetCode, /actual-spend-group-panel[\s\S]*overflow-x:hidden/);
  assert.match(budgetCode, /grid-template-columns:repeat\(auto-fit,minmax\(130px,1fr\)\)/);
});

test('Actual Spend provides an Excel import template matching accepted columns and duplicate rules', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /downloadActualSpendTemplate\(\)/);
  assert.match(budgetCode, /Source','Reference No','Spend Type','Project','Amount','Start Date','End Date','Vendor \/ Program','Description/);
  assert.match(budgetCode, /actual_spend_import_template\.xlsx/);
  assert.match(budgetCode, /Source \+ Reference No \+ Project \+ Spend Type \+ Amount \+ Start Date \+ End Date/);
});

test('Overview KPI, charts, and filters consume canonical Actual Spend calculations', () => {
  assert.match(budgetCode, /function renderBudgetOverview\(\) \{\s*reconcileActualSpendSources\(\)/);
  assert.match(budgetCode, /const total = calculateActualSpendInRange\(records, fromKey, toKey\)/);
  assert.match(budgetCode, /data: months\.map\(m => calculateActualSpendInRange\(records, m\.key, m\.key/);
  assert.match(budgetCode, /typeKeys\.includes\(SPEND_TYPE_TO_MEMO_TYPE\[record\.spendType\]\)/);
});

test('historical expense migration is additive, RLS-enabled, and forbids delete access', () => {
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260629161656_historical_budget_expenses.sql'),
    'utf8'
  );
  assert.match(migration, /create table if not exists public\.budget_manual_expenses/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant select, insert, update/);
  assert.doesNotMatch(migration, /grant[^;]*delete/i);
  assert.doesNotMatch(migration, /drop\s+table/i);
});

test('PMO controls use cancellation, view-only settings, and deactivation instead of deletion', () => {
  const pending = fs.readFileSync(path.join(root, 'views/pending.js'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'views/settings.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(pending, /isPending && \(isOwn \|\| _isPMO\)/);
  assert.match(pending, /\(!isRequester && !isPmoUser\)/);
  assert.match(settings, /async function deactivateUser/);
  assert.doesNotMatch(settings, /supaFetch\('user_profiles','DELETE'/);
  assert.match(settings, /View Only/);
  assert.match(html, /id="as-source"/);
});
