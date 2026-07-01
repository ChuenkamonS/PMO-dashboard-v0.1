const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appCode = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');

function context() {
  const storage = new Map();
  const ctx = {
    console, Date, Intl, URL, Blob, AbortController,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    fetch: async () => ({ ok:true, text:async () => '[]', blob:async () => new Blob() }),
    alert: () => {}, confirm: () => true,
    localStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style:{}, click() {}, remove() {}, appendChild() {} }),
      body: { appendChild() {}, removeChild() {}, classList:{ add() {}, remove() {} } },
    },
    location: { reload() {} },
  };
  vm.createContext(ctx);
  vm.runInContext(appCode, ctx, { filename:'app.js' });
  return ctx;
}

const base = {
  source: 'Approved Memo', referenceNo: 'ORB-001', project: 'AOA-MP',
  spendType: 'Software', amount: 3000, startDate: '2026-01-10', endDate: '2026-03-05',
};

test('shared spend type master maps memo types', () => {
  const ctx = context();
  assert.equal(ctx.spendTypeFromMemoType('SL'), 'Software');
  assert.equal(ctx.spendTypeFromMemoType('dep'), 'Deployment');
});

test('coverage months are inclusive and THB is the default', () => {
  const ctx = context();
  const record = ctx.createActualSpendRecord(base);
  assert.match(record.id, /^actual-spend-/);
  assert.equal(record.coverageMonths, 3);
  assert.equal(record.coverageStatus, 'Complete');
  assert.equal(record.currency, 'THB');
});

test('strict calendar validation rejects impossible dates', () => {
  const ctx = context();
  assert.equal(ctx.parseStrictCalendarValue('2026-02-30'), null);
  assert.equal(ctx.inclusiveCoverageMonths('2026-02-30', '2026-03-01'), null);
  assert.equal(ctx.validateActualSpendRecord({ ...base, startDate:'2026-02-30' }).valid, false);
});

test('missing coverage remains valid without monthly allocation', () => {
  const ctx = context();
  const result = ctx.validateActualSpendRecord({ ...base, endDate:null });
  assert.equal(result.valid, true);
  assert.equal(result.record.coverageMonths, null);
  assert.equal(result.record.coverageStatus, 'Missing Coverage');
});

test('duplicate key uses the seven specified fields', () => {
  const ctx = context();
  const changedDescription = { ...base, description:'ignored by duplicate check' };
  assert.equal(ctx.actualSpendDuplicateKey(base), ctx.actualSpendDuplicateKey(changedDescription));
  assert.notEqual(ctx.actualSpendDuplicateKey(base), ctx.actualSpendDuplicateKey({ ...base, amount:3001 }));
});

test('invalid import is all-or-nothing and does not save', () => {
  const ctx = context();
  const result = ctx.importActualSpendRecords([base, { ...base, referenceNo:'ORB-002', amount:0 }]);
  assert.equal(result.valid, false);
  assert.equal(result.saved, 0);
  assert.equal(ctx.loadActualSpendRecords().length, 0);
});

test('duplicate import rows are skipped and reported', () => {
  const ctx = context();
  const result = ctx.importActualSpendRecords([base, { ...base }]);
  assert.equal(result.valid, true);
  assert.equal(result.saved, 1);
  assert.equal(result.duplicates.length, 1);
  assert.equal(ctx.loadActualSpendRecords().length, 1);
});

test('budget pool stores budget and multiple spend types only', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', budget:100000,
    spendTypes:['Software', 'Infra', 'Invalid'], startDate:'2026-01', endDate:'2026-12',
  });
  assert.deepEqual(Array.from(pool.spendTypes), ['Software', 'Infra']);
  assert.equal(pool.currency, 'THB');
  assert.equal('actualSpend' in pool, false);
});

test('budget pool storage reuses the existing key and accepts legacy memo types', () => {
  const ctx = context();
  ctx.storeBudgetPoolRecords([{
    id:'pool-1', project:'AOA-MP', budget:100000, memoTypes:['sl','infra'],
    startMonth:'2026-01', endMonth:'2026-12',
  }]);
  const [pool] = ctx.loadBudgetPoolRecords();
  assert.deepEqual(Array.from(pool.spendTypes), ['Software', 'Infra']);
  assert.deepEqual(Array.from(pool.memoTypes), ['sl', 'infra']);
});

