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
    type: 'sl',
    project: 'AOA-MP',
    subject: 'Software subscription',
    total: 12000,
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
  // Milestone 1A Task 1.3: self-bypass is a distinct 'bypassed' literal, not 'approved'.
  assert.equal(result.approvers[0].status, 'bypassed');
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
  assert.equal(context.loadActualSpendRecords().length, 0);

  userButton.dataset.profileId = '2';
  userName.textContent = 'นาย ปกรณ์ เจียมสกุลทิพย์';
  const afterA2 = await context.updateMemoStatusAsync(initial.memoNo, 'approved_a2', { approvedBy: userName.textContent });
  assert.equal(afterA2.status, 'completed');
  assert.ok(afterA2.approvedAt);
  assert.equal(afterA2.currentApproverProfileId, null);
  assert.equal(context.loadActualSpendRecords().length, 1);
  assert.equal(context.loadActualSpendRecords()[0].memoId, initial.memoNo);
  assert.equal(context.loadActualSpendRecords()[0].budgetStatus, 'Unbudgeted');
});

test('rejected and cancelled memos do not create Actual Spend', async () => {
  const { context } = createAppContext();
  const rejected = memo();
  vm.runInContext(`_memCache = [${JSON.stringify(rejected)}]`, context);
  await context.updateMemoStatusAsync(rejected.memoNo, 'rejected', { rejectedBy:'Approver' });
  assert.equal(context.loadActualSpendRecords().length, 0);

  const cancelled = memo({ memoNo:'ORB-2606-998' });
  vm.runInContext(`_memCache = [${JSON.stringify(cancelled)}]`, context);
  await context.updateMemoStatusAsync(cancelled.memoNo, 'cancelled', { cancelledBy:'Requester' });
  assert.equal(context.loadActualSpendRecords().length, 0);
});

test('completed memo posting is idempotent and manual Budget Pool override wins', () => {
  const { context } = createAppContext();
  const completed = memo({ status:'completed', approvedAt:'2026-06-30T00:00:00.000Z' });
  const pool = context.createBudgetPoolRecord({
    id:'manual-pool', project:'AOA-MP', budget:50000,
    spendTypes:['Software'], startDate:'2026-01', endDate:'2026-12',
  });
  context.syncMemoToActualSpend(completed, [pool]);
  context.syncMemoToActualSpend(completed, [pool]);
  assert.equal(context.loadActualSpendRecords().length, 1);
  const overridden = context.updateActualSpendBudgetOverride(completed.memoNo, pool.id, [pool]);
  assert.equal(overridden.finalBudgetPoolId, pool.id);
  assert.equal(overridden.budgetStatus, 'Manual Override');
});

