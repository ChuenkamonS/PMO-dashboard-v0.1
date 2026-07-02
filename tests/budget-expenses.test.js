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

function createBvaContext() {
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
  ['bva-year','bva-project','bva-content','bva-untagged-alert'].forEach(element);
  context.document.getElementById = id => elements.get(id) || null;
  context.document.createElement = () => ({
    value:'', textContent:'', innerHTML:'', style:{}, id:'', options:[],
    appendChild(child) { this.options.push(child); },
    addEventListener() {},
    remove() {},
  });
  context.document.body = { appendChild(el) { context.__lastPanel = el; }, removeChild() {} };
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
  assert.deepEqual(Array.from(rows.filter(row => row.source !== 'Approved Memo'), row => row.detailLines.length), [0, 0]);
});

test('Software memo detail lines persist under one canonical record without changing the memo total', () => {
  const context = createActualSpendContext();
  const memo = {
    memoNo:'SOFTWARE-DETAIL-1', status:'completed', project:'AOA-MP', type:'sl', total:2550,
    createdAt:'2026-01-01', slItems:[
      { name:'Product A', plan:'Business', price:100, months:12, qty:2, startMonth:'2026-01', endMonth:'2026-12' },
      { name:'Product B', plan:'Pro', price:50, qty:1, startMonth:'2026-01', endMonth:'2026-03' },
    ],
  };

  const first = context.reconcileActualSpendSources([memo], [], [], []);
  const second = context.reconcileActualSpendSources([memo], [], [], []);
  const loaded = context.loadActualSpendRecords();

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, 'actual-spend-memo-SOFTWARE-DETAIL-1');
  assert.equal(loaded[0].amount, memo.total);
  assert.equal(loaded[0].detailLines.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(loaded[0].detailLines)), [
    {
      program:'Product A', plan:'Business', description:'', quantity:2, unitCost:100,
      monthlyCost:200, coverageStart:'2026-01', coverageEnd:'2026-12', coverageMonths:12, lineAmount:2400,
    },
    {
      program:'Product B', plan:'Pro', description:'', quantity:1, unitCost:50,
      monthlyCost:50, coverageStart:'2026-01', coverageEnd:'2026-03', coverageMonths:3, lineAmount:150,
    },
  ]);
});

test('legacy and malformed detail lines load safely and legacy Software reconciliation retains valid existing details', () => {
  const context = createActualSpendContext();
  const base = {
    id:'actual-spend-memo-LEGACY-SL', source:'Approved Memo', referenceNo:'LEGACY-SL', memoId:'LEGACY-SL',
    project:'AOA-MP', spendType:'Software', amount:500, startDate:'2026-01', endDate:'2026-01',
  };
  context.storeActualSpendRecords([
    context.createActualSpendRecord({ ...base, detailLines:[null, 'bad', {
      program:'Legacy Product', plan:'Pro', quantity:1, unitCost:500, monthlyCost:500,
      coverageStart:'2026-01', coverageEnd:'2026-01', coverageMonths:1, lineAmount:500,
    }] }),
  ]);

  const reconciled = context.reconcileActualSpendSources([
    { memoNo:'LEGACY-SL', status:'completed', project:'AOA-MP', type:'sl', total:500, createdAt:'2026-01-01' },
  ], [], [], []);

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].detailLines.length, 1);
  assert.equal(reconciled[0].detailLines[0].program, 'Legacy Product');
  assert.deepEqual(JSON.parse(JSON.stringify(context.createActualSpendRecord(base).detailLines)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(context.createActualSpendRecord({ ...base, detailLines:'invalid' }).detailLines)), []);
});

test('legacy Software memo without structured items receives empty details when none already exist', () => {
  const context = createActualSpendContext();
  const rows = context.reconcileActualSpendSources([
    { memoNo:'LEGACY-EMPTY', status:'completed', project:'AOA-MP', type:'sl', total:500, createdAt:'2026-01-01', sections:[{ title:'รายการ Software', html:'legacy' }] },
  ], [], [], []);
  assert.equal(rows.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0].detailLines)), []);
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
  assert.deepEqual(JSON.parse(JSON.stringify(historical.detailLines)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(infra.detailLines)), []);
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

