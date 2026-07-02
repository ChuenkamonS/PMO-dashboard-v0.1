const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appCode = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');
const historyCode = fs.readFileSync(path.resolve(__dirname, '..', 'views/history.js'), 'utf8');

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
  // No startDate/startMonth at all, so year cannot be derived and "Year is required" still
  // fires as its own distinct error (Phase 7A-3: year is otherwise always derived from dates).
  const invalid = ctx.validateBudgetPoolChange({
    id:'pool-2', project:'', name:'', year:'', budget:-1, spendTypes:[],
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
    budget:10000, actual:2500, mappedActual:2500, unbudgetedActual:0, needsReviewActual:0, remaining:7500, utilizationPercent:25,
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

// ── Phase 7A-3: Budget Pool / Actual Spend same-year mapping contract ──
// Locked business rules (see docs/BvA_REQUIREMENT.md and PHASE_PLAN.md "Phase 7A"):
// - Budget Pool year is derived from startDate/startMonth, never an independently settable label.
// - A Budget Pool must not span multiple Gregorian years.
// - Approved Memo and Infra Cost auto-map only to a same-year matching pool.
// - Manual Actual Spend never auto-maps at all; with no selected pool it is always Unbudgeted.
// - A Manual Override is honored only when the selected pool is same-year; a cross-year override
//   is blocked at the data layer, falls back to Unbudgeted, and is flagged via `mappingWarning`
//   so it is detected, not silently normalized.
// This supersedes the Phase 7A-2 fail-first tests: those constructed a mismatched pool by passing
// a conflicting `year` alongside `startMonth`/`endMonth` directly to `createBudgetPoolRecord()` —
// that specific construction is no longer possible now that `year` is always derived from dates
// when date data exists, so the bug they proved is fixed structurally rather than reproduced.

test('Phase 7A-3: createBudgetPoolRecord derives year from startMonth/startDate and ignores conflicting input.year', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-derive-1', project:'AOA-MP', name:'Software Pool', budget:100000,
    year:'2999', startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'],
  });
  assert.equal(pool.year, '2568', 'derived from startMonth 2025 (2025+543), ignoring the conflicting input.year');

  const noDateData = ctx.createBudgetPoolRecord({
    id:'pool-no-dates', project:'AOA-MP', name:'No Dates', budget:1, year:'2570', spendTypes:['Software'],
  });
  assert.equal(noDateData.year, '2570', 'falls back to input.year only when there is no date data to derive from at all');
});

test('Phase 7A-3: validateBudgetPoolRecord rejects a pool spanning multiple Gregorian years', () => {
  const ctx = context();
  const spanning = ctx.validateBudgetPoolRecord({
    id:'pool-span', project:'AOA-MP', budget:1000, spendTypes:['Software'],
    startDate:'2025-06', endDate:'2026-05',
  });
  assert.equal(spanning.valid, false);
  assert.ok(spanning.errors.includes('Budget Pool must not span multiple years'));

  const singleYear = ctx.validateBudgetPoolRecord({
    id:'pool-single', project:'AOA-MP', budget:1000, spendTypes:['Software'],
    startDate:'2025-01', endDate:'2025-12',
  });
  assert.equal(singleYear.valid, true);
});

test('Phase 7A-3: Manual Actual Spend without a selected Budget Pool remains Unbudgeted even when a matching pool exists', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-manual-nomatch', project:'AOA-MP', name:'Software Pool', budget:100000,
    startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'],
  });
  const record = ctx.createActualSpendRecord({
    id:'as-manual-1', source:'Manual / Historical Expense', referenceNo:'MAN-1', project:'AOA-MP',
    spendType:'Software', amount:5000, startDate:'2026-03-15', endDate:'2026-03-15',
  });
  const mapped = ctx.mapBudgetPool(record, [pool]);
  assert.equal(mapped.budgetStatus, 'Unbudgeted');
  assert.equal(mapped.finalBudgetPoolId, null);
  assert.equal(mapped.autoBudgetPoolId, null);
});

test('Phase 7A-3: Manual Actual Spend with a same-year selected Budget Pool becomes Manual Override', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-manual-sameyear', project:'AOA-MP', name:'Software Pool', budget:100000,
    startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'],
  });
  const record = ctx.createActualSpendRecord({
    id:'as-manual-2', source:'Manual / Historical Expense', referenceNo:'MAN-2', project:'AOA-MP',
    spendType:'Software', amount:5000, startDate:'2026-03-15', endDate:'2026-03-15',
    manualBudgetPoolId:'pool-manual-sameyear',
  });
  const mapped = ctx.mapBudgetPool(record, [pool]);
  assert.equal(mapped.budgetStatus, 'Manual Override');
  assert.equal(mapped.finalBudgetPoolId, 'pool-manual-sameyear');
});

