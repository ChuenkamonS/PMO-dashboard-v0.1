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

test('Actual Spend separates the unchanged report from manual maintenance actions', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const reportPanel = html.match(/<div id="as-panel-report">([\s\S]*?)<div id="as-panel-manual"/)[1];
  const manualPanel = html.match(/<div id="as-panel-manual"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<!-- ── TAB: FORECAST/)[0];

  assert.match(html, /id="as-tab-report"[\s\S]*>Report<\/button>/);
  assert.match(html, /id="as-tab-manual"[\s\S]*>Manual Entries<\/button>/);
  assert.match(reportPanel, /id="as-year"/);
  assert.match(reportPanel, /id="as-content"/);
  assert.match(reportPanel, /exportActualSpendCSV\(\)/);
  assert.doesNotMatch(reportPanel, /openManualExpenseModal|handleActualSpendImport|downloadActualSpendTemplate/);
  assert.match(manualPanel, /openManualExpenseModal\(\)[\s\S]*Add Actual Spend/);
  assert.match(manualPanel, /handleActualSpendImport\(event\)[\s\S]*Download Template/);
  assert.match(manualPanel, /Import Excel/);
  assert.doesNotMatch(manualPanel, /exportActualSpendCSV\(\)/);
});

test('Actual Spend sub-tab switch defaults to Report and toggles panel visibility', () => {
  assert.match(budgetCode, /let _actualSpendCurrentTab = 'report'/);
  assert.match(budgetCode, /reportPanel\.style\.display = _actualSpendCurrentTab === 'report' \? '' : 'none'/);
  assert.match(budgetCode, /manualPanel\.style\.display = _actualSpendCurrentTab === 'manual' \? '' : 'none'/);
});

test('Actual Spend provides an Excel import template matching accepted columns and duplicate rules', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /downloadActualSpendTemplate\(\)/);
  assert.match(budgetCode, /const headers = \['Source','Reference No','Spend Type','Project','Amount','Start Date','End Date','Vendor \/ Program','Description'\]/);
  assert.match(budgetCode, /actual_spend_import_template\.xlsx/);
  assert.match(budgetCode, /Total amount for the coverage period/);
  assert.match(budgetCode, /Do not enter a monthly amount/);
  assert.match(budgetCode, /Use YYYY-MM or YYYY-MM-DD\. Start Date and End Date must use the same format\./);
  assert.match(budgetCode, /Source \+ Reference No \+ Project \+ Spend Type \+ Amount \+ Start Date \+ End Date/);
});

test('Actual Spend template rows parse successfully and Others remains a valid shared Spend Type', () => {
  const context = createActualSpendContext();
  const rows = [
    { Source:'Manual / Historical', 'Reference No':'HIST-2025-001', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:75000, 'Start Date':'2025-11-15', 'End Date':'2025-11-15', 'Vendor / Program':'Vendor A', Description:'Historical laptop purchase' },
    { Source:'Infra Cost', 'Reference No':'INFRA-2026-001', 'Spend Type':'Infra', Project:'TTB', Amount:24000, 'Start Date':'2026-06', 'End Date':'2026-08', 'Vendor / Program':'AWS', Description:'Total infrastructure cost for the coverage period' },
    { Source:'Manual / Historical', 'Reference No':'OTHER-2026-001', 'Spend Type':'Others', Project:'TTB', Amount:1000, 'Start Date':'2026-06', 'End Date':'2026-06', Description:'Other valid spend' },
  ].map(context.actualSpendImportRow);
  const result = context.validateActualSpendImport(rows);
  assert.equal(result.valid, true);
  assert.deepEqual(Array.from(result.records, record => record.spendType), ['Hardware', 'Infra', 'Others']);
});

