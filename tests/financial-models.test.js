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