test('Phase 7A-3: Manual Actual Spend with a cross-year selected Budget Pool is blocked and flagged, not silently normalized', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-A', project:'AOA-MP', name:'Pool A', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-B', project:'AOA-MP', name:'Pool B', budget:100000, startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({
    id:'as-manual-3', source:'Manual / Historical Expense', referenceNo:'MAN-3', project:'AOA-MP',
    spendType:'Software', amount:5000, startDate:'2026-03-15', endDate:'2026-03-15',
    manualBudgetPoolId:'pool-B',
  });
  const mapped = ctx.mapBudgetPool(record, [poolA, poolB]);
  assert.equal(mapped.budgetStatus, 'Unbudgeted');
  assert.equal(mapped.manualBudgetPoolId, null);
  assert.equal(mapped.finalBudgetPoolId, null);
  assert.equal(mapped.autoBudgetPoolId, null);
  assert.equal(mapped.mappingWarning, 'blocked-cross-year-override');
  assert.equal(ctx.getFinalBudgetPoolId(mapped), null);
});

test('Phase 7A-3: Manual Actual Spend with a same-year but cross-project selected Budget Pool is blocked and flagged, not silently normalized', () => {
  const ctx = context();
  const otherProjectPool = ctx.createBudgetPoolRecord({ id:'pool-otherproj', project:'OTHER-PRJ', name:'Pool Other', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({
    id:'as-manual-5', source:'Manual / Historical Expense', referenceNo:'MAN-5', project:'AOA-MP',
    spendType:'Software', amount:5000, startDate:'2026-03-15', endDate:'2026-03-15',
    manualBudgetPoolId:'pool-otherproj',
  });
  const mapped = ctx.mapBudgetPool(record, [otherProjectPool]);
  assert.equal(mapped.budgetStatus, 'Unbudgeted', 'a same-year pool from a different project must still be blocked');
  assert.equal(mapped.manualBudgetPoolId, null);
  assert.equal(mapped.finalBudgetPoolId, null);
  assert.equal(mapped.autoBudgetPoolId, null);
  assert.equal(mapped.mappingWarning, 'blocked-cross-project-override');
  assert.equal(ctx.getFinalBudgetPoolId(mapped), null);
});

test('Phase 7A-3: blocked cross-project override appears as Unbudgeted in BvA totals, not silently missing', () => {
  const ctx = context();
  const poolAOA = ctx.createBudgetPoolRecord({ id:'pool-aoa-1', project:'AOA-MP', name:'Pool AOA', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolOther = ctx.createBudgetPoolRecord({ id:'pool-other-1', project:'OTHER-PRJ', name:'Pool Other', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({
    id:'as-manual-6', source:'Manual / Historical Expense', referenceNo:'MAN-6', project:'AOA-MP',
    spendType:'Software', amount:8000, startDate:'2026-03-15', endDate:'2026-03-15',
    manualBudgetPoolId:'pool-other-1',
  });
  const mapped = ctx.mapBudgetPool(record, [poolAOA, poolOther]);
  const dataset = ctx.calculateBudgetVsActualDataset([poolAOA, poolOther], [mapped], { year:'2569', project:'AOA-MP' });
  assert.equal(dataset.unbudgetedRecords.length, 1);
  assert.equal(dataset.unbudgetedRecords[0].mappingWarning, 'blocked-cross-project-override');
  assert.equal(dataset.totals.actual, 8000, 'blocked cross-project override amount must still be visible in BvA totals, never silently missing');
});

test('Phase 7A-3 control: existing same-project/same-year Manual Override still works', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-manual-control', project:'AOA-MP', name:'Software Pool', budget:100000,
    startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'],
  });
  const record = ctx.createActualSpendRecord({
    id:'as-manual-control-1', source:'Manual / Historical Expense', referenceNo:'MAN-CONTROL-1', project:'AOA-MP',
    spendType:'Software', amount:5000, startDate:'2026-03-15', endDate:'2026-03-15',
    manualBudgetPoolId:'pool-manual-control',
  });
  const mapped = ctx.mapBudgetPool(record, [pool]);
  assert.equal(mapped.budgetStatus, 'Manual Override');
  assert.equal(mapped.finalBudgetPoolId, 'pool-manual-control');
  assert.equal(mapped.mappingWarning, null);
});

test('Phase 7A-3: Approved Memo-created Actual Spend still auto-maps to a same-year matching pool', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-memo-sameyear', project:'AOA-MP', budget:10000, spendTypes:['Software'], startMonth:'2026-01', endMonth:'2026-12' });
  const record = ctx.createActualSpendRecord(base); // source: 'Approved Memo', 2026 dates
  const mapped = ctx.mapBudgetPool(record, [pool]);
  assert.equal(mapped.budgetStatus, 'Mapped');
  assert.equal(mapped.autoBudgetPoolId, 'pool-memo-sameyear');
});

test('Phase 7A-3: Infra Cost still auto-maps to a same-year matching pool', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-infra-sameyear', project:'AOA-MP', budget:10000, spendTypes:['Infra'], startMonth:'2026-01', endMonth:'2026-12' });
  const record = ctx.createActualSpendRecord({
    id:'as-infra-1', source:'Infra Cost', referenceNo:'INF-1', project:'AOA-MP',
    spendType:'Infra', amount:6000, startDate:'2026-04', endDate:'2026-09',
  });
  const mapped = ctx.mapBudgetPool(record, [pool]);
  assert.equal(mapped.budgetStatus, 'Mapped');
  assert.equal(mapped.autoBudgetPoolId, 'pool-infra-sameyear');
});

test('Phase 7A-3: Approved Memo-created Actual Spend does not auto-map to a pool from a different year', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-memo-diffyear', project:'AOA-MP', budget:10000, spendTypes:['Software'], startMonth:'2025-01', endMonth:'2025-12' });
  const record = ctx.createActualSpendRecord(base); // 2026 dates
  const mapped = ctx.mapBudgetPool(record, [pool]);
  assert.equal(mapped.budgetStatus, 'Unbudgeted');
  assert.equal(mapped.finalBudgetPoolId, null);
});

