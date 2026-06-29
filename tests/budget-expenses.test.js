const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
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