test('Actual Spend import normalizes Excel serial dates and month cells', () => {
  const context = createActualSpendContext();
  const serial = (year, month, day) => (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;
  const rows = [
    { Source:'Manual / Historical', 'Reference No':'SERIAL-DATE', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:100, 'Start Date':serial(2025,11,15), 'End Date':serial(2025,11,15) },
    { Source:'Manual / Historical', 'Reference No':'SERIAL-MONTH', 'Spend Type':'Software', Project:'AOA-MP', Amount:300, 'Start Date':serial(2026,6,1), 'End Date':serial(2026,8,1) },
  ].map(context.actualSpendImportRow);
  assert.deepEqual(Array.from(rows, row => [row.startDate, row.endDate]), [
    ['2025-11-15','2025-11-15'], ['2026-06','2026-08'],
  ]);
  assert.equal(context.validateActualSpendImport(rows).valid, true);
});

test('Actual Spend import accepts Excel Date objects and still rejects invalid date text', () => {
  const context = createActualSpendContext();
  const dateRow = context.actualSpendImportRow({
    Source:'Manual / Historical', 'Reference No':'DATE-OBJECT', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:100,
    'Start Date':new Date(2025,10,15), 'End Date':new Date(2025,10,15),
  });
  assert.equal(dateRow.startDate, '2025-11-15');
  assert.equal(dateRow.endDate, '2025-11-15');
  assert.equal(context.validateActualSpendImport([dateRow]).valid, true);

  const invalid = context.actualSpendImportRow({
    Source:'Manual / Historical', 'Reference No':'BAD-DATE', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:100,
    'Start Date':'not-a-date', 'End Date':'2025-11-15',
  });
  const result = context.validateActualSpendImport([invalid]);
  assert.equal(result.valid, false);
  assert.deepEqual(Array.from(result.errors[0].errors), ['Invalid Start Date', 'Invalid coverage period']);
});

test('Actual Spend import preserves matching date precision validation', () => {
  const context = createActualSpendContext();
  const mixed = context.actualSpendImportRow({
    Source:'Manual / Historical', 'Reference No':'MIXED-PRECISION', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:100,
    'Start Date':'2026-06', 'End Date':'2026-08-01',
  });
  const result = context.validateActualSpendImport([mixed]);
  assert.equal(result.valid, false);
  assert.deepEqual(Array.from(result.errors[0].errors), ['Invalid coverage period']);
});

test('Manual Historical form distinguishes monthly amount from one-time total', () => {
  assert.match(budgetCode, /monthly \? 'Monthly amount' : 'One-time total amount'/);
  assert.match(budgetCode, /Monthly total = monthly amount × inclusive coverage months\./);
  assert.match(budgetCode, /This amount is recorded once as the one-time total\./);
});

test('Actual Spend import rejects invalid Source and Spend Type with row-level field errors', () => {
  const context = createActualSpendContext();
  const invalidSource = context.actualSpendImportRow({
    Source:'Legacy Upload', 'Reference No':'BAD-SOURCE', 'Spend Type':'Software', Project:'AOA-MP', Amount:100,
  });
  const invalidType = context.actualSpendImportRow({
    Source:'Manual / Historical', 'Reference No':'BAD-TYPE', 'Spend Type':'Mystery', Project:'AOA-MP', Amount:100,
  });
  const result = context.validateActualSpendImport([invalidSource, invalidType]);
  assert.equal(result.valid, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.errors)), [
    { row:1, errors:['Invalid Source'] },
    { row:2, errors:['Invalid Spend Type'] },
  ]);
  assert.equal(result.records.length, 0);
});

test('Actual Spend import preserves all valid sources and supported Infra aliases', () => {
  const context = createActualSpendContext();
  const rows = [
    { Source:'Approved Memo', 'Reference No':'MEMO-1', 'Spend Type':'Software', Project:'AOA-MP', Amount:100 },
    { Source:'Manual / Historical', 'Reference No':'HIST-1', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:200 },
    { Source:'Infra Cost', 'Reference No':'INFRA-1', 'Spend Type':'Infrastructure', Project:'AOA-MP', Amount:300 },
  ].map(context.actualSpendImportRow);
  const result = context.validateActualSpendImport(rows);
  assert.equal(result.valid, true);
  assert.deepEqual(Array.from(result.records, record => record.source), [
    'Approved Memo', 'Manual / Historical Expense', 'Infra Cost',
  ]);
  assert.deepEqual(Array.from(result.records, record => record.spendType), ['Software', 'Hardware', 'Infra']);
});