test('Phase 7A-3: Infra Cost does not auto-map to a pool from a different year', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-infra-diffyear', project:'AOA-MP', budget:10000, spendTypes:['Infra'], startMonth:'2025-01', endMonth:'2025-12' });
  const record = ctx.createActualSpendRecord({
    id:'as-infra-2', source:'Infra Cost', referenceNo:'INF-2', project:'AOA-MP',
    spendType:'Infra', amount:6000, startDate:'2026-04', endDate:'2026-09',
  });
  const mapped = ctx.mapBudgetPool(record, [pool]);
  assert.equal(mapped.budgetStatus, 'Unbudgeted');
  assert.equal(mapped.finalBudgetPoolId, null);
});

test('Phase 7A-3: a legacy pool whose stored year conflicts with its own dates must not silently auto-match; the record remains visible as Unbudgeted', () => {
  const ctx = context();
  // Simulate data that predates the year-derivation fix: bypass createBudgetPoolRecord's
  // derivation by overwriting `year` on an already-constructed, otherwise well-formed pool.
  const legacyMismatchedPool = { ...ctx.createBudgetPoolRecord({
    id:'pool-legacy-mismatch', project:'AOA-MP', name:'Legacy Pool', budget:100000,
    startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'],
  }), year:'2569' }; // wrong label; real dates are still 2025 (BE 2568)
  const record = ctx.createActualSpendRecord({
    id:'as-legacy-1', source:'Approved Memo', referenceNo:'LEGACY-1', project:'AOA-MP',
    spendType:'Software', amount:7000, startDate:'2025-07', endDate:'2025-07',
  });
  const mapped = ctx.mapBudgetPool(record, [legacyMismatchedPool]);
  assert.equal(mapped.budgetStatus, 'Unbudgeted', 'auto-match must refuse a pool whose label disagrees with the record\'s derived year');
  assert.equal(mapped.finalBudgetPoolId, null);

  const dataset = ctx.calculateBudgetVsActualDataset([legacyMismatchedPool], [mapped], { year:'2568', project:'AOA-MP' });
  assert.deepEqual(Array.from(dataset.unbudgetedRecords, r => r.id), ['as-legacy-1'], 'the record must remain visible in Unbudgeted, not vanish');
  assert.equal(dataset.totals.actual, 7000);
});

test('Phase 7A-3: BvA totals include Unbudgeted records (including blocked cross-year overrides) and never silently drop them', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-A2', project:'AOA-MP', name:'Pool A', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-B2', project:'AOA-MP', name:'Pool B', budget:100000, startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({
    id:'as-manual-4', source:'Manual / Historical Expense', referenceNo:'MAN-4', project:'AOA-MP',
    spendType:'Software', amount:5000, startDate:'2026-03-15', endDate:'2026-03-15',
    manualBudgetPoolId:'pool-B2',
  });
  const mapped = ctx.mapBudgetPool(record, [poolA, poolB]);
  const dataset = ctx.calculateBudgetVsActualDataset([poolA, poolB], [mapped], { year:'2569', project:'AOA-MP' });
  assert.equal(dataset.unbudgetedRecords.length, 1);
  assert.equal(dataset.unbudgetedRecords[0].mappingWarning, 'blocked-cross-year-override');
  assert.equal(dataset.totals.actual, 5000, 'blocked cross-year override amount must still be visible in BvA totals');
});

test('Phase 7A-3 control: normal same-year matching still works exactly as before', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({
    id:'pool-control-year', project:'AOA-MP', name:'Software Pool Control', budget:100000,
    startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'],
  });
  const record = ctx.createActualSpendRecord({
    id:'as-control-1', source:'Approved Memo', referenceNo:'CONTROL-1', project:'AOA-MP',
    spendType:'Software', amount:12000, startDate:'2025-06', endDate:'2025-06',
  });
  const mapped = ctx.mapActualSpendRecords([record], [pool]);
  assert.equal(mapped[0].finalBudgetPoolId, 'pool-control-year');

  const dataset = ctx.calculateBudgetVsActualDataset([pool], mapped, { year: pool.year, project:'AOA-MP' });
  assert.deepEqual(Array.from(dataset.rows[0].records, r => r.id), ['as-control-1']);
  assert.equal(dataset.totals.actual, 12000);
});

