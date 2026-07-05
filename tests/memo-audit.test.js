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

// Mock <div class="approver-edit-row"> nodes for confirmPmoOverride()'s
// `document.querySelectorAll('#pmo-appr-edit-rows .approver-edit-row')` read —
// without this, editRows.length is always 0 and the approver-array rebuild
// path (including the Finding-1 fix below) is never exercised.
function makeApproverEditRows(approvers) {
  return approvers.map(a => ({
    querySelector(sel) {
      if (sel === '.appr-name')  return { value: a.name  || '' };
      if (sel === '.appr-title') return { value: a.title || '' };
      return null;
    },
  }));
}

function createContext() {
  const storage = new Map();
  const userButton = { dataset: { profileId: '3', isPmo: 'false' } };
  let approverEditRows = [];
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
      querySelectorAll: sel => (sel && sel.includes('approver-edit-row')) ? approverEditRows : [],
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
  const setApproverEditRows = rows => { approverEditRows = rows; };
  return { context, storage, elements, userButton, setApproverEditRows };
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

// ══════════════════════════════════════════════════════════════════
// Functional audit fix — PMO Override to "Completed" previously left a
// later, not-yet-reached approver step stuck at 'pending' forever while the
// memo itself became fully 'completed' (triggering downstream PO/license/
// Actual Spend impact) — contradicting SYSTEM_STATE_MACHINE.md §5's own
// worked example (every step must resolve to Approved/Bypassed/Overridden,
// never left Pending under a finalized memo).
// ══════════════════════════════════════════════════════════════════

test('confirmPmoOverride to "completed" resolves every not-yet-reached approver step to Overridden, not left Pending', async () => {
  const { context, setApproverEditRows } = createContext();
  const memo = pendingMemo({
    status: 'pending_a2',
    approvers: [
      { profileId: 1, name: 'A1 Reviewer', title: 'Manager', status: 'approved', approvedAt: '2026-07-01T00:00:00.000Z', approvedBy: 'A1 Reviewer' },
      { profileId: 2, name: 'A2 Approver', title: 'Director', status: 'pending' },
      { profileId: 5, name: 'A3 Approver', title: 'VP', status: 'pending' },
    ],
  });
  context.storeMemos([memo]);
  setApproverEditRows(makeApproverEditRows(memo.approvers));
  context.document.getElementById('pmo-new-status').value = 'completed';

  context.confirmPmoOverride('ORB-2607-100');
  await new Promise(r => setTimeout(r, 0));

  const updated = context.loadMemos().find(m => m.memoNo === 'ORB-2607-100');
  assert.equal(updated.status, 'completed');
  assert.equal(updated.approvers[0].status, 'approved', 'already-resolved A1 must stay untouched');
  assert.equal(updated.approvers[1].status, 'overridden', 'A2 (the step PMO acted in place of) must be Overridden');
  assert.equal(updated.approvers[2].status, 'overridden', 'A3 (not yet reached) must ALSO resolve to Overridden, not stay Pending, once the memo is finalized as Completed');
  assert.ok(updated.approvers[2].overriddenBy, 'the resolved-in-bulk step must still record who overrode it');
});

test('confirmPmoOverride to a specific intermediate step (pending_a2) still leaves later steps Pending (unaffected by the "completed" fix)', async () => {
  const { context, setApproverEditRows } = createContext();
  const memo = pendingMemo({
    status: 'pending',
    approvers: [
      { profileId: 1, name: 'A1 Reviewer', title: 'Manager', status: 'pending' },
      { profileId: 2, name: 'A2 Approver', title: 'Director', status: 'pending' },
      { profileId: 5, name: 'A3 Approver', title: 'VP', status: 'pending' },
    ],
  });
  context.storeMemos([memo]);
  setApproverEditRows(makeApproverEditRows(memo.approvers));
  context.document.getElementById('pmo-new-status').value = 'pending_a2';

  context.confirmPmoOverride('ORB-2607-100');
  await new Promise(r => setTimeout(r, 0));

  const updated = context.loadMemos().find(m => m.memoNo === 'ORB-2607-100');
  assert.equal(updated.approvers[0].status, 'overridden', 'A1 (the step PMO acted in place of) must be Overridden');
  assert.equal(updated.approvers[1].status, 'pending', 'A2 has not been reached yet and the override only targeted a specific step, not final completion');
  assert.equal(updated.approvers[2].status, 'pending', 'A3 has not been reached yet either');
});

test('confirmPmoOverride refuses to act on a memo that is not in a Pending-family status (guards against resurrecting a terminal memo)', async () => {
  const { context, setApproverEditRows } = createContext();
  const memo = pendingMemo({ status: 'rejected', rejectionReason: 'Budget denied', rejectedBy: 'A1 Reviewer' });
  context.storeMemos([memo]);
  setApproverEditRows(makeApproverEditRows(memo.approvers));
  context.document.getElementById('pmo-new-status').value = 'completed';

  context.confirmPmoOverride('ORB-2607-100');
  await new Promise(r => setTimeout(r, 0));

  const unchanged = context.loadMemos().find(m => m.memoNo === 'ORB-2607-100');
  assert.equal(unchanged.status, 'rejected', 'a Rejected memo must not be revived by a direct Override call — only Duplicate may move it forward');
  assert.equal(unchanged.rejectionReason, 'Budget denied', 'rejection metadata must be untouched');
});

// ══════════════════════════════════════════════════════════════════
// Functional audit fix — confirmApprove()'s own audit entry recorded the
// intermediate action key ('approved_a1'/'approved_a2'/'approved_a3') as
// statusAfter, a value memo.status never actually holds (the real values are
// 'pending_a2'/'pending_a3'/'completed'). MEMO_LIFECYCLE.md §17 requires the
// audit log's "new value or status" to be accurate.
// ══════════════════════════════════════════════════════════════════

test('confirmApprove records the REAL resulting memo.status in the audit entry, not the intermediate action key', async () => {
  const { context, elements } = createContext();
  const memo = pendingMemo({
    status: 'pending_a2',
    approvers: [
      { profileId: 1, name: 'A1 Reviewer', title: 'Manager', status: 'approved', approvedAt: '2026-07-01T00:00:00.000Z', approvedBy: 'A1 Reviewer' },
      { profileId: 2, name: 'A2 Approver', title: 'Director', status: 'pending' },
    ],
  });
  context.storeMemos([memo]);
  context.checkSupa = async () => true; // confirmApprove sets throwOnSyncError:true
  elements['sb-user-btn'].dataset.profileId = '2'; // acting as A2 (the final approver)
  elements['sb-uname'].textContent = 'A2 Approver';
  elements['approve-modal'] = { style: {}, dataset: { targets: JSON.stringify(['ORB-2607-100']) } };
  elements['approve-note'] = { value: '' };
  elements['approve-confirm-btn'] = { disabled: false, textContent: '' };

  await context.confirmApprove();

  const updated = context.loadMemos().find(m => m.memoNo === 'ORB-2607-100');
  assert.equal(updated.status, 'completed', 'A2 is the last approver, so the memo really becomes completed');
  const entry = updated.auditLog.find(e => e.action.startsWith('A2 Approved'));
  assert.ok(entry, 'Approve must write an audit entry');
  assert.equal(entry.statusAfter, 'completed', 'audit entry must record the real resulting status, not "approved_a2" (a value memo.status never holds)');
});

test('confirmApprove records "pending_a3" (not "approved_a2") when a third approver is still outstanding', async () => {
  const { context, elements } = createContext();
  const memo = pendingMemo({
    status: 'pending_a2',
    approvers: [
      { profileId: 1, name: 'A1 Reviewer', title: 'Manager', status: 'approved', approvedAt: '2026-07-01T00:00:00.000Z', approvedBy: 'A1 Reviewer' },
      { profileId: 2, name: 'A2 Approver', title: 'Director', status: 'pending' },
      { profileId: 5, name: 'A3 Approver', title: 'VP', status: 'pending' },
    ],
  });
  context.storeMemos([memo]);
  context.checkSupa = async () => true; // confirmApprove sets throwOnSyncError:true
  elements['sb-user-btn'].dataset.profileId = '2'; // acting as A2
  elements['sb-uname'].textContent = 'A2 Approver';
  elements['approve-modal'] = { style: {}, dataset: { targets: JSON.stringify(['ORB-2607-100']) } };
  elements['approve-note'] = { value: '' };
  elements['approve-confirm-btn'] = { disabled: false, textContent: '' };

  await context.confirmApprove();

  const updated = context.loadMemos().find(m => m.memoNo === 'ORB-2607-100');
  assert.equal(updated.status, 'pending_a3', 'A3 is still outstanding');
  const entry = updated.auditLog.find(e => e.action.startsWith('A2 Approved'));
  assert.equal(entry.statusAfter, 'pending_a3', 'audit entry must match the real resulting status, not "approved_a2"');
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