test('Excel import of Manual / Historical rows creates editable manual expense records with correct one-time and monthly totals', async () => {
  const context = createActualSpendContext();
  const rows = [
    { Source:'Manual / Historical', 'Reference No':'IMP-ONE', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:5000, 'Start Date':'2026-02-10', 'End Date':'2026-02-10', Description:'One-time import' },
    { Source:'Manual / Historical', 'Reference No':'IMP-MONTHLY', 'Spend Type':'Software', Project:'AOA-MP', Amount:3000, 'Start Date':'2026-01', 'End Date':'2026-03', Description:'Monthly import' },
  ].map(context.actualSpendImportRow);

  const importResult = context.importActualSpendRecords(rows);
  assert.equal(importResult.valid, true);
  assert.equal(importResult.saved, 2);

  await context.promoteImportedManualExpenses(importResult.records);

  const manualExpenses = context.loadManualExpenses();
  assert.equal(manualExpenses.length, 2);
  const oneTime = manualExpenses.find(e => e.referenceNo === 'IMP-ONE');
  const monthly = manualExpenses.find(e => e.referenceNo === 'IMP-MONTHLY');
  assert.equal(oneTime.frequency, 'one_time');
  assert.equal(oneTime.amount, 5000);
  assert.equal(monthly.frequency, 'monthly');
  assert.equal(monthly.startMonth, '2026-01');
  assert.equal(monthly.endMonth, '2026-03');
  assert.equal(monthly.amount, 1000); // 3000 total ÷ 3 months, not the full total repeated per month

  const canonical = context.reconcileActualSpendSources();
  const imported = canonical.filter(record => ['IMP-ONE', 'IMP-MONTHLY'].includes(record.referenceNo));
  assert.equal(imported.length, 2);
  assert.ok(imported.every(record => record.source === 'Manual / Historical Expense'));
  assert.equal(context.calculateActualSpend(imported), 8000); // 5000 + 3000, no double-counting

  const rawCanonical = context.loadActualSpendRecords();
  const rawImported = rawCanonical.filter(record => ['IMP-ONE', 'IMP-MONTHLY'].includes(record.referenceNo));
  assert.equal(rawImported.length, 2);
  assert.ok(rawImported.every(record => String(record.id).startsWith('actual-spend-manual-')));
});

test('An imported manual expense record can be edited and the change flows into canonical Actual Spend', async () => {
  const context = createActualSpendContext();
  const rows = [
    { Source:'Manual / Historical', 'Reference No':'IMP-EDIT', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:4000, 'Start Date':'2026-05-01', 'End Date':'2026-05-01', Description:'Edit me' },
  ].map(context.actualSpendImportRow);
  const importResult = context.importActualSpendRecords(rows);
  await context.promoteImportedManualExpenses(importResult.records);

  const before = context.reconcileActualSpendSources();
  assert.equal(context.calculateActualSpend(before.filter(record => record.referenceNo === 'IMP-EDIT')), 4000);

  const manualExpense = context.loadManualExpenses().find(e => e.referenceNo === 'IMP-EDIT');
  await context.saveManualExpenseAsync({ ...manualExpense, amount:4500, unitCost:4500 });

  const after = context.reconcileActualSpendSources();
  assert.equal(context.calculateActualSpend(after.filter(record => record.referenceNo === 'IMP-EDIT')), 4500);
});

test('Soft-deleting an imported manual expense excludes it from canonical Actual Spend, Forecast, and Budget vs Actual totals', async () => {
  const context = createActualSpendContext();
  const rows = [
    { Source:'Manual / Historical', 'Reference No':'IMP-VOID', 'Spend Type':'Software', Project:'AOA-MP', Amount:6000, 'Start Date':'2026-01', 'End Date':'2026-06', Description:'Import to void' },
  ].map(context.actualSpendImportRow);
  const importResult = context.importActualSpendRecords(rows);
  await context.promoteImportedManualExpenses(importResult.records);

  const before = context.reconcileActualSpendSources();
  assert.equal(context.calculateActualSpend(before.filter(record => record.referenceNo === 'IMP-VOID')), 6000);

  const manualExpense = context.loadManualExpenses().find(e => e.referenceNo === 'IMP-VOID');
  await context.voidManualExpenseAsync(manualExpense.id, 'no longer valid');

  const after = context.reconcileActualSpendSources();
  assert.equal(after.filter(record => record.referenceNo === 'IMP-VOID').length, 0);

  const forecast = context.calculateForecast(after, new Date(2026, 3, 15));
  assert.equal(forecast.rows.some(row => row.program === 'IMP-VOID' || row.referenceNo === 'IMP-VOID'), false);

  const bva = context.calculateBudgetVsActualDataset([], after, { year:'2569' });
  assert.equal(bva.totals.actual, context.calculateActualSpend(after));
});