test('Phase 7A-3: updateActualSpendBudgetOverride (the function Tag Budget calls) blocks a cross-year override and flags it, matching mapBudgetPool', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-tag-A', project:'AOA-MP', name:'Pool A', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-tag-B', project:'AOA-MP', name:'Pool B', budget:100000, startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'] });
  const memoRecord = ctx.createActualSpendRecord({
    id:'actual-spend-memo-TAG-1', source:'Approved Memo', referenceNo:'TAG-1', memoId:'TAG-1',
    project:'AOA-MP', spendType:'Software', amount:9000, startDate:'2026-05-01', endDate:'2026-05-01',
  });
  ctx.storeActualSpendRecords([memoRecord]);

  const overridden = ctx.updateActualSpendBudgetOverride('TAG-1', 'pool-tag-B', [poolA, poolB]);
  assert.equal(overridden.budgetStatus, 'Unbudgeted', 'Tag Budget\'s underlying mechanism must not silently accept a cross-year assignment as Manual Override');
  assert.equal(overridden.mappingWarning, 'blocked-cross-year-override');
  assert.equal(ctx.getFinalBudgetPoolId(overridden), null);

  const validOverride = ctx.updateActualSpendBudgetOverride('TAG-1', 'pool-tag-A', [poolA, poolB]);
  assert.equal(validOverride.budgetStatus, 'Manual Override');
  assert.equal(validOverride.finalBudgetPoolId, 'pool-tag-A');
});

test('Phase 7A-3: updateActualSpendBudgetOverride blocks a cross-project override and flags it, matching mapBudgetPool', () => {
  const ctx = context();
  const poolSameProject = ctx.createBudgetPoolRecord({ id:'pool-tag-sameproj', project:'AOA-MP', name:'Pool Same', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolOtherProject = ctx.createBudgetPoolRecord({ id:'pool-tag-otherproj', project:'OTHER-PRJ', name:'Pool Other', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const memoRecord = ctx.createActualSpendRecord({
    id:'actual-spend-memo-TAG-2', source:'Approved Memo', referenceNo:'TAG-2', memoId:'TAG-2',
    project:'AOA-MP', spendType:'Software', amount:9000, startDate:'2026-05-01', endDate:'2026-05-01',
  });
  ctx.storeActualSpendRecords([memoRecord]);

  const overridden = ctx.updateActualSpendBudgetOverride('TAG-2', 'pool-tag-otherproj', [poolSameProject, poolOtherProject]);
  assert.equal(overridden.budgetStatus, 'Unbudgeted', 'Tag Budget\'s underlying mechanism must not silently accept a cross-project assignment as Manual Override');
  assert.equal(overridden.mappingWarning, 'blocked-cross-project-override');
  assert.equal(ctx.getFinalBudgetPoolId(overridden), null);

  const validOverride = ctx.updateActualSpendBudgetOverride('TAG-2', 'pool-tag-sameproj', [poolSameProject, poolOtherProject]);
  assert.equal(validOverride.budgetStatus, 'Manual Override');
  assert.equal(validOverride.finalBudgetPoolId, 'pool-tag-sameproj');
});

test('Phase 7A-3: Budget Pool deletion remains blocked by persisted manual expense / memo references even after a cross-year override is cleared from the canonical record', () => {
  const ctx = context();
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-del-B', project:'AOA-MP', name:'Pool B', budget:100000, startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'] });
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-del-A', project:'AOA-MP', name:'Pool A', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });

  // A manual expense whose cross-year override gets blocked at the canonical layer...
  const manualRecord = ctx.createActualSpendRecord({
    id:'as-del-manual-1', source:'Manual / Historical Expense', referenceNo:'DEL-1', project:'AOA-MP',
    spendType:'Software', amount:4000, startDate:'2026-02-01', endDate:'2026-02-01',
    manualBudgetPoolId:'pool-del-B',
  });
  const mappedManual = ctx.mapBudgetPool(manualRecord, [poolA, poolB]);
  assert.equal(mappedManual.finalBudgetPoolId, null, 'sanity: the cross-year override is blocked at the canonical layer');

  // ...but the raw, persisted sources (the manual expense's own record and the memo's own record)
  // still reference the pool directly and are never touched by mapBudgetPool's blocking logic.
  const rawManualExpense = { id:'manual-expense-1', budgetPoolId:'pool-del-B' };
  const rawMemo = { memoNo:'MEMO-DEL-1', budgetPoolId:'pool-del-B' };

  const canonicalOnly = ctx.budgetPoolDeletionBlockers('pool-del-B', [mappedManual]);
  assert.equal(canonicalOnly.length, 0, 'the canonical record alone no longer blocks deletion once its override is cleared');

  const withAllSources = ctx.budgetPoolDeletionBlockers('pool-del-B', [mappedManual], [rawManualExpense], [rawMemo]);
  assert.equal(withAllSources.length, 2, 'the raw manual expense and memo still reference the pool, so deletion must remain blocked');

  const unrelatedPool = ctx.budgetPoolDeletionBlockers('pool-del-A', [mappedManual], [rawManualExpense], [rawMemo]);
  assert.equal(unrelatedPool.length, 0, 'an unrelated pool id is not blocked');
});

test('Phase 7A-3: saveBudgetTag guards against a cross-year selection before calling the override, rather than saving and discovering it silently later', () => {
  // financial-models.test.js does not eval views/history.js (no execution harness exists for it
  // here), so this is a structural check, not a behavioral one -- it confirms the guard exists
  // and runs BEFORE the mutating call, ahead of the behavioral proof above (which shows what the
  // shared updateActualSpendBudgetOverride mechanism itself does when reached).
  const saveBudgetTagSource = (historyCode.match(/function saveBudgetTag[\s\S]*?\n}/) || [''])[0];
  assert.ok(saveBudgetTagSource, 'saveBudgetTag() must still exist in views/history.js');
  assert.match(saveBudgetTagSource, /gregorianYearToBuddhistEra/, 'must derive the memo\'s coverage year using the shared helper, not ad hoc logic');
  assert.match(saveBudgetTagSource, /createBudgetPoolRecord/, 'must compare against the pool\'s canonical derived year, not its raw stored year');
  const guardIndex = saveBudgetTagSource.search(/if \(memoYear[\s\S]*?return;\s*\n\s*}/);
  const overrideCallIndex = saveBudgetTagSource.indexOf('updateActualSpendBudgetOverride(memoNo');
  assert.ok(guardIndex >= 0 && overrideCallIndex >= 0 && guardIndex < overrideCallIndex,
    'the cross-year guard must run and return BEFORE updateActualSpendBudgetOverride is ever called, so an invalid selection is never persisted');
  // The guard must not fail open when no canonical Actual Spend record exists yet for this memo
  // (e.g. stale/unrefreshed canonical storage) -- it must fall back to deriving the memo's own
  // coverage date directly, using the same fallback chain actualSpendFromMemo() uses.
  assert.match(saveBudgetTagSource, /memoCoveragePeriod/, 'must fall back to the memo\'s own coverage period when no canonical record is found yet, instead of silently skipping the check');
});