test('All Memo reuses the Budget column for canonical status and manual override', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  assert.match(historyCode, /getMemoActualSpend/);
  assert.match(historyCode, /budgetStatus/);
  assert.match(historyCode, /updateActualSpendBudgetOverride/);
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

// ── Milestone 1A — Task 1.2: shared audit helper ──
test('appendAuditLog is defined once in app.js (single source of truth)', () => {
  const pendingCode = fs.readFileSync(path.join(root, 'views/pending.js'), 'utf8');
  assert.match(appCode, /function appendAuditLog\(/);
  assert.doesNotMatch(pendingCode, /function appendAuditLog\(/);
});

test('appendAuditLog appends a structured entry with actor, timestamps, and defaults', () => {
  const { context, userButton, userName } = createAppContext();
  userButton.dataset.profileId = '3';
  userName.textContent = 'นางสาว ชื่นกมล สารมานิตย์';
  const memos = [memo({ auditLog: [] })];
  context.appendAuditLog(memos, memos[0].memoNo, 'Rejected by X', 'Budget issue', {
    statusBefore: 'pending',
    statusAfter: 'rejected',
  });
  const entry = memos[0].auditLog.at(-1);
  assert.equal(entry.action, 'Rejected by X');
  assert.equal(entry.comment, 'Budget issue');
  assert.equal(entry.actor, 'นางสาว ชื่นกมล สารมานิตย์');
  assert.equal(entry.actorProfileId, 3);
  assert.equal(entry.statusBefore, 'pending');
  assert.equal(entry.statusAfter, 'rejected');
  assert.equal(entry.evidenceUrl, null);
  assert.equal(entry.channel, 'in-app');
  assert.ok(entry.timestamp);
});

test('appendAuditLog is a no-op when the memo number is not found', () => {
  const { context } = createAppContext();
  const memos = [memo({ auditLog: [] })];
  context.appendAuditLog(memos, 'NOT-A-REAL-MEMO', 'Rejected', 'x');
  assert.equal(memos[0].auditLog.length, 0);
});

// ── Milestone 1A — Task 1.3: approval-step literal statuses ──
test('isApproverStepResolved treats approved, bypassed, and overridden as resolved', () => {
  const { context } = createAppContext();
  assert.equal(context.isApproverStepResolved('approved'), true);
  assert.equal(context.isApproverStepResolved('bypassed'), true);
  assert.equal(context.isApproverStepResolved('overridden'), true);
  assert.equal(context.isApproverStepResolved('pending'), false);
  assert.equal(context.isApproverStepResolved('rejected'), false);
  assert.equal(context.isApproverStepResolved(undefined), false);
});

test('PMO override to rejected marks the current pending step as overridden, not rejected', async () => {
  const { context, userButton, userName } = createAppContext();
  userButton.dataset.profileId = '';
  userButton.dataset.isPmo = 'true';
  userName.textContent = 'PMO Officer';
  const initial = memo({
    status: 'pending_a2',
    approvers: [
      { profileId: 1, name: 'นาย นวพล งามวรโรจน์สกุล', title: 'Director', status: 'approved', approvedAt: '2026-06-29T10:00:00.000Z' },
      { profileId: 2, name: 'นาย ปกรณ์ เจียมสกุลทิพย์', title: 'CEO', status: 'pending' },
    ],
  });
  vm.runInContext(`_memCache = [${JSON.stringify(initial)}]`, context);

  const updated = await context.updateMemoStatusAsync(initial.memoNo, 'rejected', {
    pmoOverrideNote: 'Rejected via email approval',
    pmoOverrideBy: 'PMO Officer',
  });

  assert.equal(updated.status, 'rejected');
  const step = updated.approvers[1]; // A2 was the pending step on a pending_a2 memo
  assert.equal(step.status, 'overridden');
  assert.equal(step.overriddenBy, 'PMO Officer');
  assert.equal(step.overrideNote, 'Rejected via email approval');
  assert.ok(step.overriddenAt);
});

test('a genuine (non-override) reject still marks the pending step as rejected', async () => {
  const { context } = createAppContext();
  const initial = memo({ status: 'pending_a2' });
  vm.runInContext(`_memCache = [${JSON.stringify(initial)}]`, context);

  // Simulate confirmReject's local pre-update to 'rejected' before calling
  // updateMemoStatusAsync, matching views/pending.js's actual call order.
  vm.runInContext(`_memCache[0] = {..._memCache[0], status:'rejected'}`, context);
  const updated = await context.updateMemoStatusAsync(initial.memoNo, 'rejected', {
    rejectedBy: 'นาย ปกรณ์ เจียมสกุลทิพย์',
  });

  // Terminal-state guard returns the memo unchanged when it's already
  // terminal and this isn't a PMO override — confirms the existing
  // (pre-Milestone-1A) short-circuit behavior for this call order is unchanged.
  assert.equal(updated.status, 'rejected');
  assert.equal(updated.approvers[1].status, 'pending');
});

// ── Milestone 1A — Task 1.4: shared status/badge vocabulary consolidation ──
test('memoStatusKey/histStatusLabel/histStatusBadgeClass are defined once in app.js', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  assert.match(appCode, /function memoStatusKey\(/);
  assert.match(appCode, /function histStatusLabel\(/);
  assert.match(appCode, /function histStatusBadgeClass\(/);
  assert.doesNotMatch(historyCode, /function memoStatusKey\(/);
  assert.doesNotMatch(historyCode, /function histStatusLabel\(/);
  assert.doesNotMatch(historyCode, /function histStatusBadgeClass\(/);
});

test('histStatusLabel and histStatusBadgeClass cover every known memo status unchanged', () => {
  const { context } = createAppContext();
  const cases = [
    ['draft', 'Draft', 'badge-gray'],
    ['pending', 'Pending A1', 'badge-amber'],
    ['pending_a2', 'Pending A2', 'badge-amber'],
    ['pending_a3', 'Pending A3', 'badge-amber'],
    ['completed', 'Completed', 'badge-green'],
    ['rejected', 'Rejected', 'badge-red'],
    ['cancelled', 'Cancelled', 'badge-gray'],
  ];
  cases.forEach(([status, label, badge]) => {
    const m = memo({ status });
    assert.equal(context.histStatusLabel(m), label, `label for ${status}`);
    assert.equal(context.histStatusBadgeClass(m), badge, `badge for ${status}`);
  });
  // A falsy status defaults to Pending A1, matching memoStatusKey's fallback.
  assert.equal(context.memoStatusKey({}), 'pending');
});

// ══════════════════════════════════════════════════════════════════
// Milestone 1B — Void (memo-side lifecycle)
// ══════════════════════════════════════════════════════════════════

test('PMO can void a completed memo: reason required, audit logged, excluded from Actual Spend', async () => {
  const { context, userButton, userName } = createAppContext();
  userButton.dataset.isPmo = 'true';
  const completed = memo({ status: 'completed', approvedAt: '2026-06-30T00:00:00.000Z' });
  vm.runInContext(`_memCache = [${JSON.stringify(completed)}]`, context);
  context.syncMemoToActualSpend(completed);
  assert.equal(context.loadActualSpendRecords().length, 1, 'sanity: Actual Spend exists before voiding');

  const result = await context.voidMemoAsync(completed.memoNo, 'Wrong vendor selected');
  assert.equal(result.ok, true);
  assert.equal(result.memo.status, 'voided');
  assert.equal(result.memo.voidedBy, userName.textContent);
  assert.equal(result.memo.voidReason, 'Wrong vendor selected');
  assert.equal(result.memo.voidEvidenceUrl, null, 'evidence is optional — null when omitted');
  assert.ok(result.memo.voidedAt);
  assert.equal(context.loadActualSpendRecords().length, 0, 'excluded from Budget & Spend Actual');

  const auditEntry = result.memo.auditLog.at(-1);
  assert.match(auditEntry.action, /^Voided by/);
  assert.equal(auditEntry.statusBefore, 'completed');
  assert.equal(auditEntry.statusAfter, 'voided');
});

test('Void stores evidence when provided (evidence remains optional otherwise)', async () => {
  const { context, userButton } = createAppContext();
  userButton.dataset.isPmo = 'true';
  const completed = memo({ status: 'completed' });
  vm.runInContext(`_memCache = [${JSON.stringify(completed)}]`, context);
  const result = await context.voidMemoAsync(completed.memoNo, 'reason', 'https://example.com/evidence.pdf');
  assert.equal(result.ok, true);
  assert.equal(result.memo.voidEvidenceUrl, 'https://example.com/evidence.pdf');
  assert.equal(result.memo.auditLog.at(-1).evidenceUrl, 'https://example.com/evidence.pdf');
});

test('Void requires a non-empty reason', async () => {
  const { context, userButton } = createAppContext();
  userButton.dataset.isPmo = 'true';
  const completed = memo({ status: 'completed' });
  vm.runInContext(`_memCache = [${JSON.stringify(completed)}]`, context);
  const result = await context.voidMemoAsync(completed.memoNo, '   ');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'reason_required');
  assert.equal(context.loadMemos().find(m => m.memoNo === completed.memoNo).status, 'completed');
});

test('only PMO/Admin can void — a non-PMO user is rejected', async () => {
  const { context, userButton } = createAppContext();
  userButton.dataset.isPmo = 'false';
  const completed = memo({ status: 'completed' });
  vm.runInContext(`_memCache = [${JSON.stringify(completed)}]`, context);
  const result = await context.voidMemoAsync(completed.memoNo, 'reason');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'forbidden');
});

test('only an Approved/completed memo can be voided', async () => {
  const { context, userButton } = createAppContext();
  userButton.dataset.isPmo = 'true';
  for (const status of ['draft', 'pending', 'pending_a2', 'rejected', 'cancelled']) {
    const m = memo({ status, memoNo: `ORB-${status}` });
    vm.runInContext(`_memCache = [${JSON.stringify(m)}]`, context);
    const result = await context.voidMemoAsync(m.memoNo, 'reason');
    assert.equal(result.ok, false, `status ${status} should not be voidable`);
    assert.equal(result.error, 'invalid_status');
  }
});

test('a voided memo remains visible via loadMemos (All Memo/History)', async () => {
  const { context, userButton } = createAppContext();
  userButton.dataset.isPmo = 'true';
  const completed = memo({ status: 'completed' });
  vm.runInContext(`_memCache = [${JSON.stringify(completed)}]`, context);
  await context.voidMemoAsync(completed.memoNo, 'reason');
  const visible = context.loadMemos().find(m => m.memoNo === completed.memoNo);
  assert.ok(visible, 'voided memo must still be visible — only "deleted" is hidden, not "voided"');
  assert.equal(visible.status, 'voided');
});

test('a voided memo can be duplicated into a clean new draft with void metadata cleared', () => {
  const { context } = createAppContext();
  const voided = memo({
    status: 'voided', voidedAt: '2026-07-03T00:00:00.000Z', voidedBy: 'PMO Officer',
    voidReason: 'wrong vendor', voidEvidenceUrl: 'https://example.com/e.pdf',
  });
  const draft = context.draftFromMemo(voided, voided.memoNo);
  assert.equal(draft.status, 'draft');
  assert.equal(draft.voidedAt, undefined);
  assert.equal(draft.voidedBy, undefined);
  assert.equal(draft.voidReason, undefined);
  assert.equal(draft.voidEvidenceUrl, undefined);
  assert.equal(draft.deleted, false);
});

test('History detail Duplicate action is available for Voided memos', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  assert.match(historyCode, /\(isCompleted\|\|isCancelled\|\|isPending\|\|isVoided\) && !isDraft/);
});

test('History detail offers a PMO-only Void action for completed memos', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  assert.match(historyCode, /isPMOUser && isCompleted[\s\S]{0,120}openVoidModal/);
});

// ── Device downstream guard ──
test('Void is blocked when Device Registry downstream records already exist for the memo', async () => {
  const { context, userButton } = createAppContext();
  userButton.dataset.isPmo = 'true';
  const completed = memo({ type: 'hw', status: 'completed', memoNo: 'HW-001' });
  vm.runInContext(`_memCache = [${JSON.stringify(completed)}]`, context);
  vm.runInContext(`function loadDevices() { return [{ id:'dev1', memoNo:'HW-001' }]; }`, context);
  const result = await context.voidMemoAsync(completed.memoNo, 'reason');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'downstream_blocked');
  assert.equal(result.message, 'This memo has already created downstream records. Please resolve downstream records before voiding.');
  assert.equal(context.loadMemos().find(m => m.memoNo === 'HW-001').status, 'completed', 'blocked void must not change status');
});

test('Void is allowed when a Purchase Order exists but no device has arrived yet', async () => {
  const { context, userButton } = createAppContext();
  userButton.dataset.isPmo = 'true';
  const completed = memo({ type: 'hw', status: 'completed', memoNo: 'HW-002' });
  vm.runInContext(`_memCache = [${JSON.stringify(completed)}]`, context);
  vm.runInContext(`function loadDevices() { return []; }`, context); // PO exists, no device rows yet
  const result = await context.voidMemoAsync(completed.memoNo, 'reason');
  assert.equal(result.ok, true);
  assert.equal(result.memo.status, 'voided');
});

// ── License exclusion (already-correct code, pinned against regression) ──
test('memo-derived license parsing gates on completed status, so Voided memos are excluded automatically', () => {
  const licenseCode = fs.readFileSync(path.join(root, 'views/license.js'), 'utf8');
  assert.match(licenseCode, /memo\.type !== 'sl' \|\| memo\.status !== 'completed'/);
  assert.match(licenseCode, /m\.type === 'sl' && m\.status === 'completed'/);
});

// ══════════════════════════════════════════════════════════════════
// Milestone 1B — Draft soft delete
// ══════════════════════════════════════════════════════════════════

test('soft-deleting a draft sets deleted metadata and keeps status as draft', async () => {
  const { context, userName } = createAppContext();
  const draft = memo({ status: 'draft', memoNo: 'DRAFT-001' });
  vm.runInContext(`_memCache = [${JSON.stringify(draft)}]`, context);
  const updated = await context.updateMemoStatusAsync(draft.memoNo, 'draft', {
    deleted: true, deletedAt: '2026-07-03T00:00:00.000Z', deletedBy: userName.textContent,
  });
  assert.equal(updated.status, 'draft');
  assert.equal(updated.deleted, true);
  assert.equal(updated.deletedBy, userName.textContent);
  assert.ok(updated.deletedAt);
});

test('a soft-deleted draft disappears from loadMemos() (all normal views) immediately', async () => {
  const { context } = createAppContext();
  const draft = memo({ status: 'draft', memoNo: 'DRAFT-002' });
  vm.runInContext(`_memCache = [${JSON.stringify(draft)}]`, context);
  await context.updateMemoStatusAsync(draft.memoNo, 'draft', { deleted: true, deletedAt: 'x', deletedBy: 'y' });
  assert.equal(context.loadMemos().find(m => m.memoNo === draft.memoNo), undefined);
});

test('a soft-deleted draft stays hidden after a simulated reload (loadMemosAsync re-fetch)', async () => {
  const { context } = createAppContext();
  const draft = memo({ status: 'draft', memoNo: 'DRAFT-003', deleted: true, deletedAt: 'x', deletedBy: 'y' });
  // Simulate what a fresh Supabase row would look like after dbToMemo mapping —
  // deleted is already true, exactly as it would be after a real reload.
  vm.runInContext(`_memCache = null`, context);
  vm.runInContext(`_memMemos = [${JSON.stringify(draft)}]`, context);
  const reloaded = await context.loadMemosAsync();
  assert.equal(reloaded.find(m => m.memoNo === 'DRAFT-003'), undefined);
});

test('deleteDraft (views/history.js) performs a soft delete, not a hard removal', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  assert.match(historyCode, /deleted:\s*true/);
  assert.match(historyCode, /memo\.status !== 'draft'/, 'must guard: only Draft is user-deletable');
  assert.doesNotMatch(historyCode, /loadMemos\(\)\.filter\(m => m\.memoNo !== memoNo\)/);
});

// ══════════════════════════════════════════════════════════════════
// Milestone 1B — Memo number reuse
// ══════════════════════════════════════════════════════════════════

test('memo number reuse blocks draft/pending/completed/voided but allows rejected/cancelled', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  assert.match(
    createCode,
    /MEMO_NO_BLOCKING_STATUSES = new Set\(\['draft', 'pending', 'pending_a2', 'pending_a3', 'completed', 'voided'\]\)/
  );
  assert.doesNotMatch(createCode, /MEMO_NO_BLOCKING_STATUSES[\s\S]{0,80}'rejected'/);
  assert.doesNotMatch(createCode, /MEMO_NO_BLOCKING_STATUSES[\s\S]{0,80}'cancelled'/);
});

test('a soft-deleted Draft does not block memo number reuse (business rule correction)', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  // The uniqueness pre-check must fetch `deleted` and exclude deleted rows from blocking,
  // even though `deleted:true` rows are still literally status 'draft'.
  assert.match(createCode, /select=memo_no,status,deleted/);
  assert.match(createCode, /conflict && !conflict\.deleted && MEMO_NO_BLOCKING_STATUSES\.has\(conflict\.status\)/);
});