test('Manual Actual Spend form distinguishes Monthly Amount and previews its coverage total', () => {
  assert.match(budgetCode, /frequency === 'monthly' \? 'Monthly Amount \(THB\) \*' : 'Amount \(THB\) \*'/);
  assert.match(budgetCode, /Estimated Total = Monthly Amount × Inclusive Coverage Months/);
  assert.match(budgetCode, /total: enteredAmount \* coverageMonths/);
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

test('Manual Entries import infers monthly frequency from month-only and full-date multi-month ranges', () => {
  const context = createActualSpendContext();
  const rows = [
    { Source:'Manual / Historical', 'Reference No':'MONTH-ONLY', 'Spend Type':'Software', Project:'AOA-MP', Amount:3000, 'Start Date':'2026-06', 'End Date':'2026-08' },
    { Source:'Manual / Historical', 'Reference No':'FULL-DATES', 'Spend Type':'Software', Project:'AOA-MP', Amount:6000, 'Start Date':'2026-06-01', 'End Date':'2026-08-31' },
    { Source:'Manual / Historical', 'Reference No':'ONE-DAY', 'Spend Type':'Hardware', Project:'AOA-MP', Amount:900, 'Start Date':'2026-07-01', 'End Date':'2026-07-01' },
  ].map(context.manualEntriesImportRow).map(context.manualExpenseFromImportedActualSpend);
  const monthOnly = rows.find(row => row.referenceNo === 'MONTH-ONLY');
  const fullDates = rows.find(row => row.referenceNo === 'FULL-DATES');
  const oneDay = rows.find(row => row.referenceNo === 'ONE-DAY');
  assert.deepEqual([monthOnly.frequency, monthOnly.startMonth, monthOnly.endMonth, monthOnly.amount], ['monthly','2026-06','2026-08',1000]);
  assert.deepEqual([fullDates.frequency, fullDates.startMonth, fullDates.endMonth, fullDates.amount], ['monthly','2026-06','2026-08',2000]);
  assert.deepEqual([oneDay.frequency, oneDay.expenseDate, oneDay.amount], ['one_time','2026-07-01',900]);
});

test('Excel serial and Date-object multi-month imports infer monthly frequency after normalization', () => {
  const context = createActualSpendContext();
  const serial = (year, month, day) => (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000;
  const serialRecord = context.manualExpenseFromImportedActualSpend(context.manualEntriesImportRow({
    'Reference No':'SERIAL-RANGE', 'Spend Type':'Software', Project:'AOA-MP', Amount:3000,
    'Start Date':serial(2026,6,1), 'End Date':serial(2026,8,31),
  }));
  const dateRecord = context.manualExpenseFromImportedActualSpend(context.manualEntriesImportRow({
    'Reference No':'DATE-RANGE', 'Spend Type':'Software', Project:'AOA-MP', Amount:4500,
    'Start Date':new Date(2026,5,1), 'End Date':new Date(2026,7,31),
  }));
  assert.deepEqual([serialRecord.frequency, serialRecord.startMonth, serialRecord.endMonth, serialRecord.amount], ['monthly','2026-06','2026-08',1000]);
  assert.deepEqual([dateRecord.frequency, dateRecord.startMonth, dateRecord.endMonth, dateRecord.amount], ['monthly','2026-06','2026-08',1500]);
});

test('Imported frequency inference preserves canonical Report and Forecast totals', () => {
  const context = createActualSpendContext();
  const manual = context.manualExpenseFromImportedActualSpend(context.manualEntriesImportRow({
    'Reference No':'PARITY-RANGE', 'Spend Type':'Software', Project:'AOA-MP', Amount:3000,
    'Start Date':'2026-06-01', 'End Date':'2026-08-31', 'Vendor / Program':'Suite',
  }));
  const canonical = context.manualExpenseToActualSpend(manual);
  assert.equal(manual.frequency, 'monthly');
  assert.equal(canonical.amount, 3000);
  assert.equal(context.calculateActualSpend([canonical]), 3000);
  const forecast = context.calculateForecast([canonical], new Date(2026, 6, 15));
  assert.equal(forecast.rows[0].values['2026-06'], 1000);
  assert.equal(forecast.rows[0].values['2026-07'], 1000);
  assert.equal(forecast.rows[0].values['2026-08'], 1000);
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

test('Phase 4 Manual Actual Spend modal exposes the final fields and hides legacy amount inputs', () => {
  const modal = budgetCode.match(/function openManualExpenseModal[\s\S]*?function toggleManualExpenseSchedule/)[0];
  assert.match(modal, /Manual Actual Spend/);
  assert.match(modal, /Save Actual Spend/);
  assert.match(modal, /<label>Reference No<\/label>/);
  assert.match(modal, /<label>Spend Type \*<\/label>/);
  assert.match(modal, /<label>Description \*<\/label>/);
  assert.match(modal, /<label>Frequency \*<\/label>/);
  assert.match(modal, /id="me-amount-input"/);
  assert.match(modal, /id="me-vendor-program"/);
  assert.doesNotMatch(modal, /id="me-kind"|id="me-qty"|id="me-unit-cost"/);
});

test('Phase 4 amount summary uses inclusive coverage and matches canonical manual totals', () => {
  const context = createActualSpendContext();
  const oneTime = context.manualExpenseAmountSummary('one_time', 1250, null, null);
  assert.deepEqual(JSON.parse(JSON.stringify(oneTime)), { amount:1250, coverageMonths:1, total:1250 });
  const monthly = context.manualExpenseAmountSummary('monthly', 800, '2026-01', '2026-03');
  assert.deepEqual(JSON.parse(JSON.stringify(monthly)), { amount:800, coverageMonths:3, total:2400 });
  const canonical = context.manualExpenseToActualSpend({
    id:'monthly-preview', project:'AOA-MP', expenseType:'sl', description:'Monthly service',
    frequency:'monthly', startMonth:'2026-01', endMonth:'2026-03', amount:monthly.amount,
  });
  assert.equal(canonical.amount, monthly.total);
});

test('Phase 4 manualExpenseRecalculate has one path and returns the rendered monthly preview summary', () => {
  const context = createActualSpendContext();
  const elements = new Map(Object.entries({
    'me-frequency': { value:'monthly' }, 'me-amount-input': { value:'750' },
    'me-start': { value:'2026-02' }, 'me-end': { value:'2026-05' },
    'me-amount-input-label': { textContent:'' }, 'me-coverage-months': { textContent:'' },
    'me-preview-monthly': { textContent:'' }, 'me-preview-total': { textContent:'' },
  }));
  context.document.getElementById = id => elements.get(id) || null;
  const summary = context.manualExpenseRecalculate();
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), { amount:750, coverageMonths:4, total:3000 });
  assert.equal(elements.get('me-coverage-months').textContent, '4 months');
  assert.equal(elements.get('me-preview-monthly').textContent, '฿750');
  assert.equal(elements.get('me-preview-total').textContent, '฿3,000');
  const implementation = budgetCode.match(/function manualExpenseRecalculate[\s\S]*?\n}/)[0];
  assert.equal((implementation.match(/return summary;/g) || []).length, 1);
  assert.doesNotMatch(implementation, /return amount;/);
});

test('Phase 4 manual persistence keeps Vendor Program separate and legacy amount authoritative', () => {
  const context = createActualSpendContext();
  const legacy = {
    id:'legacy-manual', entryKind:'adjustment', referenceNo:'LEGACY-1', project:'AOA-MP',
    expenseType:'hw', description:'Legacy hardware', frequency:'one_time', expenseDate:'2026-07-01',
    quantity:9, unitCost:999, amount:1500, vendorProgram:'Vendor A', notes:'Independent note',
  };
  const db = context.manualExpenseToDb(legacy);
  assert.equal(db.vendor_program, 'Vendor A');
  assert.equal(db.notes, 'Independent note');
  const loaded = context.manualExpenseFromDb(db);
  assert.equal(loaded.amount, 1500);
  assert.equal(loaded.vendorProgram, 'Vendor A');
  assert.equal(loaded.notes, 'Independent note');
  const canonical = context.manualExpenseToActualSpend(loaded);
  assert.equal(canonical.amount, 1500);
  assert.equal(canonical.vendorProgram, 'Vendor A');
  assert.equal(canonical.notes, 'Independent note');
});

test('Phase 4 create, edit, and reload preserve amount, schedule, pool, Vendor Program, and Notes', async () => {
  const context = createActualSpendContext();
  const created = await context.saveManualExpenseAsync({
    id:'phase4-lifecycle', entryKind:'historical', referenceNo:'P4-LIFE', project:'AOA-MP', budgetPoolId:'pool-1',
    expenseType:'sl', description:'Lifecycle', frequency:'monthly', startMonth:'2026-06', endMonth:'2026-08',
    quantity:1, unitCost:1000, amount:1000, vendorProgram:'Suite A', notes:'Original note',
  });
  await context.saveManualExpenseAsync({ ...created, amount:1200, unitCost:1200, vendorProgram:'Suite B', notes:'Edited note' });
  const local = context.loadManualExpenses()[0];
  assert.deepEqual(
    [local.amount, local.frequency, local.startMonth, local.endMonth, local.budgetPoolId, local.vendorProgram, local.notes],
    [1200,'monthly','2026-06','2026-08','pool-1','Suite B','Edited note'],
  );

  context.checkSupa = async () => true;
  context.supaFetch = async () => [context.manualExpenseToDb(local)];
  const reloaded = (await context.loadManualExpensesAsync())[0];
  assert.deepEqual(
    [reloaded.amount, reloaded.frequency, reloaded.startMonth, reloaded.endMonth, reloaded.budgetPoolId, reloaded.vendorProgram, reloaded.notes],
    [1200,'monthly','2026-06','2026-08','pool-1','Suite B','Edited note'],
  );
  const canonical = context.manualExpenseToActualSpend(reloaded);
  assert.equal(canonical.amount, 3600);
  assert.equal(canonical.manualBudgetPoolId, 'pool-1');
  assert.equal(canonical.notes, 'Edited note');
});

test('Phase 7A-3: Manual Entry save-time validation uses the canonical derived Budget Pool year, not the raw stored year', async () => {
  const context = createActualSpendContext();
  // createActualSpendContext() evaluates app.js's real isPMO() into the context, which silently
  // overwrites createBudgetContext()'s `isPMO: () => true` stub -- the real implementation reads
  // #sb-user-btn/#sb-urole, which this test's DOM map never populates, so it would otherwise
  // return false and saveManualExpenseFromModal() would bail out at its PMO-only guard before
  // ever reaching the cross-year check under test. Restore the simple stub explicitly.
  context.isPMO = () => true;
  // Raw stored pool: label says Buddhist Era 2569, but its own dates are actually 2025 (true
  // canonical derived year is 2568) -- simulates a pool whose raw year was never reconciled
  // against its own dates.
  context.storeBudgetPools([{
    id:'pool-raw-mismatch', project:'AOA-MP', name:'Raw Mismatch Pool', budget:100000,
    year:'2569', startMonth:'2025-01', endMonth:'2025-12', memoTypes:['sl'],
  }]);

  const elements = new Map();
  const setField = (id, value) => elements.set(id, { id, value, textContent:'' });
  setField('me-id', '');
  setField('me-frequency', 'one_time');
  setField('me-reference', '');
  setField('me-project', 'AOA-MP');
  setField('me-pool', 'pool-raw-mismatch');
  setField('me-type', 'sl');
  setField('me-description', 'Cross-year canonical check');
  setField('me-date', '2026-03-15'); // 2026 -> BE 2569, disagrees with the pool's TRUE derived year 2568
  setField('me-start', '');
  setField('me-end', '');
  setField('me-amount-input', '1000');
  setField('me-vendor-program', '');
  setField('me-notes', '');
  context.document.getElementById = id => elements.get(id) || null;

  let alertMessage = null;
  context.alert = message => { alertMessage = message; };

  await context.saveManualExpenseFromModal();
  assert.ok(alertMessage && /คนละปี/.test(alertMessage), 'save must be blocked with a clear cross-year error, using the canonical (2568) year, not the raw stored (2569) year');
  assert.equal(context.loadManualExpenses().length, 0, 'the invalid budgetPoolId must not be persisted');

  // Control: the SAME raw (mismatched-label) pool, but an expense genuinely dated within its
  // true canonical year (2025 / BE 2568), must be accepted.
  alertMessage = null;
  setField('me-date', '2025-06-15');
  await context.saveManualExpenseFromModal();
  assert.equal(alertMessage, null, 'a same-canonical-year expense must not be blocked');
  assert.equal(context.loadManualExpenses().length, 1, 'a same-canonical-year expense must save successfully');
});

test('Phase 7A-3: Manual Entry save-time validation blocks a cross-project Budget Pool selection', async () => {
  const context = createActualSpendContext();
  context.isPMO = () => true;
  context.storeBudgetPools([{
    id:'pool-other-project', project:'OTHER-PRJ', name:'Other Project Pool', budget:100000,
    year:'2569', startMonth:'2026-01', endMonth:'2026-12', memoTypes:['sl'],
  }]);

  const elements = new Map();
  const setField = (id, value) => elements.set(id, { id, value, textContent:'' });
  setField('me-id', '');
  setField('me-frequency', 'one_time');
  setField('me-reference', '');
  setField('me-project', 'AOA-MP');
  setField('me-pool', 'pool-other-project'); // pool belongs to a different project
  setField('me-type', 'sl');
  setField('me-description', 'Cross-project check');
  setField('me-date', '2026-03-15');
  setField('me-start', '');
  setField('me-end', '');
  setField('me-amount-input', '1000');
  setField('me-vendor-program', '');
  setField('me-notes', '');
  context.document.getElementById = id => elements.get(id) || null;

  let alertMessage = null;
  context.alert = message => { alertMessage = message; };

  await context.saveManualExpenseFromModal();
  assert.ok(alertMessage && /คนละ Project/.test(alertMessage), 'save must be blocked with a clear cross-project error');
  assert.equal(context.loadManualExpenses().length, 0, 'the invalid budget_pool_id must not be persisted');

  // Control: the SAME project, same year -> must save successfully.
  alertMessage = null;
  context.storeBudgetPools([{
    id:'pool-same-project', project:'AOA-MP', name:'Same Project Pool', budget:100000,
    year:'2569', startMonth:'2026-01', endMonth:'2026-12', memoTypes:['sl'],
  }]);
  setField('me-pool', 'pool-same-project');
  await context.saveManualExpenseFromModal();
  assert.equal(alertMessage, null, 'a same-project, same-year selection must not be blocked');
  assert.equal(context.loadManualExpenses().length, 1, 'a same-project, same-year selection must save successfully');
});

test('Phase 4 schema-lag reload preserves locally saved Vendor Program without using Notes', async () => {
  const context = createActualSpendContext();
  await context.saveManualExpenseAsync({
    id:'schema-reload', entryKind:'historical', referenceNo:'SCHEMA-RELOAD', project:'AOA-MP',
    expenseType:'hw', description:'Reload', frequency:'one_time', expenseDate:'2026-07-01',
    quantity:1, unitCost:500, amount:500, vendorProgram:'Vendor Local', notes:'Real note',
  });
  context.checkSupa = async () => true;
  context.supaFetch = async () => [{
    id:'schema-reload', entry_kind:'historical', reference_no:'SCHEMA-RELOAD', project:'AOA-MP',
    expense_type:'hw', description:'Reload', frequency:'one_time', expense_date:'2026-07-01',
    quantity:1, unit_cost:500, amount:500, notes:'Real note',
  }];
  const reloaded = (await context.loadManualExpensesAsync())[0];
  assert.equal(reloaded.vendorProgram, 'Vendor Local');
  assert.equal(reloaded.notes, 'Real note');
});

test('Phase 4 imported manual Vendor Program uses its dedicated field without changing import totals', async () => {
  const context = createActualSpendContext();
  const result = context.importActualSpendRecords([context.manualEntriesImportRow({
    Source:'Manual / Historical', 'Reference No':'VENDOR-IMPORT', 'Spend Type':'Software', Project:'AOA-MP',
    Amount:3600, 'Start Date':'2026-01', 'End Date':'2026-03', 'Vendor / Program':'Suite A', Description:'Subscription',
  })]);
  await context.promoteImportedManualExpenses(result.records);
  const manual = context.loadManualExpenses()[0];
  assert.equal(manual.vendorProgram, 'Suite A');
  assert.equal(manual.notes, '');
  assert.equal(manual.amount, 1200);
  const canonical = context.reconcileActualSpendSources()[0];
  assert.equal(canonical.vendorProgram, 'Suite A');
  assert.equal(canonical.amount, 3600);
});

test('Phase 4 retries a manual save without vendor_program when Supabase schema cache returns PGRST204', async () => {
  const context = createActualSpendContext();
  const payloads = [];
  context.checkSupa = async () => true;
  context.supaFetch = async (_table, _method, body) => {
    payloads.push(body);
    if (payloads.length === 1) {
      const error = new Error('PGRST204 Could not find the vendor_program column in the schema cache');
      error.code = 'PGRST204';
      throw error;
    }
    return [body];
  };
  const saved = await context.saveManualExpenseAsync({
    id:'schema-lag', entryKind:'historical', referenceNo:'SCHEMA-LAG', project:'AOA-MP',
    expenseType:'sl', description:'Schema lag save', frequency:'one_time', expenseDate:'2026-07-01',
    quantity:1, unitCost:900, amount:900, vendorProgram:'Vendor B', notes:'Keep separate',
  });
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].vendor_program, 'Vendor B');
  assert.equal(Object.hasOwn(payloads[1], 'vendor_program'), false);
  assert.equal(saved.vendorProgram, 'Vendor B');
  assert.equal(context.loadManualExpenses()[0].vendorProgram, 'Vendor B');
  assert.equal(context.loadManualExpenses()[0].notes, 'Keep separate');
});