test('legacy empty memoTypes remains compatible with all Spend Types', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'legacy-pool', project:'AOA-MP', budget:100000, memoTypes:[],
    startMonth:'2026-01', endMonth:'2026-12',
  });
  assert.equal(pool.spendTypes.length, 7);
  assert.equal(ctx.validateBudgetPoolRecord(pool).valid, true);
});

test('spendTypes-only pools keep legacy memoTypes synchronized', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', budget:100000,
    spendTypes:['Software', 'Deployment'], startDate:'2026-01', endDate:'2026-12',
  });
  assert.deepEqual(Array.from(pool.memoTypes), ['sl', 'dep']);
});

test('budget pool validation enforces required fields and valid range', () => {
  const ctx = context();
  const valid = ctx.validateBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', budget:1, spendTypes:['Software'],
    startDate:'2026-01-01', endDate:'2026-12-31',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.record.currency, 'THB');
  const invalid = ctx.validateBudgetPoolRecord({
    id:'', project:'', budget:0, spendTypes:[], startDate:'2026-02-30', endDate:'2026-01-01',
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length >= 5);
});

test('Phase 7 Budget Pool CRUD validation rejects invalid and duplicate pools and reports overlap conflicts', () => {
  const ctx = context();
  const existing = [ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', name:'Software 2569', year:'2569', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  })];
  const invalid = ctx.validateBudgetPoolChange({
    id:'pool-2', project:'', name:'', year:'', budget:-1, spendTypes:[], startDate:'2026-12', endDate:'2026-01',
  }, existing);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.includes('Pool Name is required'));
  assert.ok(invalid.errors.includes('Year is required'));

  const duplicate = ctx.validateBudgetPoolChange({ ...existing[0], id:'pool-2' }, existing);
  assert.equal(duplicate.valid, false);
  assert.ok(duplicate.errors.some(error => error.includes('Duplicate Budget Pool')));

  const conflict = ctx.validateBudgetPoolChange({
    id:'pool-2', project:'AOA-MP', name:'Software H2', year:'2569', budget:5000,
    spendTypes:['Software'], startDate:'2026-07', endDate:'2026-12',
  }, existing);
  assert.equal(conflict.valid, true);
  assert.deepEqual(Array.from(conflict.conflicts, pool => pool.id), ['pool-1']);
});

test('Phase 7 Budget Pool changes re-map Unbudgeted spend and safely block referenced deletion', () => {
  const ctx = context();
  const record = ctx.createActualSpendRecord(base);
  assert.equal(ctx.mapActualSpendRecords([record], [])[0].budgetStatus, 'Unbudgeted');
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', name:'Software', year:'2569', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  });
  const mapped = ctx.mapActualSpendRecords([record], [pool]);
  assert.equal(mapped[0].finalBudgetPoolId, 'pool-1');
  assert.equal(mapped[0].budgetStatus, 'Mapped');
  assert.deepEqual(Array.from(ctx.budgetPoolDeletionBlockers('pool-1', mapped), item => item.id), [mapped[0].id]);
  assert.equal(ctx.budgetPoolDeletionBlockers('unused', mapped).length, 0);
});

test('Phase 7 Budget Pool create and edit immediately recalculate BvA totals from the canonical dataset', () => {
  const ctx = context();
  const spend = ctx.createActualSpendRecord({ ...base, amount:2500, finalBudgetPoolId:'pool-1', budgetStatus:'Mapped' });
  const created = ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', name:'Software', year:'2569', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  });
  const before = ctx.calculateBudgetVsActualDataset([created], [spend], { year:'2569' });
  const edited = ctx.createBudgetPoolRecord({ ...created, budget:12000 });
  const after = ctx.calculateBudgetVsActualDataset([edited], [spend], { year:'2569' });
  assert.deepEqual(JSON.parse(JSON.stringify(before.totals)), {
    budget:10000, actual:2500, mappedActual:2500, unbudgetedActual:0, remaining:7500, utilizationPercent:25,
  });
  assert.equal(after.totals.remaining, 9500);
  assert.equal(after.totals.utilizationPercent, 2500 / 12000 * 100);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.budgetVsActualExportDataset(after).totals)), JSON.parse(JSON.stringify(after.totals)));
});

test('storage rejects unvalidated records', () => {
  const ctx = context();
  assert.throws(() => ctx.storeActualSpendRecords([{ ...base, amount:0 }]), /Amount/);
  assert.throws(() => ctx.storeBudgetPoolRecords([{ id:'pool-1' }]), /Project/);
});