test('Phase 7A-3: saveBudgetTag guards against a cross-project selection before calling the override, rather than saving and discovering it silently later', () => {
  const saveBudgetTagSource = (historyCode.match(/function saveBudgetTag[\s\S]*?\n}/) || [''])[0];
  assert.ok(saveBudgetTagSource, 'saveBudgetTag() must still exist in views/history.js');
  const projectGuardIndex = saveBudgetTagSource.search(/if \(canonicalPool\.project[\s\S]*?return;\s*\n\s*}/);
  const yearGuardIndex = saveBudgetTagSource.search(/if \(memoYear[\s\S]*?return;\s*\n\s*}/);
  const overrideCallIndex = saveBudgetTagSource.indexOf('updateActualSpendBudgetOverride(memoNo');
  assert.ok(projectGuardIndex >= 0, 'a cross-project guard comparing canonicalPool.project against memo.project must exist');
  assert.ok(projectGuardIndex < yearGuardIndex && projectGuardIndex < overrideCallIndex,
    'the cross-project guard must run and return before both the cross-year guard and updateActualSpendBudgetOverride, so an invalid cross-project selection is never persisted');
});

test('Phase 7A-3: mappingWarning survives createActualSpendRecord normalization (a store/reload cycle), not just mapBudgetPool\'s immediate return value', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-mw-A', project:'AOA-MP', name:'Pool A', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-mw-B', project:'AOA-MP', name:'Pool B', budget:100000, startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({
    id:'as-mw-1', source:'Manual / Historical Expense', referenceNo:'MW-1', project:'AOA-MP',
    spendType:'Software', amount:3000, startDate:'2026-04-01', endDate:'2026-04-01',
    manualBudgetPoolId:'pool-mw-B',
  });
  const mapped = ctx.mapBudgetPool(record, [poolA, poolB]);
  assert.equal(mapped.mappingWarning, 'blocked-cross-year-override', 'sanity: mapBudgetPool sets the flag immediately');

  // Simulate the real persistence path: reconcileActualSpendSources() stores via
  // storeActualSpendRecords(), and a later render reads it back via loadActualSpendRecords() --
  // both of which normalize every record through createActualSpendRecord().
  ctx.storeActualSpendRecords([mapped]);
  const reloaded = ctx.loadActualSpendRecords().find(r => r.id === 'as-mw-1');
  assert.ok(reloaded, 'the record must still exist after the store/reload cycle');
  assert.equal(reloaded.mappingWarning, 'blocked-cross-year-override', 'the flag must survive normalization, not only appear in the immediate in-memory result');
  assert.equal(reloaded.budgetStatus, 'Unbudgeted');
  assert.equal(reloaded.finalBudgetPoolId, null);

  // Control: a record with no warning must not spuriously gain one after the same round trip.
  const cleanRecord = ctx.createActualSpendRecord({ id:'as-mw-2', source:'Approved Memo', referenceNo:'MW-2', project:'AOA-MP', spendType:'Software', amount:1000, startDate:'2026-01', endDate:'2026-01' });
  ctx.storeActualSpendRecords([cleanRecord]);
  const reloadedClean = ctx.loadActualSpendRecords().find(r => r.id === 'as-mw-2');
  assert.equal(reloadedClean.mappingWarning, null);
});

test('Phase 7A-3: Forecast remains unaffected by the same-year mapping / cross-year blocking changes', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-fc-A', project:'AOA-MP', name:'Pool A', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-fc-B', project:'AOA-MP', name:'Pool B', budget:100000, startMonth:'2025-01', endMonth:'2025-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({
    id:'as-fc-1', source:'Manual / Historical Expense', referenceNo:'FC-1', project:'AOA-MP',
    spendType:'Software', amount:12000, startDate:'2026-01', endDate:'2026-12', vendorProgram:'Suite',
    manualBudgetPoolId:'pool-fc-B', // cross-year, will be blocked and flagged
  });
  const mapped = ctx.mapBudgetPool(record, [poolA, poolB]);
  assert.equal(mapped.budgetStatus, 'Unbudgeted');
  const forecast = ctx.calculateForecast([mapped], new Date(2026, 6, 15));
  assert.equal(forecast.rows.length, 1, 'Forecast eligibility (spendType + coverageStatus) is unaffected by budgetStatus/mappingWarning');
  assert.equal(forecast.rows[0].total, 12000);
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

