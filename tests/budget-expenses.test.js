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

function createOverviewContext() {
  const context = createActualSpendContext();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value:'', textContent:'', innerHTML:'', style:{}, options:[],
      classList:{ add() {}, remove() {} },
      appendChild(child) { this.options.push(child); },
    });
    return elements.get(id);
  };
  [
    'ov-from-sel','ov-to-sel','ov-custom-range','ov-period-label','ov-period-label-a','ov-bva-period-label',
    'ov-donut-title','ov-proj-chips','ov-type-chips','ov-type-count','ov-type-col','bgt-kpi-total',
    'bgt-kpi-actual-sub','bgt-kpi-budget','bgt-kpi-budget-sub','bgt-kpi-remaining',
    'bgt-kpi-remaining-sub','bgt-kpi-forecast','bgt-kpi-forecast-sub','ov-main-chart',
    'ov-donut-chart','ov-donut-legend','ov-bva-rows','ov-bva-proj-chips','ov-bva-formula',
    'ov-pbtn-3','ov-pbtn-6','ov-pbtn-12','ov-pbtn-0',
  ].forEach(element);
  context.document.getElementById = id => elements.get(id) || null;
  context.document.createElement = () => ({ value:'', textContent:'', style:{}, addEventListener() {} });
  context.chartConfigs = [];
  context.Chart = function Chart(target, config) {
    context.chartConfigs.push(config);
    this.destroy = () => {};
  };
  context.__elements = elements;
  return context;
}

function monthKey(offset) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function seedOverview(context) {
  context.storeActualSpendRecords([
    context.createActualSpendRecord({ id:'overview-software', source:'Approved Memo', referenceNo:'SW-1', project:'Alpha', spendType:'Software', amount:12000, startDate:monthKey(-11), endDate:monthKey(0) }),
    context.createActualSpendRecord({ id:'overview-hardware', source:'Manual / Historical Expense', referenceNo:'HW-1', project:'Beta', spendType:'Hardware', amount:12000, startDate:monthKey(-5), endDate:monthKey(0) }),
    context.createActualSpendRecord({ id:'overview-infra', source:'Infra Cost', referenceNo:'INFRA-1', project:'Alpha', spendType:'Infra', amount:9000, startDate:monthKey(-2), endDate:monthKey(0) }),
  ]);
  context.renderBudgetOverview();
}

function overviewTotals(context) {
  const parseMoney = value => Number(String(value).replace(/[^\d.-]/g, ''));
  const bar = [...context.chartConfigs].reverse().find(config => config.type === 'bar');
  const donut = [...context.chartConfigs].reverse().find(config => config.type === 'doughnut');
  const chart = bar.data.datasets.reduce((sum, dataset) => sum + dataset.data.reduce((a, b) => a + b, 0), 0);
  const donutTotal = donut.data.datasets[0].data.reduce((sum, value) => sum + value, 0);
  const comparison = [...context.__elements.get('ov-bva-rows').innerHTML.matchAll(/฿([\d,.]+) \/ — \(ไม่มีงบ\)/g)]
    .reduce((sum, match) => sum + parseMoney(match[1]), 0);
  return { kpi:parseMoney(context.__elements.get('bgt-kpi-total').textContent), chart, donut:donutTotal, comparison };
}

function assertOverviewTotals(context, expected) {
  const totals = overviewTotals(context);
  assert.deepEqual(totals, { kpi:expected, chart:expected, donut:expected, comparison:expected });
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

test('Overview KPI, chart, donut, and project comparison stay equal for 3M, 6M, and 12M filters', () => {
  const context = createOverviewContext();
  seedOverview(context);
  assertOverviewTotals(context, 33000);
  context.ovSetPreset(6);
  assertOverviewTotals(context, 27000);
  context.ovSetPreset(3);
  assertOverviewTotals(context, 18000);
});

test('Overview totals stay equal after project and Spend Type filters', () => {
  const projectContext = createOverviewContext();
  seedOverview(projectContext);
  projectContext.ovToggleProj('Beta');
  assertOverviewTotals(projectContext, 21000);

  const typeContext = createOverviewContext();
  seedOverview(typeContext);
  typeContext.ovToggleType('infra');
  assertOverviewTotals(typeContext, 24000);
});

test('Overview totals stay equal for a custom period', () => {
  const context = createOverviewContext();
  seedOverview(context);
  context.__elements.get('ov-from-sel').value = '12';
  context.__elements.get('ov-to-sel').value = '14';
  context.ovApplyCustomRange();
  assertOverviewTotals(context, 3000);
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

test('Phase 7 exposes exactly the five specified Budget & Spend tabs and removes the obsolete Others path', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const tabNames = Array.from(html.matchAll(/data-tab="(overview|actual-spend|forecast|bva|bgt-settings|others)"/g), match => match[1]);
  assert.deepEqual(tabNames, ['overview','actual-spend','forecast','bva','bgt-settings']);
  assert.doesNotMatch(html, /bgt-tab-others|renderBudgetOthers/);
  assert.doesNotMatch(budgetCode, /function renderBudgetOthers|_renderOthersChart|_renderOthersTable/);
});

test('Settings exposes Budget Pools only while Actual Spend retains Infra Cost import', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="bset-panel-budget"/);
  assert.doesNotMatch(html, /bset-nav-infra|bset-panel-infra|infra-bulk-input|infra-modal|Add Infra Cost/);
  assert.doesNotMatch(budgetCode, /function (?:openInfraModal|saveInfraCost|handleInfraBulkUpload|deleteInfraEntry)/);
  assert.match(html, /id="as-import-file"/);
  assert.match(html, /<option value="infra">Infra Cost<\/option>/);
  assert.match(budgetCode, /\['Infra Cost','INFRA-2026-001','Infra'/);
});