test('shared query helpers filter records and preserve manual override priority', () => {
  const ctx = context();
  const spends = [
    ctx.createActualSpendRecord({ ...base, project:'AOA-MP', spendType:'Software' }),
    ctx.createActualSpendRecord({ ...base, referenceNo:'ORB-002', project:'TTB', spendType:'Hardware' }),
  ];
  const pools = [
    ctx.createBudgetPoolRecord({ id:'p1', project:'AOA-MP', budget:1, spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12' }),
    ctx.createBudgetPoolRecord({ id:'p2', project:'TTB', budget:1, spendTypes:['Hardware'], startDate:'2026-01', endDate:'2026-12' }),
  ];
  assert.equal(ctx.queryActualSpend({ spendType:'Hardware' }, spends).length, 1);
  assert.equal(ctx.getActualSpendByProject('AOA-MP', spends).length, 1);
  assert.equal(ctx.queryBudgetPools({ spendType:'Software' }, pools).length, 1);
  assert.equal(ctx.getBudgetPoolsByProject('TTB', pools).length, 1);
  assert.equal(ctx.getFinalBudgetPoolId({ autoBudgetPoolId:'auto', manualBudgetPoolId:'manual' }), 'manual');
  assert.equal(vm.runInContext('FINANCIAL_HELPERS.queryActualSpend === queryActualSpend', ctx), true);
});

test('budget mapping applies manual override before auto mapping', () => {
  const ctx = context();
  const record = ctx.createActualSpendRecord({ ...base, manualBudgetPoolId:'manual-pool' });
  const pools = [ctx.createBudgetPoolRecord({
    id:'auto-pool', project:'AOA-MP', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  })];
  const mapped = ctx.mapBudgetPool(record, pools);
  assert.equal(mapped.finalBudgetPoolId, 'manual-pool');
  assert.equal(mapped.budgetStatus, 'Manual Override');
});

test('budget mapping auto maps one match and leaves no match unbudgeted', () => {
  const ctx = context();
  const record = ctx.createActualSpendRecord(base);
  const pools = [ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  })];
  const mapped = ctx.mapBudgetPool(record, pools);
  assert.equal(mapped.autoBudgetPoolId, 'pool-1');
  assert.equal(mapped.finalBudgetPoolId, 'pool-1');
  assert.equal(mapped.budgetStatus, 'Mapped');
  assert.equal(ctx.mapBudgetPool({ ...record, project:'TTB' }, pools).budgetStatus, 'Unbudgeted');
});

test('multiple matching pools require PMO review and are not selected', () => {
  const ctx = context();
  const record = ctx.createActualSpendRecord(base);
  const pools = ['pool-1','pool-2'].map(id => ctx.createBudgetPoolRecord({
    id, project:'AOA-MP', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  }));
  const mapped = ctx.mapBudgetPool(record, pools);
  assert.equal(mapped.finalBudgetPoolId, null);
  assert.equal(mapped.budgetStatus, 'Needs PMO Review');
});

test('shared calculation engine totals spend and budget utilization', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  });
  const records = [
    ctx.createActualSpendRecord({ ...base, amount:2000, finalBudgetPoolId:'pool-1' }),
    ctx.createActualSpendRecord({ ...base, referenceNo:'ORB-002', amount:500, finalBudgetPoolId:'other-pool' }),
  ];
  assert.equal(ctx.calculateActualSpend(records), 2500);
  assert.deepEqual(
    JSON.parse(JSON.stringify(ctx.calculateBudgetUtilization(pool, records))),
    { budget:10000, actual:2000, remaining:8000, utilizationPercent:20 },
  );
});

