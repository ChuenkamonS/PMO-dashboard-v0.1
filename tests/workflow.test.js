const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function createAppContext() {
  const storage = new Map();
  const userButton = { dataset: { profileId: '3', isPmo: 'false' } };
  const userName = { textContent: 'นางสาว ชื่นกมล สารมานิตย์' };
  const userRole = { textContent: 'Project Manager' };
  const elements = {
    'sb-user-btn': userButton,
    'sb-uname': userName,
    'sb-urole': userRole,
  };
  const context = {
    console,
    Date,
    Intl,
    URL,
    Blob,
    AbortController,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    alert: () => {},
    confirm: () => true,
    fetch: async () => ({ ok: true, text: async () => '[]', blob: async () => new Blob() }),
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key),
    },
    document: {
      getElementById: id => elements[id] || null,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => ({ style: {}, click() {}, remove() {}, appendChild() {} }),
      body: { appendChild() {}, removeChild() {}, classList: { add() {}, remove() {} } },
    },
    location: { reload() {} },
  };
  vm.createContext(context);
  vm.runInContext(appCode, context, { filename: 'app.js' });
  vm.runInContext(`_userProfilesCache = [
    {id:1, full_name:'นาย นวพล งามวรโรจน์สกุล', name_aliases:['นวพล'], can_review:true, can_approve:true, is_active:true, is_pmo:false},
    {id:2, full_name:'นาย ปกรณ์ เจียมสกุลทิพย์', name_aliases:['ปกรณ์'], can_review:true, can_approve:true, is_active:true, is_pmo:false},
    {id:3, full_name:'นางสาว ชื่นกมล สารมานิตย์', name_aliases:['ชื่นกมล'], can_review:true, can_approve:true, is_active:true, is_pmo:true}
  ]`, context);
  return { context, userButton, userName };
}

function memo(overrides = {}) {
  return {
    memoNo: 'ORB-2606-999',
    status: 'pending',
    requesterProfileId: 3,
    requesterName: 'นางสาว ชื่นกมล สารมานิตย์',
    approvers: [
      { profileId: 1, name: 'นาย นวพล งามวรโรจน์สกุล', title: 'Director', status: 'pending' },
      { profileId: 2, name: 'นาย ปกรณ์ เจียมสกุลทิพย์', title: 'CEO', status: 'pending' },
    ],
    auditLog: [],
    ...overrides,
  };
}

test('self A1 submission records review and routes directly to A2', () => {
  const { context } = createAppContext();
  const result = context.prepareMemoForSubmission(memo({
    status: 'draft',
    approvers: [
      { profileId: 3, name: 'นางสาว ชื่นกมล สารมานิตย์', title: 'PM', status: 'pending' },
      { profileId: 2, name: 'นาย ปกรณ์ เจียมสกุลทิพย์', title: 'CEO', status: 'pending' },
    ],
  }), '2026-06-29T12:00:00.000Z');

  assert.equal(result.status, 'pending_a2');
  assert.equal(result.approvers[0].status, 'approved');
  assert.equal(result.approvers[0].selfReviewed, true);
  assert.equal(result.currentApproverProfileId, 2);
  assert.equal(result.approvedAt, null);
  assert.equal(result.auditLog.at(-1).action, 'A1 Self-reviewed on submission');
});

test('normal submission routes to A1 without final approval timestamp', () => {
  const { context } = createAppContext();
  const result = context.prepareMemoForSubmission(memo({ status: 'draft' }), '2026-06-29T12:00:00.000Z');
  assert.equal(result.status, 'pending');
  assert.equal(result.currentApproverProfileId, 1);
  assert.equal(result.approvedAt, null);
  assert.equal(result.auditLog.length, 0);
});

test('personal Pending is the union of requester and current approver work', () => {
  const { context, userButton, userName } = createAppContext();
  assert.equal(context.isMemoVisibleInPending(memo()), true, 'requester sees own pending memo');

  userButton.dataset.profileId = '1';
  userName.textContent = 'นาย นวพล งามวรโรจน์สกุล';
  assert.equal(context.isMemoVisibleInPending(memo()), true, 'A1 sees assigned memo');
  assert.equal(context.canCurrentUserActOnMemo(memo()), true);

  userButton.dataset.profileId = '2';
  userName.textContent = 'นาย ปกรณ์ เจียมสกุลทิพย์';
  assert.equal(context.isMemoVisibleInPending(memo()), false, 'future A2 does not see it before their turn');
});