test('Phase 4 does not hide unrelated Supabase manual-save failures', async () => {
  const context = createActualSpendContext();
  context.checkSupa = async () => true;
  context.supaFetch = async () => { throw new Error('PGRST204 Could not find a different column in the schema cache'); };
  await assert.rejects(() => context.saveManualExpenseAsync({
    id:'real-failure', project:'AOA-MP', expenseType:'sl', description:'Must fail',
    frequency:'one_time', expenseDate:'2026-07-01', quantity:1, unitCost:100, amount:100,
  }), /different column/);
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

test('Phase 4 Actual Spend Report detail displays the canonical final Budget Pool name', () => {
  const context = createActualSpendContext();
  context.storeBudgetPools([{
    id:'pool-report', project:'AOA-MP', name:'Software 2569', budget:10000, year:'2569',
    startMonth:'2026-01', endMonth:'2026-12', memoTypes:['sl'],
  }]);
  context.storeActualSpendRecords([context.createActualSpendRecord({
    id:'actual-report-pool', source:'Manual / Historical Expense', referenceNo:'POOL-REPORT',
    project:'AOA-MP', spendType:'Software', amount:1200, startDate:'2026-06', endDate:'2026-06',
    manualBudgetPoolId:'pool-report', budgetStatus:'Manual Override', notes:'Canonical note',
  })]);
  let detail;
  context.showActualSpendDetailModal = (_title, fields) => { detail = fields; };
  context.showActualSpendRecord('actual-report-pool');
  assert.deepEqual(Array.from(detail.find(([label]) => label === 'Budget Pool')), ['Budget Pool','Software 2569']);
  assert.deepEqual(Array.from(detail.find(([label]) => label === 'Budget Status')), ['Budget Status','Manual Override']);
  assert.deepEqual(Array.from(detail.find(([label]) => label === 'Notes')), ['Notes','Canonical note']);
});

test('Report Detail displays canonical Software detail lines with authoritative parent amount', () => {
  const context = createActualSpendContext();
  context.storeActualSpendRecords([context.createActualSpendRecord({
    id:'software-detail-report', source:'Approved Memo', referenceNo:'MEMO-SOFTWARE', memoId:'MEMO-SOFTWARE',
    project:'AOA-MP', spendType:'Software', amount:2550, startDate:'2026-01', endDate:'2026-12',
    detailLines:[
      { program:'Product A', plan:'Business', quantity:2, unitCost:100, monthlyCost:200, coverageStart:'2026-01', coverageEnd:'2026-12', coverageMonths:12, lineAmount:2400 },
      { program:'Product B', plan:'Pro', quantity:1, unitCost:50, monthlyCost:50, coverageStart:'2026-01', coverageEnd:'2026-03', coverageMonths:3, lineAmount:100 },
    ],
  })]);
  context.openMemoReadOnly = () => { throw new Error('Report Detail must not read Memo data'); };
  let shown;
  context.showActualSpendDetailModal = (title, fields, helper, details) => { shown = { title, fields, helper, details }; };

  context.showActualSpendRecord('software-detail-report');

  assert.equal(shown.title, 'Actual Spend Detail');
  assert.deepEqual(Array.from(shown.fields.find(([label]) => label === 'Amount')), ['Amount','฿2,550']);
  assert.match(shown.details, /Software Details/);
  assert.match(shown.details, /Product A[\s\S]*Business[\s\S]*Product B[\s\S]*Pro/);
  assert.match(shown.details, /Parent Actual Spend Amount \(Authoritative\)[\s\S]*฿2,550/);
  assert.match(shown.details, /Detail Subtotal \(Informational Only\)[\s\S]*฿2,500/);
  assert.match(shown.details, /Differs from the authoritative parent amount/);
  assert.doesNotMatch(shown.details, /memo\.sections|memo\.slItems/);
  assert.equal(context.loadActualSpendRecords().length, 1);
  assert.equal(context.loadActualSpendRecords()[0].amount, 2550);
});

test('Software detail section is absent for empty, Manual, and Infra records', () => {
  const context = createActualSpendContext();
  const records = [
    context.createActualSpendRecord({ id:'legacy-software', source:'Approved Memo', referenceNo:'LEGACY', project:'AOA-MP', spendType:'Software', amount:100, startDate:'2026-01', endDate:'2026-01' }),
    context.createActualSpendRecord({ id:'manual-software', source:'Manual / Historical Expense', referenceNo:'MANUAL', project:'AOA-MP', spendType:'Software', amount:100, startDate:'2026-01', endDate:'2026-01', detailLines:[{ program:'Ignore', lineAmount:100 }] }),
    context.createActualSpendRecord({ id:'infra-detail', source:'Infra Cost', referenceNo:'INFRA', project:'AOA-MP', spendType:'Infra', amount:100, startDate:'2026-01', endDate:'2026-01', detailLines:[{ program:'Ignore', lineAmount:100 }] }),
  ];
  context.storeActualSpendRecords(records);
  const details = [];
  context.showActualSpendDetailModal = (_title, _fields, _helper, extra) => details.push(extra);

  records.forEach(record => context.showActualSpendRecord(record.id));

  assert.deepEqual(details, ['', '', '']);
  assert.equal(context.calculateActualSpend(context.loadActualSpendRecords()), 300);
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
      detailLines:[{ program:'Product A', plan:'Pro', quantity:1, unitCost:400, monthlyCost:400, coverageStart:'2026-01', coverageEnd:'2026-03', coverageMonths:3, lineAmount:1200 }],
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
  assert.equal(exported.rows.length, 3);
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

test('Phase 7A-5v2: Overview custom range selectors validate only via Apply, not on change', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const customRangeBlock = html.match(/<div id="ov-custom-range"[\s\S]*?<\/div>/)[0];
  assert.doesNotMatch(customRangeBlock, /onchange=/, 'from/to selects must not validate or apply on every change');
  assert.match(customRangeBlock, /<button[^>]*onclick="ovApplyCustomRange\(\)"[^>]*>Apply<\/button>/);
});

test('Phase 7A-5v2: an invalid (>12 month) custom range shows an alert and does not update the graph/KPI state', () => {
  const context = createOverviewContext();
  seedOverview(context);
  const periodBefore = context.__elements.get('ov-period-label').textContent;
  const kpiBefore = context.__elements.get('bgt-kpi-total').textContent;
  const chartCallsBefore = context.chartConfigs.length;
  const messages = [];
  context.alert = message => messages.push(message);

  // Freely changing the selectors (no Apply yet) must not trigger validation or a re-render.
  context.__elements.get('ov-from-sel').value = '0';
  context.__elements.get('ov-to-sel').value = '23'; // 24-month span, exceeds the 12-month limit
  assert.equal(messages.length, 0, 'changing the selectors alone must not validate before Apply is clicked');
  assert.equal(context.chartConfigs.length, chartCallsBefore, 'the graph must not change before Apply is clicked');

  context.ovApplyCustomRange();

  assert.equal(messages.length, 1, 'selecting more than 12 months must show a clear popup/message');
  assert.match(messages[0], /12/, 'the message must state the 12-month limit');
  assert.equal(context.__elements.get('ov-period-label').textContent, periodBefore,
    'an out-of-range selection must not be silently applied as a (different, e.g. 12-month) period');
  assert.equal(context.__elements.get('bgt-kpi-total').textContent, kpiBefore,
    'the KPI must not update for a blocked, out-of-range custom range');
  assert.equal(context.chartConfigs.length, chartCallsBefore, 'the graph must not update for a blocked custom range');
});

test('Phase 7A-5v2: a valid custom range only applies once Apply is clicked', () => {
  const context = createOverviewContext();
  seedOverview(context);
  const periodBefore = context.__elements.get('ov-period-label').textContent;

  context.__elements.get('ov-from-sel').value = '12';
  context.__elements.get('ov-to-sel').value = '14'; // valid 3-month span
  assert.equal(context.__elements.get('ov-period-label').textContent, periodBefore,
    'selecting a valid range must not apply until Apply is clicked');

  context.ovApplyCustomRange();
  assertOverviewTotals(context, 3000);
  assert.notEqual(context.__elements.get('ov-period-label').textContent, periodBefore,
    'clicking Apply with a valid range must update the period/graph/KPI');
});

test('Phase 7A-5v2: switching to Custom seeds the selectors with the currently applied range, not a stale multi-year-old default', () => {
  const context = createOverviewContext();
  seedOverview(context); // default preset is 12M
  context.ovSetPreset(6); // apply a 6-month window first
  context.ovSetPreset(0); // switch to Custom
  const toIdx = context.__elements.get('ov-to-sel').value;
  const fromIdx = context.__elements.get('ov-from-sel').value;
  assert.equal(Number(toIdx), 23, 'the "to" selector should reflect the currently applied period, not default to the last option only by coincidence');
  assert.equal(Number(fromIdx), 18, 'the "from" selector must reflect the currently applied 6-month window, not a stale default two years back');
});

function seedOverviewManyProjects(context, count) {
  const records = Array.from({ length: count }, (_, i) => context.createActualSpendRecord({
    id: `many-proj-${i}`, source: 'Manual / Historical Expense', referenceNo: `MP-${i}`,
    project: `Project ${i}`, spendType: 'Hardware', amount: 1000 + i,
    startDate: monthKey(0), endDate: monthKey(0),
  }));
  context.storeActualSpendRecords(records);
  context.renderBudgetOverview();
}

test('Phase 7A-6: Overview chart card uses a responsive wrapper so the donut/legend cannot be pushed off-screen', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /\.ov-breakdown-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)\s+minmax\(180px,220px\)/,
    'the main chart column must be allowed to shrink (minmax(0,1fr)), not a bare 1fr, or it can force the donut/legend past the viewport');
  assert.match(html, /@media\s*\(max-width:\s*720px\)\s*\{\s*\.ov-breakdown-grid\s*\{\s*grid-template-columns:\s*minmax\(0,1fr\)\s*;/,
    'the donut/legend must be able to stack below the main chart on narrow widths instead of overflowing');
  assert.match(html, /<div class="ov-breakdown-grid">/, 'the breakdown chart row must use the responsive wrapper class');
  assert.doesNotMatch(html, /<div style="display:grid;grid-template-columns:1fr 200px/, 'the old fixed, non-shrinking grid must be removed');
  assert.match(html, /id="ov-donut-legend"[^>]*max-height:200px[^>]*overflow-y:auto/, 'many legend items must scroll internally instead of growing the card unboundedly');
});

test('Phase 7A-6: Group by Project with many projects keeps every project in the (non-overflowing, scrollable) legend', () => {
  const context = createOverviewContext();
  seedOverviewManyProjects(context, 18);
  context.ovSetGroup('project');

  const legendHtml = context.__elements.get('ov-donut-legend').innerHTML;
  const legendRows = (legendHtml.match(/<span style="width:8px;height:8px/g) || []).length;
  assert.equal(legendRows, 18, 'every project must still be represented in the legend, none hidden by the layout fix');
  assert.match(legendHtml, /text-overflow:ellipsis;white-space:nowrap/, 'long project names must truncate rather than force the row wider');

  const bar = [...context.chartConfigs].reverse().find(config => config.type === 'bar');
  assert.equal(bar.data.datasets.length, 18, 'the main chart must still carry one series per project');
});

test('Phase 7A-6: Group by Type still renders after the chart layout change', () => {
  const context = createOverviewContext();
  seedOverview(context);
  context.ovSetGroup('type');
  const bar = [...context.chartConfigs].reverse().find(config => config.type === 'bar');
  assert.ok(bar && bar.data.datasets.length > 0, 'the main bar chart must still render when grouped by Type');
  assert.match(context.__elements.get('ov-donut-legend').innerHTML, /width:8px;height:8px/);
});

test('Phase 7A-6: Overview totals remain unchanged by the chart layout fix, across presets and Group by Project', () => {
  const context = createOverviewContext();
  seedOverview(context);
  assertOverviewTotals(context, 33000);
  context.ovSetGroup('project');
  assertOverviewTotals(context, 33000);
  context.ovSetPreset(6);
  assertOverviewTotals(context, 27000);
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

test('Phase 4 Vendor Program migration is additive', () => {
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260701090000_add_manual_expense_vendor_program.sql'),
    'utf8'
  );
  assert.match(migration, /alter table public\.budget_manual_expenses/);
  assert.match(migration, /add column if not exists vendor_program text/);
  assert.doesNotMatch(migration, /drop\s+(?:table|column)/i);
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

function seedBvaScenario(context) {
  const pools = [
    context.createBudgetPoolRecord({ id:'bva-ui-pool', project:'AOA-MP', name:'Software Pool', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] }),
    context.createBudgetPoolRecord({ id:'bva-ui-pool-a', project:'AOA-MP', name:'Infra Overlap A', budget:20000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Infra'] }),
    context.createBudgetPoolRecord({ id:'bva-ui-pool-b', project:'AOA-MP', name:'Infra Overlap B', budget:20000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Infra'] }),
  ];
  context.storeActualSpendRecords([
    context.createActualSpendRecord({ id:'bva-ui-mapped', source:'Approved Memo', referenceNo:'MEMO-UI-1', memoId:'MEMO-UI-1', project:'AOA-MP', spendType:'Software', amount:5000, startDate:'2026-03', endDate:'2026-03' }),
    context.createActualSpendRecord({ id:'bva-ui-unbudgeted', source:'Manual / Historical Expense', referenceNo:'MAN-UI-1', project:'AOA-MP', spendType:'Hardware', amount:1200, startDate:'2026-03', endDate:'2026-03' }),
    context.createActualSpendRecord({ id:'bva-ui-review', source:'Infra Cost', referenceNo:'INFRA-UI-1', project:'AOA-MP', spendType:'Infra', amount:3300, startDate:'2026-03', endDate:'2026-03' }),
  ]);
  context.__elements.get('bva-year').value = '2569';
  context.__elements.get('bva-project').value = 'all';
  context._renderBvaWith(pools);
  return pools;
}

test('Phase 7A-7: BvA keeps Unbudgeted/Needs PMO Review summaries visible, but "View items" now navigates to the Budget Assignment Workspace, not a modal', async () => {
  const context = createBvaContext();
  seedBvaScenario(context);
  const html = context.__elements.get('bva-content').innerHTML;

  assert.match(html, /id="bva-unbudgeted-section"/);
  assert.match(html, /id="bva-needs-review-section"/);
  assert.match(html, /Unbudgeted Actual Spend \(1 items\)/);
  assert.match(html, /Needs PMO Review \(1 items\)/);
  const viewItemsButtons = (html.match(/onclick="showBudgetAssignmentWorkspace\(\)"/g) || []).length;
  assert.equal(viewItemsButtons, 2, 'both summary sections must link to the workspace');
  assert.doesNotMatch(html, /onclick="showBvaActualSpend\('unbudgeted'\)"|onclick="showBvaActualSpend\('needs-review'\)"/,
    'these buckets must no longer open a modal/popup');
  // The summary itself must stay a lightweight count/total, not the full record list.
  assert.doesNotMatch(html, /MAN-UI-1|INFRA-UI-1/, 'the BvA summary should not inline the full record list any more — that now lives in the workspace');

  await context.showBudgetAssignmentWorkspace();
  assert.match(context.__elements.get('bva-content').innerHTML, /Budget Assignment/);

  await context.closeBudgetAssignmentWorkspace();
  const backToSummary = context.__elements.get('bva-content').innerHTML;
  assert.doesNotMatch(backToSummary, /Budget Assignment</);
  assert.match(backToSummary, /id="bva-unbudgeted-section"/, 'closing the workspace must return to the BvA summary');
});

async function seedAssignmentWorkspaceScenario(context) {
  const pools = [
    context.createBudgetPoolRecord({ id:'ws-pool-infra-a', project:'AOA-MP', name:'Infra A', budget:20000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Infra'] }),
    context.createBudgetPoolRecord({ id:'ws-pool-infra-b', project:'AOA-MP', name:'Infra B', budget:20000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Infra'] }),
  ];
  // Persist to the actual pool store (not just a local variable) — showBudgetAssignmentWorkspace()
  // re-renders via renderBudgetVsActual(), which reloads pools from storage, not from whatever was
  // passed directly into the first _renderBvaWith() call below.
  context.storeBudgetPools(pools);
  context.storeActualSpendRecords([
    context.createActualSpendRecord({ id:'ws-memo-unbudgeted', source:'Approved Memo', referenceNo:'WS-MEMO-1', memoId:'WS-MEMO-1', project:'AOA-MP', spendType:'Software', description:'Adobe renewal', amount:5000, startDate:'2026-03', endDate:'2026-03' }),
    context.createActualSpendRecord({ id:'ws-infra-review', source:'Infra Cost', referenceNo:'WS-INFRA-1', project:'AOA-MP', spendType:'Infra', description:'AWS bill', amount:4400, startDate:'2026-03', endDate:'2026-03' }),
  ]);
  // A real manual expense (not a hand-crafted canonical record) so reconciliation projects it
  // through manualExpenseToActualSpend() with the genuine `actual-spend-manual-<id>` id shape that
  // assignBudgetPoolFromWorkspace() expects to strip.
  await context.saveManualExpenseAsync({
    id:'ws-manual-1', entryKind:'historical', referenceNo:'WS-MAN-1', project:'AOA-MP',
    expenseType:'hw', description:'Laptop batch', frequency:'one_time', expenseDate:'2026-03-15',
    quantity:1, unitCost:3000, amount:3000, vendorProgram:'', notes:'',
  });
  context.__elements.get('bva-year').value = '2569';
  context.__elements.get('bva-project').value = 'all';
  context._renderBvaWith(pools);
  return pools;
}

test('Phase 7A-7: Budget Assignment Workspace lists Unbudgeted and Needs PMO Review records with key fields, and keeps the memo reference clickable', async () => {
  const context = createBvaContext();
  await seedAssignmentWorkspaceScenario(context);
  await context.showBudgetAssignmentWorkspace();
  const html = context.__elements.get('bva-content').innerHTML;

  assert.match(html, /Budget Assignment/);
  assert.match(html, /WS-MEMO-1/, 'Unbudgeted memo-origin record must be listed');
  assert.match(html, /WS-MAN-1/, 'Unbudgeted manual-origin record must be listed');
  assert.match(html, /WS-INFRA-1/, 'Needs PMO Review record must be listed');

  ['AOA-MP', 'Adobe renewal', 'Software', context.money(5000), '2026-03'].forEach(text =>
    assert.ok(html.includes(text), `expected a workspace row to include "${text}"`));
  assert.match(html, /Unbudgeted/);
  assert.match(html, /No matching Budget Pool|Manual Actual Spend has no assigned Budget Pool/);
  assert.match(html, /Multiple Budget Pools match/);

  // Memo reference remains clickable through to the existing read-only Memo viewer.
  assert.match(html, /onclick="typeof openMemoReadOnly==='function'&&openMemoReadOnly\('WS-MEMO-1'\)"/);

  // Rendered directly in the page (table, no horizontal scroll), not a popup.
  assert.match(html, /table-layout:fixed/);
  assert.doesNotMatch(html, /id="bva-memo-panel"/);

  // A clear way back to the BvA summary.
  assert.match(html, /onclick="closeBudgetAssignmentWorkspace\(\)"/);

  // Assignable sources get an action; Infra Cost is view-only with a clear note.
  assert.match(html, /onclick="assignBudgetPoolFromWorkspace\('ws-memo-unbudgeted'\)"/);
  assert.match(html, /onclick="assignBudgetPoolFromWorkspace\('actual-spend-manual-ws-manual-1'\)"/);
  assert.match(html, /View only/);
});

test('Phase 7A-7: assignBudgetPoolFromWorkspace() routes to the existing Tag Budget / Manual Expense paths by source, and never invents Infra Cost assignment', async () => {
  const context = createBvaContext();
  await seedAssignmentWorkspaceScenario(context);

  let tagCalledWith = null;
  context.openBudgetTagModal = memoNo => { tagCalledWith = memoNo; };
  context.assignBudgetPoolFromWorkspace('ws-memo-unbudgeted');
  assert.equal(tagCalledWith, 'WS-MEMO-1', 'Approved Memo records must route through the existing Tag Budget modal');

  let manualCalledWith = null;
  context.openManualExpenseModal = id => { manualCalledWith = id; };
  context.document.querySelector = () => null;
  context.assignBudgetPoolFromWorkspace('actual-spend-manual-ws-manual-1');
  assert.equal(manualCalledWith, 'ws-manual-1', 'Manual Actual Spend records must route through the existing Manual Expense modal using the underlying manual expense id (prefix stripped)');

  let infraAlert = null;
  context.alert = message => { infraAlert = message; };
  context.assignBudgetPoolFromWorkspace('ws-infra-review');
  assert.ok(infraAlert && /Infra Cost/.test(infraAlert), 'Infra Cost must show a clear note instead of silently doing nothing');
});

test('Phase 7A-7: assigning a valid pool to Manual Actual Spend updates manual persistence and reconciles it from Unbudgeted to Manual Override', async () => {
  const context = createBvaContext();
  const pool = context.createBudgetPoolRecord({ id:'assign-pool-manual', project:'AOA-MP', name:'Manual Pool', budget:20000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Hardware'] });
  context.storeBudgetPools([pool]);
  await context.saveManualExpenseAsync({
    id:'assign-manual-1', entryKind:'historical', referenceNo:'ASSIGN-M-1', project:'AOA-MP',
    expenseType:'hw', description:'Assign test', frequency:'one_time', expenseDate:'2026-03-15',
    quantity:1, unitCost:900, amount:900, vendorProgram:'', notes:'',
  });

  const before = context.reconcileActualSpendSources(context.loadMemos(), context.activeManualExpenses(), context.loadInfraCosts(), [pool]);
  assert.equal(before.find(r => r.id === 'actual-spend-manual-assign-manual-1').budgetStatus, 'Unbudgeted');

  // Simulate assignBudgetPoolFromWorkspace() opening the existing Manual Expense modal and the
  // PMO picking the pool, then saving through the existing, unmodified save path.
  context.isPMO = () => true;
  const elements = new Map();
  const setField = (id, value) => elements.set(id, { id, value, textContent:'' });
  setField('me-id', 'assign-manual-1');
  setField('me-frequency', 'one_time');
  setField('me-reference', 'ASSIGN-M-1');
  setField('me-project', 'AOA-MP');
  setField('me-pool', 'assign-pool-manual');
  setField('me-type', 'hw');
  setField('me-description', 'Assign test');
  setField('me-date', '2026-03-15');
  setField('me-start', ''); setField('me-end', '');
  setField('me-amount-input', '900');
  setField('me-vendor-program', ''); setField('me-notes', '');
  context.document.getElementById = id => elements.get(id) || null;

  await context.saveManualExpenseFromModal();

  const updatedExpense = context.loadManualExpenses().find(e => e.id === 'assign-manual-1');
  assert.equal(updatedExpense.budgetPoolId, 'assign-pool-manual', 'manual persistence must store the assigned Budget Pool');

  const after = context.reconcileActualSpendSources(context.loadMemos(), context.activeManualExpenses(), context.loadInfraCosts(), [pool]);
  const afterRecord = after.find(r => r.id === 'actual-spend-manual-assign-manual-1');
  assert.equal(afterRecord.budgetStatus, 'Manual Override', 'reconciliation must move it from Unbudgeted to Manual Override');
  assert.equal(afterRecord.finalBudgetPoolId, 'assign-pool-manual');
});

test('Phase 7A-7: memo-origin Needs PMO Review assignment via the existing override path resolves into the selected Budget Pool', () => {
  const context = createBvaContext();
  const poolA = context.createBudgetPoolRecord({ id:'assign-pool-a', project:'AOA-MP', name:'Pool A', budget:10000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = context.createBudgetPoolRecord({ id:'assign-pool-b', project:'AOA-MP', name:'Pool B', budget:10000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = context.createActualSpendRecord({
    id:'actual-spend-memo-ASSIGN-MEMO-1', source:'Approved Memo', referenceNo:'ASSIGN-MEMO-1', memoId:'ASSIGN-MEMO-1',
    project:'AOA-MP', spendType:'Software', amount:4000, startDate:'2026-04', endDate:'2026-04',
  });
  const mapped = context.mapBudgetPool(record, [poolA, poolB]);
  assert.equal(mapped.budgetStatus, 'Needs PMO Review', 'sanity: two equally-matching pools produce Needs PMO Review');
  context.storeActualSpendRecords([mapped]);

  // saveBudgetTag() (views/history.js, invoked by the Tag Budget modal assignBudgetPoolFromWorkspace()
  // opens) itself calls updateActualSpendBudgetOverride() to persist the assignment — call the same
  // canonical function directly here since saveBudgetTag()'s own DOM-bound radio input is outside
  // this test harness's loaded files.
  const updated = context.updateActualSpendBudgetOverride('ASSIGN-MEMO-1', 'assign-pool-a', [poolA, poolB]);
  assert.equal(updated.budgetStatus, 'Manual Override');
  assert.equal(updated.finalBudgetPoolId, 'assign-pool-a');

  const dataset = context.calculateBudgetVsActualDataset([poolA, poolB], context.loadActualSpendRecords(), { year:'2569', project:'AOA-MP' });
  assert.equal(dataset.needsReviewRecords.length, 0, 'the record must no longer appear in Needs PMO Review after assignment');
  assert.equal(dataset.rows.find(r => r.pool.id === 'assign-pool-a').actual, 4000);
});

test('Phase 7A-7: cross-project Budget Pool assignment is blocked for memo-origin records and does not persist', () => {
  const context = createBvaContext();
  const poolOther = context.createBudgetPoolRecord({ id:'assign-pool-other-proj', project:'OTHER-PRJ', name:'Other', budget:10000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = context.createActualSpendRecord({
    id:'actual-spend-memo-ASSIGN-MEMO-2', source:'Approved Memo', referenceNo:'ASSIGN-MEMO-2', memoId:'ASSIGN-MEMO-2',
    project:'AOA-MP', spendType:'Software', amount:2000, startDate:'2026-04', endDate:'2026-04', budgetStatus:'Unbudgeted',
  });
  context.storeActualSpendRecords([record]);
  const updated = context.updateActualSpendBudgetOverride('ASSIGN-MEMO-2', 'assign-pool-other-proj', [poolOther]);
  assert.equal(updated.budgetStatus, 'Unbudgeted', 'a cross-project assignment must not persist as a valid override');
  assert.equal(updated.finalBudgetPoolId, null, 'the invalid budgetPoolId must not take effect');
  assert.equal(updated.mappingWarning, 'blocked-cross-project-override');
});

test('Phase 7A-7: cross-year Budget Pool assignment is blocked for memo-origin records and does not persist', () => {
  const context = createBvaContext();
  const poolDiffYear = context.createBudgetPoolRecord({ id:'assign-pool-diff-year', project:'AOA-MP', name:'Old Year', budget:10000, startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'] });
  const record = context.createActualSpendRecord({
    id:'actual-spend-memo-ASSIGN-MEMO-3', source:'Approved Memo', referenceNo:'ASSIGN-MEMO-3', memoId:'ASSIGN-MEMO-3',
    project:'AOA-MP', spendType:'Software', amount:2500, startDate:'2026-04', endDate:'2026-04', budgetStatus:'Unbudgeted',
  });
  context.storeActualSpendRecords([record]);
  const updated = context.updateActualSpendBudgetOverride('ASSIGN-MEMO-3', 'assign-pool-diff-year', [poolDiffYear]);
  assert.equal(updated.budgetStatus, 'Unbudgeted');
  assert.equal(updated.finalBudgetPoolId, null, 'the invalid budgetPoolId must not take effect');
  assert.equal(updated.mappingWarning, 'blocked-cross-year-override');
});

test('Phase 7A-7: after assignment, BvA total stays the same but the bucket allocation moves from Unbudgeted to Mapped', () => {
  const context = createBvaContext();
  const pool = context.createBudgetPoolRecord({ id:'assign-total-pool', project:'AOA-MP', name:'Total Pool', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = context.createActualSpendRecord({
    id:'actual-spend-memo-ASSIGN-TOTAL-1', source:'Approved Memo', referenceNo:'ASSIGN-TOTAL-1', memoId:'ASSIGN-TOTAL-1',
    project:'AOA-MP', spendType:'Software', amount:6000, startDate:'2026-04', endDate:'2026-04', budgetStatus:'Unbudgeted',
  });
  context.storeActualSpendRecords([record]);

  const before = context.calculateBudgetVsActualDataset([pool], context.loadActualSpendRecords(), { year:'2569', project:'AOA-MP' });
  assert.equal(before.totals.actual, 6000);
  assert.equal(before.totals.unbudgetedActual, 6000);
  assert.equal(before.totals.mappedActual, 0);

  context.updateActualSpendBudgetOverride('ASSIGN-TOTAL-1', 'assign-total-pool', [pool]);

  const after = context.calculateBudgetVsActualDataset([pool], context.loadActualSpendRecords(), { year:'2569', project:'AOA-MP' });
  assert.equal(after.totals.actual, 6000, 'the grand total must not change from assignment alone');
  assert.equal(after.totals.unbudgetedActual, 0);
  assert.equal(after.totals.mappedActual, 6000);
});

test('Phase 7A-7: Forecast remains unchanged by a Budget Assignment', () => {
  const context = createBvaContext();
  const pool = context.createBudgetPoolRecord({ id:'assign-forecast-pool', project:'AOA-MP', name:'FC Pool', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = context.createActualSpendRecord({
    id:'actual-spend-memo-ASSIGN-FC-1', source:'Approved Memo', referenceNo:'ASSIGN-FC-1', memoId:'ASSIGN-FC-1',
    project:'AOA-MP', spendType:'Software', amount:12000, startDate:'2026-01', endDate:'2026-12', budgetStatus:'Unbudgeted',
  });
  context.storeActualSpendRecords([record]);

  const forecastBefore = context.calculateForecast(context.loadActualSpendRecords(), new Date(2026, 6, 15));
  context.updateActualSpendBudgetOverride('ASSIGN-FC-1', 'assign-forecast-pool', [pool]);
  const forecastAfter = context.calculateForecast(context.loadActualSpendRecords(), new Date(2026, 6, 15));

  assert.deepEqual(JSON.parse(JSON.stringify(forecastBefore)), JSON.parse(JSON.stringify(forecastAfter)));
});

test('Phase 7A-7: Export totals remain unchanged (still equal the dataset total) after a Budget Assignment', () => {
  const context = createBvaContext();
  const pool = context.createBudgetPoolRecord({ id:'assign-export-pool', project:'AOA-MP', name:'Export Pool', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = context.createActualSpendRecord({
    id:'actual-spend-memo-ASSIGN-EXP-1', source:'Approved Memo', referenceNo:'ASSIGN-EXP-1', memoId:'ASSIGN-EXP-1',
    project:'AOA-MP', spendType:'Software', amount:7000, startDate:'2026-04', endDate:'2026-04', budgetStatus:'Unbudgeted',
  });
  context.storeActualSpendRecords([record]);

  const before = context.calculateBudgetVsActualDataset([pool], context.loadActualSpendRecords(), { year:'2569', project:'AOA-MP' });
  const exportedBefore = context.budgetVsActualExportDataset(before);
  assert.equal(exportedBefore.totals.actual, 7000);

  context.updateActualSpendBudgetOverride('ASSIGN-EXP-1', 'assign-export-pool', [pool]);

  const after = context.calculateBudgetVsActualDataset([pool], context.loadActualSpendRecords(), { year:'2569', project:'AOA-MP' });
  const exportedAfter = context.budgetVsActualExportDataset(after);
  assert.equal(exportedAfter.totals.actual, 7000, 'export total must remain the same after assignment, only the bucket changes');
  assert.equal(exportedAfter.totals.actual, exportedBefore.totals.actual);
});

test('Phase 7A-5v2: BvA "all" drill-down includes Mapped, Unbudgeted, and Needs PMO Review as one row per record, and its total equals the KPI and export totals', () => {
  const context = createBvaContext();
  const pools = seedBvaScenario(context);
  const dataset = context.calculateBudgetVsActualDataset(pools, context.loadActualSpendRecords(), { year:'2569' });
  const expectedTotal = context.money(Math.round(dataset.totals.actual));

  const kpiHtml = context.__elements.get('bva-content').innerHTML;
  assert.ok(kpiHtml.includes(expectedTotal), 'KPI Actual total must equal Mapped + Unbudgeted + Needs PMO Review');

  context.showBvaActualSpend('all');
  const html = context.__lastPanel.innerHTML;
  assert.match(html, /table-layout:fixed/, 'records render one per row in a single-line table, not a card');
  ['MEMO-UI-1','MAN-UI-1','INFRA-UI-1'].forEach(ref => assert.match(html, new RegExp(ref)));
  assert.equal((html.match(/class="badge /g) || []).length, 3, 'each record renders as exactly one row, never duplicated');
  assert.ok(html.includes(expectedTotal), 'drill-down total must equal the KPI Actual total');

  const exported = context.budgetVsActualExportDataset(dataset);
  assert.equal(exported.totals.actual, dataset.totals.actual, 'export total must equal the drill-down/KPI total');

  // Approved Memo rows are clickable through to the existing read-only Memo viewer...
  assert.match(html, /onclick="typeof openMemoReadOnly==='function'&&openMemoReadOnly\('MEMO-UI-1'\)"/);
  // ...but Manual/Historical and Infra Cost rows (no backing Memo) are not.
  assert.doesNotMatch(html, /openMemoReadOnly\('MAN-UI-1'\)/);
  assert.doesNotMatch(html, /openMemoReadOnly\('INFRA-UI-1'\)/);
});

test('Phase 7A-5v2: Budget Pool row drill-down shows one row per item, single line, without horizontal scroll', () => {
  const context = createBvaContext();
  seedBvaScenario(context);

  context.showBvaActualSpend('bva-ui-pool');
  const html = context.__lastPanel.innerHTML;
  assert.match(html, /MEMO-UI-1/);
  assert.match(html, /table-layout:fixed/);
  assert.match(html, /overflow-x:hidden/);
  assert.doesNotMatch(html, /MAN-UI-1|INFRA-UI-1/, 'a pool drill-down must only show that pool\'s own records');
});

test('Phase 7A-5: Actual Spend source badges are distinct per source type', () => {
  const context = createActualSpendContext();
  assert.equal(context.actualSpendSourceBadgeClass('Approved Memo'), 'badge-blue');
  assert.equal(context.actualSpendSourceBadgeClass('Manual / Historical Expense'), 'badge-amber');
  assert.equal(context.actualSpendSourceBadgeClass('Infra Cost'), 'badge-green');
  assert.equal(context.actualSpendSourceShortLabel('Approved Memo'), 'Memo');
  assert.equal(context.actualSpendSourceShortLabel('Manual / Historical Expense'), 'Historical');
  assert.equal(context.actualSpendSourceShortLabel('Infra Cost'), 'Infra');
});

test('Phase 7A-5: Actual Spend page Source column uses a distinct badge class per source, not one hardcoded colour', () => {
  const renderer = budgetCode.match(/async function renderActualSpend[\s\S]*?function showActualSpendGroup/)[0];
  assert.match(renderer, /actualSpendSourceBadgeClass\(group\.source\)/);
  assert.doesNotMatch(renderer, /background:var\(--blue-50\);color:var\(--blue\)"[^>]*>\$\{sourceLabel/);
});

test('Phase 7A-5: Actual Spend detail renders every canonical field under the new layout, with no data loss', () => {
  const context = createActualSpendContext();
  context.document.createElement = () => ({ style:{}, innerHTML:'', id:'', addEventListener() {}, remove() {} });
  context.document.body = { appendChild(el) { context.__lastPanel = el; } };
  context.document.getElementById = () => null;

  context.storeBudgetPools([context.createBudgetPoolRecord({
    id:'detail-pool', project:'AOA-MP', name:'Detail Pool', budget:5000,
    startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'],
  })]);
  context.storeActualSpendRecords([context.createActualSpendRecord({
    id:'detail-full', source:'Approved Memo', referenceNo:'DETAIL-1', memoId:'DETAIL-1', project:'AOA-MP',
    spendType:'Software', amount:4200, startDate:'2026-02', endDate:'2026-02', vendorProgram:'Adobe CC',
    description:'Adobe renewal', notes:'Paid via PO', finalBudgetPoolId:'detail-pool', budgetStatus:'Mapped',
    createdBy:'PMO User',
  })]);

  context.showActualSpendRecord('detail-full');
  const html = context.__lastPanel.innerHTML;

  ['DETAIL-1','Adobe renewal','Software','Adobe CC','Detail Pool','Mapped','AOA-MP','PMO User','Paid via PO']
    .forEach(text => assert.ok(html.includes(text), `expected rendered detail to include "${text}"`));
  assert.ok(html.includes(context.money(4200)), 'Amount must still be shown');
  assert.match(html, /badge-blue/, 'Approved Memo source should render as a distinct badge');
  assert.match(html, /badge-green/, 'Mapped budget status should render as a distinct badge');
  assert.doesNotMatch(html, /<table/);
});