test('Phase 6 Budget vs Actual uses one canonical dataset for KPI, rows, drill-down, and export', () => {
  const ctx = context();
  const pools = [ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', name:'Software 2569', year:'2569', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  })];
  const records = [
    ctx.createActualSpendRecord({ ...base, id:'mapped-1', amount:2500, finalBudgetPoolId:'pool-1', budgetStatus:'Mapped' }),
    ctx.createActualSpendRecord({ ...base, id:'unbudgeted-1', referenceNo:'HW-1', spendType:'Hardware', amount:500, budgetStatus:'Unbudgeted' }),
    ctx.createActualSpendRecord({ ...base, id:'same-id-other-project', referenceNo:'TTB-1', project:'TTB', amount:900, finalBudgetPoolId:'pool-1', budgetStatus:'Mapped' }),
  ];
  const dataset = ctx.calculateBudgetVsActualDataset(pools, records, { year:'2569', project:'AOA-MP' });
  const drillDownTotal = ctx.calculateActualSpend([
    ...dataset.rows.flatMap(row => row.records), ...dataset.unbudgetedRecords,
  ]);
  assert.equal(dataset.rows[0].actual, 2500);
  assert.deepEqual(Array.from(dataset.rows[0].records, record => record.id), ['mapped-1']);
  assert.equal(dataset.rows[0].utilizationPercent, ctx.calculateBudgetUtilization(pools[0], records).utilizationPercent);
  assert.equal(dataset.totals.actual, 3000);
  assert.equal(dataset.totals.remaining, dataset.totals.budget - dataset.totals.actual);
  assert.equal(drillDownTotal, dataset.totals.actual);

  const exported = ctx.budgetVsActualExportDataset(dataset);
  assert.equal(exported.totals.actual, dataset.totals.actual);
  assert.equal(exported.rows.reduce((sum, row) => sum + Number(row[6]), 0), dataset.totals.actual);
});

test('Phase 6 Unbudgeted includes only Actual Spend with no matched budget', () => {
  const ctx = context();
  const records = [
    ctx.createActualSpendRecord({ ...base, id:'none', amount:700, budgetStatus:'Unbudgeted' }),
    ctx.createActualSpendRecord({ ...base, id:'review', referenceNo:'R-1', amount:800, budgetStatus:'Needs PMO Review' }),
    ctx.createActualSpendRecord({ ...base, id:'mapped', referenceNo:'M-1', amount:900, finalBudgetPoolId:'pool-1', budgetStatus:'Mapped' }),
  ];
  const dataset = ctx.calculateBudgetVsActualDataset([], records, { year:'2569' });
  assert.deepEqual(Array.from(dataset.unbudgetedRecords, record => record.id), ['none']);
  assert.equal(dataset.totals.unbudgetedActual, 700);
});

// ── Phase 7A-2: fail-first regression coverage for the BvA year silent-drop bug ──
// Bug: Budget Pool `year` is an independent label (see docs/BvA_REQUIREMENT.md "Phase 7A-1" §2)
// and is never derived from / reconciled against the pool's own startMonth/endMonth. When a
// pool's year label disagrees with its date range, `calculateBudgetVsActualDataset()` filters
// `selectedPools` by `pool.year` and `scopedRecords` by the record's own date-derived year
// independently — so a validly-mapped Actual Spend record can fail both filters at once and
// vanish from `totals.actual` without appearing in either a matched pool row or
// `unbudgetedRecords`. These tests must fail against the current implementation and are
// expected to start passing once Phase 7A-3 reconciles pool year with its date range (or
// otherwise closes this gap). Do not fix the underlying logic in this phase.

test('Phase 7A-2 (fail-first): BvA must not silently drop a mapped Actual Spend record when filtered by the pool\'s own year label, even though the pool\'s date range disagrees', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-mismatch-year', project:'AOA-MP', name:'Software Pool', budget:100000,
    year:'2569', startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'],
  });
  const record = ctx.createActualSpendRecord({
    id:'as-mismatch-1', source:'Approved Memo', referenceNo:'MISMATCH-1', project:'AOA-MP',
    spendType:'Software', amount:12000, startDate:'2025-06', endDate:'2025-06',
  });
  const mapped = ctx.mapActualSpendRecords([record], [pool]);
  // Sanity: the record genuinely auto-maps to this pool before BvA filtering is applied.
  assert.equal(mapped[0].finalBudgetPoolId, 'pool-mismatch-year');
  assert.equal(mapped[0].budgetStatus, 'Mapped');

  const dataset = ctx.calculateBudgetVsActualDataset([pool], mapped, { year:'2569', project:'AOA-MP' });
  const visibleIds = new Set([
    ...dataset.rows.flatMap(row => Array.from(row.records, r => r.id)),
    ...Array.from(dataset.unbudgetedRecords, r => r.id),
  ]);
  assert.ok(visibleIds.has(mapped[0].id), 'the mapped record must appear under its pool or in an unbudgeted/review bucket, not vanish entirely');
  assert.equal(dataset.totals.actual, 12000, 'total actual must still account for the mapped record\'s amount');
});