test('Manual Entries import routes every Source through editable manual persistence', async () => {
  const context = createActualSpendContext();
  const rows = [
    { Source:'Approved Memo', 'Reference No':'IMP-MEMO', 'Spend Type':'Software', Project:'AOA-MP', Amount:1000 },
    { Source:'Infra Cost', 'Reference No':'IMP-INFRA', 'Spend Type':'Infra', Project:'AOA-MP', Amount:2000, 'Start Date':'2026-01', 'End Date':'2026-02' },
    { Source:'Manual / Historical', 'Reference No':'IMP-MANUAL', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:500, 'Start Date':'2026-03-01', 'End Date':'2026-03-01' },
  ].map(context.manualEntriesImportRow);
  const importResult = context.importActualSpendRecords(rows);
  await context.promoteImportedManualExpenses(importResult.records);

  const manual = context.loadManualExpenses();
  assert.equal(manual.length, 3);
  assert.deepEqual(Array.from(manual, record => record.referenceNo).sort(), ['IMP-INFRA','IMP-MANUAL','IMP-MEMO']);
  const canonical = context.reconcileActualSpendSources();
  assert.equal(canonical.length, 3);
  assert.ok(canonical.every(record => record.source === 'Manual / Historical Expense'));
  assert.equal(canonical.find(record => record.referenceNo === 'IMP-INFRA').spendType, 'Infra');
  assert.equal(context.calculateActualSpend(canonical), 3500);
});

test('Manual Entries imported Infra remains editable and soft-delete removes it from canonical totals', async () => {
  const context = createActualSpendContext();
  const row = context.manualEntriesImportRow({
    Source:'Infra Cost', 'Reference No':'EDITABLE-INFRA', 'Spend Type':'Infra', Project:'TTB', Amount:2400,
    'Start Date':'2026-06', 'End Date':'2026-08', 'Vendor / Program':'AWS', Description:'Imported Infra',
  });
  const importResult = context.importActualSpendRecords([row]);
  await context.promoteImportedManualExpenses(importResult.records);
  const imported = context.loadManualExpenses().find(record => record.referenceNo === 'EDITABLE-INFRA');
  assert.ok(imported);
  assert.equal(imported.expenseType, 'infra');
  assert.equal(context.calculateActualSpend(context.reconcileActualSpendSources()), 2400);

  await context.saveManualExpenseAsync({ ...imported, amount:900, unitCost:900 });
  assert.equal(context.calculateActualSpend(context.reconcileActualSpendSources()), 2700);

  await context.voidManualExpenseAsync(imported.id, 'Deleted from Manual Entries');
  assert.equal(context.activeManualExpenses().length, 0);
  assert.equal(context.calculateActualSpend(context.reconcileActualSpendSources()), 0);
});

test('legacy direct-canonical Infra Cost records remain supported', () => {
  const context = createActualSpendContext();
  const result = context.importActualSpendRecords([context.actualSpendImportRow({
    Source:'Infra Cost', 'Reference No':'LEGACY-INFRA', 'Spend Type':'Infra', Project:'TTB', Amount:1200,
    'Start Date':'2026-01', 'End Date':'2026-02',
  })]);
  assert.equal(result.valid, true);
  const canonical = context.reconcileActualSpendSources();
  const legacy = canonical.find(record => record.referenceNo === 'LEGACY-INFRA');
  assert.ok(legacy);
  assert.equal(legacy.source, 'Infra Cost');
  assert.equal(context.loadManualExpenses().length, 0);
});