// ── Phase 7A-4: BvA must not drop Needs PMO Review Actual Spend from totals ──
// Locked business rule (docs/BvA_REQUIREMENT.md "Financial Invariants" / "Equality Rules"): every
// in-scope Actual Spend record must be counted exactly once in Budget vs Actual totals.actual,
// regardless of its budgetStatus bucket. Before this fix, calculateBudgetVsActualDataset()'s
// unbudgetedRecords filter checked `budgetStatus === 'Unbudgeted'` specifically, and mappedActual
// only summed rows scoped to a pool the record's finalBudgetPoolId pointed to — so a record whose
// budgetStatus was 'Needs PMO Review' (finalBudgetPoolId always null, see mapBudgetPool()) matched
// neither bucket and silently vanished from totals.actual entirely.

test('Phase 7A-4: a Needs PMO Review record is counted in dataset.totals.actual', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-nr-A', project:'AOA-MP', name:'Pool A', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-nr-B', project:'AOA-MP', name:'Pool B', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({ ...base, id:'as-nr-1', referenceNo:'NR-1', amount:1500 });
  const mapped = ctx.mapBudgetPool(record, [poolA, poolB]);
  assert.equal(mapped.budgetStatus, 'Needs PMO Review', 'sanity: two overlapping matching pools produce Needs PMO Review');
  const dataset = ctx.calculateBudgetVsActualDataset([poolA, poolB], [mapped], { year:'2569', project:'AOA-MP' });
  assert.equal(dataset.totals.actual, 1500, 'a Needs PMO Review amount must never disappear from totals.actual');
});

test('Phase 7A-4: Needs PMO Review records are not included in unbudgetedRecords / totals.unbudgetedActual', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-nr2-A', project:'AOA-MP', name:'Pool A', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-nr2-B', project:'AOA-MP', name:'Pool B', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({ ...base, id:'as-nr-2', referenceNo:'NR-2', amount:1200 });
  const mapped = ctx.mapBudgetPool(record, [poolA, poolB]);
  const dataset = ctx.calculateBudgetVsActualDataset([poolA, poolB], [mapped], { year:'2569', project:'AOA-MP' });
  assert.equal(dataset.unbudgetedRecords.length, 0, 'a Needs PMO Review record must not be mislabeled as Unbudgeted');
  assert.equal(dataset.totals.unbudgetedActual, 0);
});

test('Phase 7A-4: Needs PMO Review has its own dataset bucket and total', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-nr3-A', project:'AOA-MP', name:'Pool A', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-nr3-B', project:'AOA-MP', name:'Pool B', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({ ...base, id:'as-nr-3', referenceNo:'NR-3', amount:900 });
  const mapped = ctx.mapBudgetPool(record, [poolA, poolB]);
  const dataset = ctx.calculateBudgetVsActualDataset([poolA, poolB], [mapped], { year:'2569', project:'AOA-MP' });
  assert.deepEqual(Array.from(dataset.needsReviewRecords, r => r.id), ['as-nr-3']);
  assert.equal(dataset.totals.needsReviewActual, 900);
});

test('Phase 7A-4: Mapped, Unbudgeted, and Needs PMO Review records are each counted exactly once, with no double counting', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-nr4-single', project:'AOA-MP', name:'Single Match', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolOverlapA = ctx.createBudgetPoolRecord({ id:'pool-nr4-A', project:'AOA-MP', name:'Overlap A', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Hardware'] });
  const poolOverlapB = ctx.createBudgetPoolRecord({ id:'pool-nr4-B', project:'AOA-MP', name:'Overlap B', budget:50000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Hardware'] });
  const allPools = [pool, poolOverlapA, poolOverlapB];

  const mappedRecord = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-mapped', referenceNo:'M-1', amount:1000 }), allPools);
  const unbudgetedRecord = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-unbudgeted', referenceNo:'U-1', amount:2000, project:'NO-POOL-PRJ' }), allPools);
  const needsReviewRecord = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-review', referenceNo:'R-1', amount:3000, spendType:'Hardware' }), allPools);

  assert.equal(mappedRecord.budgetStatus, 'Mapped');
  assert.equal(unbudgetedRecord.budgetStatus, 'Unbudgeted');
  assert.equal(needsReviewRecord.budgetStatus, 'Needs PMO Review');

  const dataset = ctx.calculateBudgetVsActualDataset(allPools, [mappedRecord, unbudgetedRecord, needsReviewRecord], { year:'2569' });

  assert.equal(dataset.totals.mappedActual, 1000);
  assert.equal(dataset.totals.unbudgetedActual, 2000);
  assert.equal(dataset.totals.needsReviewActual, 3000);
  assert.equal(dataset.totals.actual, 6000, 'total must equal the sum of every bucket exactly once');

  const allBucketedRecords = [
    ...dataset.rows.flatMap(row => row.records),
    ...dataset.unbudgetedRecords,
    ...dataset.needsReviewRecords,
  ];
  assert.equal(allBucketedRecords.length, 3, 'each of the three records must appear in exactly one bucket, none duplicated, none missing');
  assert.deepEqual(allBucketedRecords.map(r => r.id).sort(), ['as-mapped', 'as-review', 'as-unbudgeted']);
});

