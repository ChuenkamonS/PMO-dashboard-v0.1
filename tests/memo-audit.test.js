// Functional Audit regression tests — Memo/Approval audit-log gaps found while auditing the
// Memo -> Approval -> Budget end-to-end flow (MEMO_LIFECYCLE.md §17 requires an audit entry for
// every listed action, with previous/new status captured; §8 requires Override evidence to be
// traceable in the audit trail).
//
// Loads app.js -> views/pending.js -> views/history.js into one VM context with a real
// Map-backed localStorage (mirrors tests/device.test.js's/tests/license.test.js's pattern) so
// these functions' real persistence path (loadMemos/storeMemos/appendAuditLog/
// updateMemoStatusAsync) is exercised, not a stub.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const pendingCode = fs.readFileSync(path.join(root, 'views/pending.js'), 'utf8');
const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');

function createContext() {
  const storage = new Map();
  const userButton = { dataset: { profileId: '3', isPmo: 'false' } };
  const elements = {
    'sb-user-btn': userButton,
    'sb-uname': { textContent: 'PMO Officer' },
    'sb-urole': { textContent: 'PMO' },
    'pmo-new-status': { value: 'completed' },
    'pmo-override-note': { value: 'Approved via email outside the system' },
    'pmo-approved-by': { value: '' },
    'pmo-evidence-url': { value: 'data:image/png;base64,aGVsbG8=' },
    'pmo-override-modal': { remove() {} },
    'detail-modal': { style: {} },
  };
  const context = {
    console, Date, Intl, URL, Blob, AbortController,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    alert: () => {}, confirm: () => true, prompt: () => 'Requester changed plans',
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
      addEventListener: () => {},
    },
    window: {},
    location: { reload() {} },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(appCode, context, { filename: 'app.js' });
  vm.runInContext(pendingCode, context, { filename: 'views/pending.js' });
  vm.runInContext(historyCode, context, { filename: 'views/history.js' });
  vm.runInContext(`_userProfilesCache = [
    {id:1, full_name:'A1 Reviewer', name_aliases:[], can_review:true, can_approve:true, is_active:true, is_pmo:false},
    {id:2, full_name:'A2 Approver', name_aliases:[], can_review:true, can_approve:true, is_active:true, is_pmo:false},
    {id:3, full_name:'PMO Officer', name_aliases:[], can_review:true, can_approve:true, is_active:true, is_pmo:true}
  ]`, context);
  context.checkSupa = async () => false; // deterministic: local-only persistence
  context.swView = () => {}; // view navigation is not under test here
  return { context, storage, elements, userButton };
}

function pendingMemo(overrides = {}) {
  return {
    memoNo: 'ORB-2607-100',
    type: 'sl',
    status: 'pending',
    project: 'AOA-MP',
    total: 15000,
    requesterProfileId: 4,
    requesterName: 'Requester Person',
    approvers: [
      { profileId: 1, name: 'A1 Reviewer', title: 'Manager', status: 'pending' },
      { profileId: 2, name: 'A2 Approver', title: 'Director', status: 'pending' },
    ],
    auditLog: [],
    ...overrides,
  };
}

test('confirmPmoOverride writes statusBefore/statusAfter/evidenceUrl into the audit entry, not nulls', async () => {
  const { context } = createContext();
  context.storeMemos([pendingMemo()]);

  context.confirmPmoOverride('ORB-2607-100');
  await new Promise(r => setTimeout(r, 0)); // let updateMemoStatusAsync's async chain settle

  const memo = context.loadMemos().find(m => m.memoNo === 'ORB-2607-100');
  const entry = memo.auditLog.find(e => e.action.startsWith('PMO Override'));
  assert.ok(entry, 'PMO Override must write an audit entry');
  assert.equal(entry.statusBefore, 'pending');
  assert.equal(entry.statusAfter, 'completed');
  assert.equal(entry.evidenceUrl, 'data:image/png;base64,aGVsbG8=');
});

test('cancelMemo writes statusBefore/statusAfter into the audit entry, not nulls', async () => {
  const { context } = createContext();
  context.storeMemos([pendingMemo({ requesterProfileId: 3, requesterName: 'PMO Officer' })]);

  context.cancelMemo('ORB-2607-100');
  await new Promise(r => setTimeout(r, 0));

  const memo = context.loadMemos().find(m => m.memoNo === 'ORB-2607-100');
  const entry = memo.auditLog.find(e => e.action.startsWith('Cancelled'));
  assert.ok(entry, 'Cancel must write an audit entry');
  assert.equal(entry.statusBefore, 'pending');
  assert.equal(entry.statusAfter, 'cancelled');
});

test('duplicateMemo appends an audit entry to the ORIGINAL memo (MEMO_LIFECYCLE.md §17)', () => {
  const { context } = createContext();
  context.storeMemos([pendingMemo({ memoNo: 'ORB-2607-200', status: 'completed' })]);

  context.duplicateMemo('ORB-2607-200');

  const memo = context.loadMemos().find(m => m.memoNo === 'ORB-2607-200');
  assert.equal(memo.auditLog.length, 1);
  assert.ok(memo.auditLog[0].action.startsWith('Duplicated by'));
  assert.equal(memo.auditLog[0].statusBefore, 'completed');
  assert.equal(memo.auditLog[0].statusAfter, 'completed');
  assert.equal(memo.status, 'completed', 'the original memo\'s own status/lifecycle must be untouched by Duplicate');
});

test('reeditRejectedMemo appends an audit entry to the ORIGINAL (rejected) memo', () => {
  const { context } = createContext();
  context.storeMemos([pendingMemo({ memoNo: 'ORB-2607-300', status: 'rejected' })]);

  context.reeditRejectedMemo('ORB-2607-300');

  const memo = context.loadMemos().find(m => m.memoNo === 'ORB-2607-300');
  assert.equal(memo.auditLog.length, 1);
  assert.ok(memo.auditLog[0].action.startsWith('Re-edited (Rejected) by'));
  assert.equal(memo.status, 'rejected', 'the original Rejected memo must remain Rejected, not be mutated by Re-edit');
});