test('Actual Spend Report drill-down is read-only and directs manual edits to Manual Entries', () => {
  const drilldown = budgetCode.match(/function showActualSpendGroup[\s\S]*?function showActualSpendRecord/)[0];
  const detail = budgetCode.match(/function showActualSpendRecord[\s\S]*?function showActualMemos/)[0];
  assert.doesNotMatch(drilldown, /voidManualExpense|openManualExpenseModal|>Void<|>Edit<|>Delete</);
  assert.doesNotMatch(detail, /voidManualExpense|openManualExpenseModal/);
  assert.match(detail, /To modify this record, go to Actual Spend → Manual Entries\./);
  assert.match(budgetCode, /actual-spend-group-panel[\s\S]*overflow-x:hidden/);
});

test('Manual Entries is a filtered management table backed only by active manual expenses', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const renderer = budgetCode.match(/function renderManualEntries[\s\S]*?function showActualSpendDetailModal/)[0];
  assert.match(html, /id="as-manual-search"/);
  assert.match(html, /id="as-manual-project"/);
  assert.match(html, /id="as-manual-type"/);
  assert.match(html, /id="as-manual-frequency"/);
  assert.match(html, /id="as-manual-budget-status"/);
  assert.match(renderer, /activeManualExpenses\(\)/);
  assert.doesNotMatch(renderer, /APPROVED_MEMO|INFRA_COST/);
  assert.match(renderer, /View Detail[\s\S]*Edit[\s\S]*Delete/);
});