test('requester cannot act on their own pending memo', () => {
  const { context } = createAppContext();
  assert.equal(context.canCurrentUserActOnMemo(memo()), false);
});

test('intermediate approval does not set approvedAt; final approval does', async () => {
  const { context, userButton, userName } = createAppContext();
  const initial = memo();
  vm.runInContext(`_memCache = [${JSON.stringify(initial)}]`, context);

  userButton.dataset.profileId = '1';
  userName.textContent = 'นาย นวพล งามวรโรจน์สกุล';
  const afterA1 = await context.updateMemoStatusAsync(initial.memoNo, 'approved_a1', { approvedBy: userName.textContent });
  assert.equal(afterA1.status, 'pending_a2');
  assert.equal(afterA1.approvedAt, null);
  assert.equal(afterA1.currentApproverProfileId, 2);

  userButton.dataset.profileId = '2';
  userName.textContent = 'นาย ปกรณ์ เจียมสกุลทิพย์';
  const afterA2 = await context.updateMemoStatusAsync(initial.memoNo, 'approved_a2', { approvedBy: userName.textContent });
  assert.equal(afterA2.status, 'completed');
  assert.ok(afterA2.approvedAt);
  assert.equal(afterA2.currentApproverProfileId, null);
});

test('re-edit creates a new clean draft and preserves source reference', () => {
  const { context } = createAppContext();
  const rejected = memo({
    status: 'rejected',
    rejectedAt: '2026-06-29T12:00:00.000Z',
    rejectedBy: 'นาย นวพล งามวรโรจน์สกุล',
    rejectionReason: 'Budget issue',
    auditLog: [{ action: 'Rejected' }],
  });
  const draft = context.draftFromMemo(rejected, rejected.memoNo);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.memoNo, undefined);
  assert.equal(draft.sourceMemoNo, rejected.memoNo);
  assert.equal(draft.rejectedAt, undefined);
  assert.equal(draft.rejectionReason, undefined);
  assert.deepEqual(Array.from(draft.auditLog), []);
  assert.equal(rejected.status, 'rejected', 'original remains unchanged');
});

test('migration is additive and normalizes legacy rejected_revision records', () => {
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20260629123554_phase1_memo_workflow.sql'),
    'utf8'
  );
  assert.match(migration, /add column if not exists can_review/);
  assert.match(migration, /add column if not exists requester_profile_id/);
  assert.match(migration, /where status = 'rejected_revision'/);
  assert.doesNotMatch(migration, /drop\s+table/i);
});

test('the initial SL row exposes the same fields used by collection and validation', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  const initialRow = html.match(/<div id="sl-rows">([\s\S]*?)<\/div>\s*<button class="add-btn" onclick="addSLRow\(\)"/)?.[1] || '';
  const addRowFunction = createCode.match(/function addSLRow\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

  ['sl-name', 'sl-plan', 'sl-price', 'sl-mo', 'sl-qty', 'sl-start', 'sl-end'].forEach(field => {
    assert.match(initialRow, new RegExp(`class="[^"]*${field}`), `initial row is missing ${field}`);
    assert.match(addRowFunction, new RegExp(`class=\\"[^\\"]*${field}`), `added row is missing ${field}`);
  });
});

test('SL account table uses software-synced editable headers, checkboxes, and email-only PDF rows', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');

  assert.match(html, /sl-name[^>]+oninput="syncAcctColsFromSoftware\(\)"/);
  assert.match(createCode, /function syncAcctColsFromSoftware\(\)/);
  assert.match(createCode, /type="checkbox" class="acct-val"/);
  assert.match(createCode, /\.filter\(r=>r\[0\]\)/);
  assert.match(createCode, /const softwareNames = getAcctCols\(\)/);
  assert.match(appCode, /Account PDF: omit unnamed application columns and require a real email row/);
});