test('Phase 7A-2 (fail-first): BvA must not silently drop a mapped Actual Spend record when filtered by the record\'s date-derived year, even though the pool\'s year label disagrees', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-mismatch-year', project:'AOA-MP', name:'Software Pool', budget:100000,
    year:'2569', startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'],
  });
  const record = ctx.createActualSpendRecord({
    id:'as-mismatch-1', source:'Approved Memo', referenceNo:'MISMATCH-1', project:'AOA-MP',
    spendType:'Software', amount:12000, startDate:'2025-06', endDate:'2025-06',
  });
  const mapped = ctx.mapActualSpendRecords([record], [pool]);

  // 2025-06 is the Gregorian year that Buddhist Era 2568 converts to — this is the year an
  // operator filtering "by the record's own date" would reasonably select.
  const dataset = ctx.calculateBudgetVsActualDataset([pool], mapped, { year:'2568', project:'AOA-MP' });
  const visibleIds = new Set([
    ...dataset.rows.flatMap(row => Array.from(row.records, r => r.id)),
    ...Array.from(dataset.unbudgetedRecords, r => r.id),
  ]);
  assert.ok(visibleIds.has(mapped[0].id), 'the mapped record must appear under its pool or in an unbudgeted/review bucket, not vanish entirely');
  assert.equal(dataset.totals.actual, 12000, 'total actual must still account for the mapped record\'s amount');
});

test('Phase 7A-2 control: BvA includes actual spend normally when pool.year agrees with its startMonth/endMonth', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-control-year', project:'AOA-MP', name:'Software Pool Control', budget:100000,
    year:'2568', startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'],
  });
  const record = ctx.createActualSpendRecord({
    id:'as-control-1', source:'Approved Memo', referenceNo:'CONTROL-1', project:'AOA-MP',
    spendType:'Software', amount:12000, startDate:'2025-06', endDate:'2025-06',
  });
  const mapped = ctx.mapActualSpendRecords([record], [pool]);
  assert.equal(mapped[0].finalBudgetPoolId, 'pool-control-year');

  const dataset = ctx.calculateBudgetVsActualDataset([pool], mapped, { year:'2568', project:'AOA-MP' });
  assert.deepEqual(Array.from(dataset.rows[0].records, r => r.id), ['as-control-1']);
  assert.equal(dataset.totals.actual, 12000);
});

test('shared calculation engine allocates canonical Actual Spend across coverage months', () => {
  const ctx = context();
  const records = [ctx.createActualSpendRecord({
    ...base, amount:3000, startDate:'2026-01', endDate:'2026-03',
  })];
  assert.deepEqual(
    JSON.parse(JSON.stringify(ctx.actualSpendMonthlyAllocations(records[0]))),
    { '2026-01':1000, '2026-02':1000, '2026-03':1000 },
  );
  assert.equal(ctx.calculateActualSpendInRange(records, '2026-02', '2026-03'), 2000);
  assert.equal(ctx.calculateActualSpendInRange(records, '2026-02', '2026-03', { project:'TTB' }), 0);
});

test('forecast uses only Software and Infra with inclusive monthly allocation and a fixed rolling window', () => {
  const ctx = context();
  const records = [
    ctx.createActualSpendRecord({ ...base, amount:12000, startDate:'2026-01', endDate:'2026-12', vendorProgram:'Suite' }),
    ctx.createActualSpendRecord({ ...base, referenceNo:'INF-1', source:'Infra Cost', spendType:'Infra', amount:6000, startDate:'2026-04', endDate:'2026-09', vendorProgram:'Cloud' }),
    ctx.createActualSpendRecord({ ...base, referenceNo:'HW-1', spendType:'Hardware', amount:9000, startDate:'2026-01', endDate:'2026-12' }),
    ctx.createActualSpendRecord({ ...base, referenceNo:'NO-COVERAGE', amount:5000, startDate:null, endDate:null }),
  ];
  const forecast = ctx.calculateForecast(records, new Date(2026, 6, 15));
  assert.equal(forecast.months.length, 12);
  assert.equal(forecast.months[0].key, '2026-02');
  assert.equal(forecast.months[5].kind, 'actual');
  assert.equal(forecast.months[6].key, '2026-08');
  assert.equal(forecast.months[6].kind, 'forecast');
  assert.deepEqual(Array.from(new Set(forecast.rows.map(row => row.spendType))).sort(), ['Infra','Software']);
  assert.equal(forecast.rows.find(row => row.spendType === 'Software').values['2026-08'], 1000);
  assert.equal(forecast.rows.find(row => row.spendType === 'Infra').values['2026-08'], 1000);
  assert.equal(forecast.rows.some(row => row.program === 'NO-COVERAGE'), false);
});