test('Manual Entries table stays compact while detail retains audit and schedule fields', () => {
  const renderer = budgetCode.match(/function renderManualEntries[\s\S]*?function showActualSpendDetailModal/)[0];
  const table = renderer.match(/container\.innerHTML = `<div class="card"[\s\S]*?;\n}/)[0];
  const detail = budgetCode.match(/function showManualEntryDetail[\s\S]*?async function renderActualSpend/)[0];
  assert.match(table, /Reference No[\s\S]*Project[\s\S]*Spend Type[\s\S]*Description[\s\S]*Amount[\s\S]*Expense \/ Coverage Date[\s\S]*Budget Status[\s\S]*Updated At[\s\S]*Actions/);
  assert.doesNotMatch(table, /<th>Frequency<\/th>|<th>Budget Pool|<th>Created By/);
  assert.match(detail, /Frequency[\s\S]*Expense Date \/ Coverage[\s\S]*Vendor \/ Program[\s\S]*Budget Pool[\s\S]*Created By[\s\S]*Created Date[\s\S]*Notes[\s\S]*Creation Method/);
});

test('Manual Entries formats audit timestamps and keeps the shorter search placeholder', () => {
  const context = createBudgetContext();
  const formatted = context.formatActualSpendDateTime('2026-07-01T09:40:31.098+00:00');
  assert.match(formatted, /^\d{2} [A-Z][a-z]{2} 2026 \d{2}:\d{2}$/);
  assert.doesNotMatch(formatted, /T|\.098|\+00:00/);
  assert.equal(context.formatActualSpendDateTime(''), '—');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="as-manual-search"[^>]*placeholder="Search reference or description\.\.\."/);
  assert.match(budgetCode, /formatActualSpendDateTime\(expense\.updatedAt\)/);
  assert.match(budgetCode, /formatActualSpendDateTime\(expense\.createdAt\)/);
});

test('Manual Entries excludes soft-deleted rows and displays blank Reference No as an em dash', async () => {
  const context = createActualSpendContext();
  await context.saveManualExpenseAsync({
    id:'manual-visible', referenceNo:'', project:'AOA-MP', expenseType:'hw', description:'Visible row',
    frequency:'one_time', expenseDate:'2026-06-01', quantity:1, unitCost:100, amount:100,
  });
  await context.saveManualExpenseAsync({
    id:'manual-deleted', referenceNo:'DELETE-ME', project:'AOA-MP', expenseType:'hw', description:'Deleted row',
    frequency:'one_time', expenseDate:'2026-06-01', quantity:1, unitCost:200, amount:200,
  });
  await context.voidManualExpenseAsync('manual-deleted', 'test delete');
  const active = context.activeManualExpenses();
  assert.deepEqual(Array.from(active, row => row.id), ['manual-visible']);
  assert.equal(context.manualEntryViewModel(active[0]).referenceNo, '—');
  assert.equal(context.reconcileActualSpendSources().some(row => row.id === 'actual-spend-manual-manual-deleted'), false);
});

test('Manual Entries Delete wrapper soft-deletes with a default reason and refreshes canonical totals', async () => {
  const context = createActualSpendContext();
  context.isPMO = () => true;
  context.confirm = () => true;
  const originalRender = context.renderActualSpend;
  let renderCount = 0;
  context.renderActualSpend = async () => { renderCount += 1; await originalRender(); };
  await context.saveManualExpenseAsync({
    id:'manual-ui-delete', referenceNo:'UI-DELETE', project:'AOA-MP', expenseType:'sl', description:'Delete through UI',
    frequency:'monthly', startMonth:'2026-01', endMonth:'2026-03', quantity:1, unitCost:100, amount:100,
  });
  assert.equal(context.calculateActualSpend(context.reconcileActualSpendSources()), 300);
  await context.voidManualExpense('manual-ui-delete');
  const deleted = context.loadManualExpenses().find(row => row.id === 'manual-ui-delete');
  assert.equal(deleted.voidReason, 'Deleted from Manual Entries');
  assert.equal(context.activeManualExpenses().length, 0);
  assert.equal(context.calculateActualSpend(context.loadActualSpendRecords()), 0);
  assert.equal(renderCount, 1);
});

test('Manual Entries Delete button uses the persisted manual ID for added and imported records', async () => {
  const context = createActualSpendContext();
  context.isPMO = () => true;
  const elements = new Map();
  elements.set('as-manual-content', { innerHTML:'', style:{} });
  context.document.getElementById = id => elements.get(id) || null;
  await context.saveManualExpenseAsync({
    id:'manual-button-id', referenceNo:'BUTTON-ID', project:'AOA-MP', expenseType:'hw', description:'Manual button record',
    frequency:'one_time', expenseDate:'2026-06-01', quantity:1, unitCost:100, amount:100,
  });
  const importedRow = context.actualSpendImportRow({
    Source:'Manual / Historical', 'Reference No':'IMPORTED-BUTTON', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:200,
    'Start Date':'2026-06-01', 'End Date':'2026-06-01', Description:'Imported button record',
  });
  const importResult = context.importActualSpendRecords([importedRow]);
  await context.promoteImportedManualExpenses(importResult.records);
  const imported = context.loadManualExpenses().find(row => row.referenceNo === 'IMPORTED-BUTTON');
  context.renderManualEntries();
  const markup = elements.get('as-manual-content').innerHTML;
  assert.match(markup, /voidManualExpense\('manual-button-id'\)/);
  assert.match(markup, new RegExp(`voidManualExpense\\('${imported.id}'\\)`));
});

test('failed Manual Entries Delete keeps the record active and reports a clear error', async () => {
  const context = createActualSpendContext();
  const messages = [];
  context.isPMO = () => true;
  context.confirm = () => true;
  context.alert = message => messages.push(message);
  await context.saveManualExpenseAsync({
    id:'manual-delete-failure', referenceNo:'KEEP-ME', project:'AOA-MP', expenseType:'hw', description:'Keep on failure',
    frequency:'one_time', expenseDate:'2026-06-01', quantity:1, unitCost:100, amount:100,
  });
  context.checkSupa = async () => true;
  context.supaFetch = async () => { throw new Error('remote update failed'); };
  await context.voidManualExpense('manual-delete-failure');
  assert.equal(context.activeManualExpenses().some(row => row.id === 'manual-delete-failure'), true);
  assert.match(messages.at(-1), /Delete failed\. No changes were made: remote update failed/);
});

test('cancelling Manual Entries Delete leaves the record unchanged without an error', async () => {
  const context = createActualSpendContext();
  const messages = [];
  context.isPMO = () => true;
  context.confirm = () => false;
  context.alert = message => messages.push(message);
  await context.saveManualExpenseAsync({
    id:'manual-delete-cancel', referenceNo:'CANCEL', project:'AOA-MP', expenseType:'hw', description:'Cancel delete',
    frequency:'one_time', expenseDate:'2026-06-01', quantity:1, unitCost:100, amount:100,
  });
  await context.voidManualExpense('manual-delete-cancel');
  assert.equal(context.activeManualExpenses().some(row => row.id === 'manual-delete-cancel'), true);
  assert.deepEqual(messages, []);
});

test('Reference No is optional in canonical validation and internal IDs are not used as display references', () => {
  const context = createActualSpendContext();
  const result = context.validateActualSpendRecord({
    id:'actual-spend-manual-internal-only', source:'Manual / Historical Expense', referenceNo:'',
    project:'AOA-MP', spendType:'Hardware', amount:100, startDate:'2026-06-01', endDate:'2026-06-01',
  });
  assert.equal(result.valid, true);
  assert.equal(result.record.referenceNo, '');
  const projected = context.manualExpenseToActualSpend({
    id:'manual-internal-only', referenceNo:'', project:'AOA-MP', expenseType:'hw', description:'No reference',
    frequency:'one_time', expenseDate:'2026-06-01', amount:100,
  });
  assert.equal(projected.referenceNo, '');
  assert.notEqual(projected.referenceNo, projected.id);
  assert.match(budgetCode, /record\.referenceNo \|\| '—'/);
  assert.doesNotMatch(budgetCode, /referenceNo:\s*(?:record\.)?id|referenceNo:\s*expense\.referenceNo\s*\|\|\s*expense\.id/);
});

test('Actual Spend export aligns canonical fields and totals for all three sources', async () => {
  const context = createActualSpendContext();
  const records = [
    context.createActualSpendRecord({
      id:'actual-spend-memo-1', source:'Approved Memo', referenceNo:'MEMO-1', spendType:'Software',
      project:'AOA-MP', amount:1200, currency:'THB', startDate:'2026-01', endDate:'2026-03',
      vendorProgram:'Product A', finalBudgetPoolId:'POOL-1', budgetStatus:'Mapped', createdBy:'Requester', description:'Memo spend',
    }),
    context.createActualSpendRecord({
      id:'actual-spend-manual-1', source:'Manual / Historical Expense', referenceNo:'HIST-1', spendType:'Hardware',
      project:'AOA-MP', amount:600, currency:'THB', startDate:'2026-02', endDate:'2026-04',
      budgetStatus:'Unbudgeted', createdBy:'PMO', description:'Historical spend',
    }),
    context.createActualSpendRecord({
      id:'actual-spend-infra-1', source:'Infra Cost', referenceNo:'INFRA-1', spendType:'Infra',
      project:'TTB', amount:900, currency:'THB', startDate:'2026-01', endDate:'2026-03',
      vendorProgram:'AWS', budgetStatus:'Unbudgeted', description:'Infrastructure cost',
    }),
  ];
  let exported;
  context.refreshCanonicalActualSpend = async () => records;
  context.filteredActualSpendRecords = () => records;
  context._downloadCSV = (filename, headers, rows) => { exported = { filename, headers, rows }; };

  await context.exportActualSpendCSV();

  assert.equal(exported.filename, 'Actual_Spend');
  assert.deepEqual(Array.from(exported.headers), [
    'Record ID','Source','Reference No','Spend Type','Project','Amount','Currency','Amount Basis',
    'Start Date','End Date','Coverage Status','Vendor / Program','Final Budget Pool','Budget Status',
    'Created By','Description','Notes',
  ]);
  assert.deepEqual(Array.from(exported.rows, row => row[1]), ['Approved Memo', 'Manual / Historical Expense', 'Infra Cost']);
  assert.deepEqual(Array.from(exported.rows, row => row[7]), ['Total for coverage period', 'Total for coverage period', 'Total for coverage period']);
  assert.deepEqual(Array.from(exported.rows, row => row[10]), ['Complete', 'Complete', 'Complete']);
  assert.equal(exported.rows[2][11], 'AWS');
  assert.equal(exported.rows[0][12], 'POOL-1');
  assert.equal(exported.rows[1][16], '');
  assert.equal(exported.rows.reduce((total, row) => total + row[5], 0), context.calculateActualSpend(records));
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