test('Phase 7A-4: BvA export includes a Needs PMO Review summary row and export totals still equal dataset totals', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-nr5', project:'AOA-MP', name:'Pool', budget:10000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolDupA = ctx.createBudgetPoolRecord({ id:'pool-nr5-A', project:'AOA-MP', name:'Dup A', budget:5000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Infra'] });
  const poolDupB = ctx.createBudgetPoolRecord({ id:'pool-nr5-B', project:'AOA-MP', name:'Dup B', budget:5000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Infra'] });
  const allPools = [pool, poolDupA, poolDupB];

  const mappedRecord = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-exp-mapped', referenceNo:'EXP-M', amount:2500 }), allPools);
  const unbudgetedRecord = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-exp-unbudgeted', referenceNo:'EXP-U', amount:600, project:'NO-POOL-PRJ' }), allPools);
  const needsReviewRecord = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-exp-review', referenceNo:'EXP-R', amount:1800, spendType:'Infra' }), allPools);

  const dataset = ctx.calculateBudgetVsActualDataset(allPools, [mappedRecord, unbudgetedRecord, needsReviewRecord], { year:'2569' });
  const exported = ctx.budgetVsActualExportDataset(dataset);

  assert.equal(exported.totals.actual, dataset.totals.actual);
  assert.equal(exported.totals.actual, 4900);
  assert.equal(
    exported.rows.reduce((sum, row) => sum + Number(row[6]), 0), dataset.totals.actual,
    'export row-level Actual Spend column must still sum to the dataset grand total, including Needs PMO Review',
  );
  const reviewRow = exported.rows.find(row => row[10] === 'Needs PMO Review');
  assert.ok(reviewRow, 'export must include a Needs PMO Review summary row so its amount is not silently missing from the download');
  assert.equal(reviewRow[6], 1800);
  assert.equal(reviewRow[9], 1, 'Items count for the Needs PMO Review summary row');
});

test('Phase 7A-4 regression: Phase 7A-3 cross-year/cross-project Manual Override blocking still lands in Unbudgeted, not Needs PMO Review', () => {
  const ctx = context();
  const poolAOA = ctx.createBudgetPoolRecord({ id:'pool-reg-aoa', project:'AOA-MP', name:'Pool AOA', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolOther = ctx.createBudgetPoolRecord({ id:'pool-reg-other', project:'OTHER-PRJ', name:'Pool Other', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({
    id:'as-reg-cross-project', source:'Manual / Historical Expense', referenceNo:'REG-1', project:'AOA-MP',
    spendType:'Software', amount:4400, startDate:'2026-03-15', endDate:'2026-03-15',
    manualBudgetPoolId:'pool-reg-other',
  });
  const mapped = ctx.mapBudgetPool(record, [poolAOA, poolOther]);
  assert.equal(mapped.budgetStatus, 'Unbudgeted');
  assert.equal(mapped.mappingWarning, 'blocked-cross-project-override');
  const dataset = ctx.calculateBudgetVsActualDataset([poolAOA, poolOther], [mapped], { year:'2569', project:'AOA-MP' });
  assert.equal(dataset.unbudgetedRecords.length, 1);
  assert.equal(dataset.needsReviewRecords.length, 0, 'a blocked override must remain Unbudgeted, never reclassified as Needs PMO Review');
  assert.equal(dataset.totals.unbudgetedActual, 4400);
  assert.equal(dataset.totals.needsReviewActual, 0);
  assert.equal(dataset.totals.actual, 4400);
});

test('Phase 7A-4: Forecast remains unaffected by the new Needs PMO Review bucket', () => {
  const ctx = context();
  const poolA = ctx.createBudgetPoolRecord({ id:'pool-fc-nr-A', project:'AOA-MP', name:'Pool A', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const poolB = ctx.createBudgetPoolRecord({ id:'pool-fc-nr-B', project:'AOA-MP', name:'Pool B', budget:100000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = ctx.createActualSpendRecord({
    ...base, id:'as-fc-nr-1', referenceNo:'FC-NR-1', amount:12000, startDate:'2026-01', endDate:'2026-12', vendorProgram:'Suite',
  });
  const mapped = ctx.mapBudgetPool(record, [poolA, poolB]);
  assert.equal(mapped.budgetStatus, 'Needs PMO Review', 'sanity: two identical overlapping pools produce Needs PMO Review');
  const forecast = ctx.calculateForecast([mapped], new Date(2026, 6, 15));
  assert.equal(forecast.rows.length, 1, 'Forecast eligibility (spendType + coverageStatus) must remain unaffected by budgetStatus, including the new Needs PMO Review bucket');
  assert.equal(forecast.rows[0].total, 12000);
});

test('Phase 7A-8: calculateBudgetVsActualDataset Spend Type filter narrows Actual/records/export but leaves pool Budget untouched', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-78-mixed', project:'AOA-MP', name:'Mixed Pool', budget:20000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software','Hardware'] });
  const softwareRecord = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-78-sw', referenceNo:'SW-78', amount:3000 }), [pool]);
  const hardwareRecord = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-78-hw', referenceNo:'HW-78', spendType:'Hardware', amount:1500 }), [pool]);
  assert.equal(softwareRecord.budgetStatus, 'Mapped');
  assert.equal(hardwareRecord.budgetStatus, 'Mapped');

  const unfiltered = ctx.calculateBudgetVsActualDataset([pool], [softwareRecord, hardwareRecord], { year:'2569', project:'AOA-MP' });
  assert.equal(unfiltered.totals.actual, 4500);
  assert.equal(unfiltered.rows[0].records.length, 2);

  const filtered = ctx.calculateBudgetVsActualDataset([pool], [softwareRecord, hardwareRecord], { year:'2569', project:'AOA-MP', spendType:'Software' });
  assert.deepEqual(filtered.rows[0].records.map(r => r.id), ['as-78-sw'], 'only the Software record must remain once filtered');
  assert.equal(filtered.totals.actual, 3000, 'Actual must reflect only the filtered spend type');
  assert.equal(filtered.rows[0].budget, 20000, 'Budget Pool budget is independent of the Spend Type filter');
  assert.equal(filtered.totals.budget, unfiltered.totals.budget, 'the pool budget total must not shrink because of a content filter');

  const exported = ctx.budgetVsActualExportDataset(filtered);
  assert.equal(exported.totals.actual, filtered.totals.actual, 'export must reconcile with the filtered dataset, not the unfiltered one');
});

test('Phase 7A-8: calculateBudgetVsActualDataset search filter matches reference/description case-insensitively, same convention as Manual Entries search', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-78-search', project:'AOA-MP', name:'Search Pool', budget:10000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const adobe = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-78-adobe', referenceNo:'ADB-1', description:'Adobe Creative Cloud renewal', amount:2000 }), [pool]);
  const slack = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-78-slack', referenceNo:'SLK-1', description:'Slack seats', amount:500 }), [pool]);

  const dataset = ctx.calculateBudgetVsActualDataset([pool], [adobe, slack], { year:'2569', project:'AOA-MP', search:'ADOBE' });
  assert.deepEqual(dataset.rows[0].records.map(r => r.id), ['as-78-adobe'], 'search must be case-insensitive and match the description field');
  assert.equal(dataset.totals.actual, 2000);

  const noMatch = ctx.calculateBudgetVsActualDataset([pool], [adobe, slack], { year:'2569', project:'AOA-MP', search:'zzz-not-found' });
  assert.equal(noMatch.rows[0].records.length, 0);
  assert.equal(noMatch.totals.actual, 0);

  const emptySearch = ctx.calculateBudgetVsActualDataset([pool], [adobe, slack], { year:'2569', project:'AOA-MP', search:'' });
  assert.equal(emptySearch.rows[0].records.length, 2, 'an empty search string must behave exactly like no filter at all');
});