test('forecast carries the latest coverage monthly cost into future months and export matches UI data', () => {
  const ctx = context();
  const record = ctx.createActualSpendRecord({
    ...base, source:'Infra Cost', spendType:'Infra', amount:24000,
    startDate:'2026-06', endDate:'2026-08', vendorProgram:'aws',
  });
  const forecast = ctx.calculateForecast([record], new Date(2026, 6, 15));
  const row = forecast.rows[0];
  assert.equal(row.values['2026-05'], 0);
  assert.equal(row.values['2026-06'], 8000);
  assert.equal(row.values['2026-07'], 8000);
  assert.equal(row.values['2026-08'], 8000);
  assert.equal(row.values['2026-09'], 8000);
  assert.equal(row.values['2027-01'], 8000);

  const exported = ctx.forecastExportDataset(forecast);
  assert.deepEqual(Array.from(exported.headers), [
    'Project','Program','Spend Type',
    ...forecast.months.map(month => `${month.key} ${month.kind}`),
    'Total',
  ]);
  assert.deepEqual(Array.from(exported.rows[0]), [
    row.project, row.program, row.spendType,
    ...forecast.months.map(month => row.values[month.key] || 0),
    row.total,
  ]);
});

test('canonical Software detail lines do not change Forecast, Forecast export, or BvA totals', () => {
  const ctx = context();
  const input = { ...base, amount:2550, startDate:'2026-01', endDate:'2026-12', vendorProgram:'Product A, Product B' };
  const parentOnly = ctx.createActualSpendRecord(input);
  const withDetails = ctx.createActualSpendRecord({ ...input, detailLines:[
    { program:'Product A', plan:'Business', quantity:2, unitCost:100, monthlyCost:200, coverageStart:'2026-01', coverageEnd:'2026-12', coverageMonths:12, lineAmount:2400 },
    { program:'Product B', plan:'Pro', quantity:1, unitCost:50, monthlyCost:50, coverageStart:'2026-01', coverageEnd:'2026-03', coverageMonths:3, lineAmount:150 },
  ] });

  const baselineForecast = ctx.calculateForecast([parentOnly], new Date(2026, 6, 15));
  const detailedForecast = ctx.calculateForecast([withDetails], new Date(2026, 6, 15));
  assert.deepEqual(JSON.parse(JSON.stringify(detailedForecast)), JSON.parse(JSON.stringify(baselineForecast)));
  assert.deepEqual(
    JSON.parse(JSON.stringify(ctx.forecastExportDataset(detailedForecast))),
    JSON.parse(JSON.stringify(ctx.forecastExportDataset(baselineForecast))),
  );
  assert.equal(ctx.calculateBudgetVsActualDataset([], [withDetails], { year:'2569' }).totals.actual, 2550);
  assert.equal(ctx.calculateActualSpend([withDetails]), 2550);
});

test('Infra Cost entered through Actual Spend remains canonical for BvA, Forecast, export, and Unbudgeted', () => {
  const ctx = context();
  const validation = ctx.validateActualSpendRecord({
    source:'Infra Cost', referenceNo:'INFRA-ACTUAL-1', project:'AOA-MP', spendType:'Infra',
    amount:12000, startDate:'2026-01', endDate:'2026-12', vendorProgram:'Cloud',
  });
  assert.equal(validation.valid, true);
  const record = validation.record;
  const bva = ctx.calculateBudgetVsActualDataset([], [record], { year:'2569' });
  assert.equal(bva.totals.actual, 12000);
  assert.equal(bva.totals.unbudgetedActual, 12000);
  assert.equal(bva.unbudgetedRecords[0].source, 'Infra Cost');
  assert.equal(ctx.budgetVsActualExportDataset(bva).totals.actual, 12000);
  const forecast = ctx.calculateForecast([record], new Date(2026, 6, 15));
  assert.equal(forecast.rows.length, 1);
  assert.equal(forecast.rows[0].spendType, 'Infra');
});

test('batch mapping re-evaluates unbudgeted records without replacing manual overrides', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-1', project:'AOA-MP', budget:10000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  });
  const records = [
    ctx.createActualSpendRecord(base),
    ctx.createActualSpendRecord({ ...base, referenceNo:'ORB-002', manualBudgetPoolId:'manual-pool' }),
  ];
  const mapped = ctx.mapActualSpendRecords(records, [pool]);
  assert.equal(mapped[0].finalBudgetPoolId, 'pool-1');
  assert.equal(mapped[1].finalBudgetPoolId, 'manual-pool');
});