test('Phase 7A-8: calculateBudgetVsActualDataset is unchanged when spendType/search are omitted (backward compatibility)', () => {
  const ctx = context();
  const pool = ctx.createBudgetPoolRecord({ id:'pool-78-compat', project:'AOA-MP', name:'Compat Pool', budget:10000, startMonth:'2026-01', endMonth:'2026-12', spendTypes:['Software'] });
  const record = ctx.mapBudgetPool(ctx.createActualSpendRecord({ ...base, id:'as-78-compat', amount:4000 }), [pool]);
  const dataset = ctx.calculateBudgetVsActualDataset([pool], [record], { year:'2569', project:'AOA-MP' });
  assert.equal(dataset.totals.actual, 4000);
  assert.equal(dataset.rows[0].records.length, 1);
});

// ══════════════════════════════════════════════════════════════════
// PHASE 7A-9A — Year/BE normalization foundation + Project dropdown foundation
// ══════════════════════════════════════════════════════════════════

test('Phase 7A-9A: getCurrentBuddhistYear() wraps gregorianYearToBuddhistEra(currentYear), matching the formula it replaces', () => {
  const ctx = context();
  const expected = String(new Date().getFullYear() + 543);
  assert.equal(ctx.getCurrentBuddhistYear(), expected);
  assert.equal(ctx.getCurrentBuddhistYear(), ctx.gregorianYearToBuddhistEra(new Date().getFullYear()));
});

test('Phase 7A-9A: getCanonicalProjectList() returns [] when loadSettings is unavailable, and settings.projects when it is', () => {
  const ctx = context();
  // Arrays returned from vm-sandboxed app.js code are foreign Array instances to this realm's
  // assert, so round-trip through JSON (same convention used elsewhere in this suite) instead of
  // deepEqual-ing them directly.
  const list = () => JSON.parse(JSON.stringify(ctx.getCanonicalProjectList()));
  assert.deepEqual(list(), []);
  ctx.loadSettings = () => ({ projects: ['Alpha', 'Beta'] });
  assert.deepEqual(list(), ['Alpha', 'Beta']);
  ctx.loadSettings = () => ({});
  assert.deepEqual(list(), []);
});

test('Phase 7A-9A: financialYearToGregorian and gregorianYearToBuddhistEra remain exact inverses for realistic years', () => {
  const ctx = context();
  assert.equal(ctx.financialYearToGregorian('2569'), '2026');
  assert.equal(ctx.gregorianYearToBuddhistEra('2026'), '2569');
  assert.equal(ctx.financialYearToGregorian('2026'), '2026', 'a Gregorian-looking year must pass through unchanged');
});
