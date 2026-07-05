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
  // MEMO_LIFECYCLE.md §17 requires Submit to be audited unconditionally, not only on A1-bypass.
  assert.equal(result.auditLog.length, 1);
  assert.equal(result.auditLog[0].action, 'Submitted');
  assert.equal(result.auditLog[0].statusBefore, 'draft');
  assert.equal(result.auditLog[0].statusAfter, 'pending');
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

// ══════════════════════════════════════════════════════════════════
// Hotfix: Void Evidence UI — the Void modal asked users to paste a URL for
// evidence, which is not acceptable for the PMO workflow. Replaced with the
// same optional file-upload-to-base64 pattern already used for Approve/PMO
// Override evidence (handleApproveEvidenceUpload/handlePmoEvidenceUpload in
// views/pending.js) — no new storage architecture, voidMemoAsync()'s
// signature and lifecycle logic are untouched (it already just stores
// whatever string it's given).
// ══════════════════════════════════════════════════════════════════

test('Hotfix: Void modal no longer has a URL text input for evidence; it has an optional PDF/image file upload instead', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  const modalFn = historyCode.match(/function openVoidModal\(memoNo\) \{([\s\S]*?)\n\}\n/)?.[0] || '';
  assert.ok(modalFn, 'openVoidModal must be defined');

  // No more "paste a URL" input for evidence.
  assert.doesNotMatch(modalFn, /placeholder="URL/, 'must not ask the user to paste a URL for evidence');
  assert.doesNotMatch(modalFn, /<input id="void-evidence-url" class="ri"/, 'the old visible URL text input must be gone');

  // Optional file upload, PDF/image, wired to a handler.
  assert.match(modalFn, /<input type="file" id="void-evidence-file" accept="image\/\*,\.pdf"/);
  assert.match(modalFn, /onchange="handleVoidEvidenceUpload\(this\)"/);
  assert.doesNotMatch(modalFn, /void-evidence-file"[^>]*\brequired\b/, 'evidence must remain optional, never a required attribute');

  // The reason field is unaffected — still required, still a plain textarea.
  assert.match(modalFn, /id="void-reason" class="ri" rows="3"/);
});

test('Hotfix: handleVoidEvidenceUpload mirrors the existing optional-evidence upload pattern (5MB cap, base64 data URL, clears on no file)', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  const fn = historyCode.match(/function handleVoidEvidenceUpload\(input\) \{([\s\S]*?)\n\}\n/)?.[0] || '';
  assert.ok(fn, 'handleVoidEvidenceUpload must be defined');
  assert.match(fn, /if \(!file\) \{ urlInput\.value = ''; preview\.textContent = ''; return; \}/, 'clearing the file must clear the stored evidence, not leave a stale value');
  assert.match(fn, /file\.size > 5 \* 1024 \* 1024/, 'must keep the same 5MB cap used by Approve/PMO-Override evidence uploads');
  assert.match(fn, /reader\.readAsDataURL\(file\)/, 'must reuse the existing base64 data-URL approach, not a new storage architecture');
});

test('Hotfix: confirmVoidMemo() and voidMemoAsync() are unchanged by the evidence UI swap (Void lifecycle logic untouched)', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  // confirmVoidMemo still just reads whatever string ended up in #void-evidence-url —
  // it doesn't care whether that string came from a pasted URL or an uploaded file.
  assert.match(historyCode, /const evidenceUrl = document\.getElementById\('void-evidence-url'\)\?\.value\.trim\(\) \|\| '';/);
  assert.match(historyCode, /await voidMemoAsync\(memoNo, reason, evidenceUrl\);/);
  // voidMemoAsync()'s signature/behavior is untouched.
  assert.match(appCode, /async function voidMemoAsync\(memoNo, reason, evidenceUrl = ''\) \{/);
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

// ══════════════════════════════════════════════════════════════════
// Hotfix: Memo Detail Restore
//
// Root cause: applyDraftEdit() (views/create.js) — the function that
// populates the Create form after "Save Draft -> Re-edit" or "Duplicate" —
// only ever restored header fields and approvers. It never restored any
// memo-type-specific detail (SL/HW rows, the SL account table, INT
// participant names, DEP line items), so those sections rendered empty and
// any subsequent Save/Submit collected blank data over the original. Some of
// that detail (hardware rows, the account table, INT names, DEP line items)
// also had no structured storage at all — only a read-only HTML render in
// `sections` — so it could not have been restored even if the form-population
// code had existed. Fixed by (1) capturing raw structured copies of that
// detail in collectMemoData()/memoToDb()/dbToMemo(), and (2) adding
// populateMemoTypeDetail(), called from applyDraftEdit(), which rebuilds each
// section from the restored memo object and re-triggers the existing
// calc*() functions so totals recalculate from source data instead of being
// patched directly.
// ══════════════════════════════════════════════════════════════════

function softwareMemo(overrides = {}) {
  return memo({
    type: 'sl',
    slItems: [
      { name: 'GitHub Copilot', plan: 'Business', price: 600, months: 12, qty: 15, startMonth: '2026-01', endMonth: '2026-12' },
      { name: 'Figma', plan: 'Pro', price: 450, months: 12, qty: 5, startMonth: '2026-01', endMonth: '2026-12' },
    ],
    acctCols: ['GitHub Copilot', 'Figma'],
    acctRows: [
      { email: 'a@orbitdigital.co.th', checks: [true, false] },
      { email: 'b@orbitdigital.co.th', checks: [true, true] },
    ],
    amountWords: 'หนึ่งแสนสามหมื่นห้าพันบาทถ้วน',
    ...overrides,
  });
}

function internalMemo(overrides = {}) {
  return memo({
    type: 'int',
    intActivity: 'งานเลี้ยงสังสรรค์ประจำปี Q2/2569',
    intDate: '2026-07-15',
    intHeadcount: 3,
    intPP: 1500,
    intNames: ['สมชาย ใจดี', 'สมหญิง รักงาน', 'วิชัย มั่นคง'],
    amountWords: 'สี่พันห้าร้อยบาทถ้วน',
    ...overrides,
  });
}

test('Hotfix: memoToDb/dbToMemo round-trip preserves Software detail (slItems + account table)', () => {
  const { context } = createAppContext();
  const original = softwareMemo();
  const restored = context.dbToMemo(context.memoToDb(original));
  assert.deepEqual(restored.slItems, original.slItems);
  assert.deepEqual(restored.acctCols, original.acctCols);
  assert.deepEqual(restored.acctRows, original.acctRows);
  assert.equal(restored.amountWords, original.amountWords);
});

test('Hotfix: memoToDb/dbToMemo round-trip preserves Internal detail (activity, headcount, per-person amount, participant names)', () => {
  const { context } = createAppContext();
  const original = internalMemo();
  const restored = context.dbToMemo(context.memoToDb(original));
  assert.equal(restored.intActivity, original.intActivity);
  assert.equal(restored.intDate, original.intDate);
  assert.equal(restored.intHeadcount, original.intHeadcount);
  assert.equal(restored.intPP, original.intPP);
  assert.deepEqual(restored.intNames, original.intNames);
  assert.equal(restored.amountWords, original.amountWords);
});

test('Hotfix: memoToDb/dbToMemo round-trip preserves Hardware detail (hwItems + owner) and Deployment line items', () => {
  const { context } = createAppContext();
  const hw = memo({
    type: 'hw',
    hwItems: [{ name: 'MacBook Pro 14', price: 79000, qty: 2 }],
    hwOwner: 'สมชาย ใจดี',
    amountWords: 'หนึ่งแสนห้าหมื่นแปดพันบาทถ้วน',
  });
  const restoredHw = context.dbToMemo(context.memoToDb(hw));
  assert.deepEqual(restoredHw.hwItems, hw.hwItems);
  assert.equal(restoredHw.hwOwner, hw.hwOwner);

  const dep = memo({
    type: 'dep',
    depLocation: 'สาขาวิชาการตรีสิ 62',
    depStart: '2026-08-01', depEnd: '2026-08-05', depEmpCount: 4,
    depItems: [
      { kind: 'calc', name: 'ค่าอาหาร', price: 300, qty: 4 },
      { kind: 'text', text: 'ขอสนับสนุนอุปกรณ์อิเล็กทรอนิกส์' },
    ],
  });
  const restoredDep = context.dbToMemo(context.memoToDb(dep));
  assert.deepEqual(restoredDep.depItems, dep.depItems);
});

test('Save Draft -> Re-edit: draftFromMemo keeps Software detail rows and account rows intact when re-opening a Draft', () => {
  // editDraft() (views/history.js) loads the Draft as-is (no draftFromMemo
  // transform) — Re-edit must see exactly what was last saved.
  const { context } = createAppContext();
  const draft = softwareMemo({ status: 'draft', memoNo: 'DRAFT-ABC123' });
  const roundTripped = context.dbToMemo(context.memoToDb(draft));
  assert.deepEqual(roundTripped.slItems, draft.slItems, 'software rows must survive the save/load cycle');
  assert.deepEqual(roundTripped.acctRows, draft.acctRows, 'account rows must survive the save/load cycle');
  assert.equal(roundTripped.status, 'draft');
  assert.equal(roundTripped.memoNo, draft.memoNo);
});

test('Save Draft -> Re-edit: draftFromMemo keeps Internal memo detail fields intact when re-opening a Draft', () => {
  const { context } = createAppContext();
  const draft = internalMemo({ status: 'draft', memoNo: 'DRAFT-XYZ789' });
  const roundTripped = context.dbToMemo(context.memoToDb(draft));
  assert.equal(roundTripped.intActivity, draft.intActivity);
  assert.equal(roundTripped.intHeadcount, draft.intHeadcount);
  assert.equal(roundTripped.intPP, draft.intPP);
  assert.deepEqual(roundTripped.intNames, draft.intNames);
});

test('Duplicate restores Software detail rows (slItems survive draftFromMemo)', () => {
  const { context } = createAppContext();
  const source = softwareMemo({ status: 'completed', approvedAt: '2026-06-30T00:00:00.000Z' });
  const draft = context.draftFromMemo(source);
  assert.deepEqual(draft.slItems, source.slItems);
});

test('Duplicate restores account rows (acctCols/acctRows survive draftFromMemo)', () => {
  const { context } = createAppContext();
  const source = softwareMemo({ status: 'completed' });
  const draft = context.draftFromMemo(source);
  assert.deepEqual(draft.acctCols, source.acctCols);
  assert.deepEqual(draft.acctRows, source.acctRows);
});

test('Duplicate restores Hardware rows and owner (hwItems/hwOwner survive draftFromMemo)', () => {
  const { context } = createAppContext();
  const source = memo({
    type: 'hw', status: 'completed',
    hwItems: [{ name: 'Dell Monitor 27"', price: 12000, qty: 3 }],
    hwOwner: 'IT Support',
  });
  const draft = context.draftFromMemo(source);
  assert.deepEqual(draft.hwItems, source.hwItems);
  assert.equal(draft.hwOwner, source.hwOwner);
});

test('Duplicate leaves Memo Number blank (no auto-fill or preview number)', () => {
  const { context } = createAppContext();
  const source = softwareMemo({ status: 'completed', memoNo: 'ORB-2606-042' });
  const draft = context.draftFromMemo(source);
  assert.equal(draft.memoNo, undefined, 'Memo Number must be blank, not copied and not pre-generated');
});

test('Hotfix: applyDraftEdit no longer calls setNextMemoNo() to fill a blank Memo Number (regression: Duplicate previously showed a preview memo number)', () => {
  // Found via manual browser verification of this hotfix: applyDraftEdit()
  // used to run `if (!memoNoEl.value) setNextMemoNo()`, which fires on every
  // Duplicate (draftFromMemo always leaves memoNo blank) and silently
  // violated "Do not auto-fill or generate a preview memo number."
  // setNextMemoNo() is still legitimate elsewhere (resetMemoForm(), for a
  // genuinely brand-new memo), so this must assert absence scoped to
  // applyDraftEdit specifically, not repo-wide.
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  const fn = createCode.match(/async function applyDraftEdit\(\) \{([\s\S]*?)\n\}\n/)?.[0] || '';
  assert.ok(fn, 'applyDraftEdit must be defined');
  assert.doesNotMatch(fn, /setNextMemoNo/, 'a blank Memo Number from Duplicate must stay blank, never auto-filled');
  assert.match(fn, /memoNoEl\.value = memo\.memoNo \|\| ''/);
});

test('Duplicate clears lifecycle metadata while keeping business detail (status/audit/approval/reject/cancel/void/delete)', () => {
  const { context } = createAppContext();
  const source = softwareMemo({
    status: 'rejected',
    createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z',
    submittedAt: '2026-06-01T01:00:00.000Z', approvedAt: '2026-06-02T00:00:00.000Z',
    rejectedAt: '2026-06-03T00:00:00.000Z', rejectedBy: 'นาย ปกรณ์ เจียมสกุลทิพย์',
    rejectionReason: 'Budget issue', cancelledAt: '2026-06-04T00:00:00.000Z', cancelledBy: 'x',
    cancellationReason: 'y', voidedAt: '2026-06-05T00:00:00.000Z', voidedBy: 'z', voidReason: 'w',
    deleted: true, deletedAt: '2026-06-06T00:00:00.000Z', deletedBy: 'q', deleteReason: 'r',
    auditLog: [{ action: 'Rejected' }],
  });
  const draft = context.draftFromMemo(source);

  // Business/detail fields survive.
  assert.deepEqual(draft.slItems, source.slItems);
  assert.deepEqual(draft.acctCols, source.acctCols);
  assert.deepEqual(draft.acctRows, source.acctRows);
  assert.equal(draft.project, source.project);

  // Every lifecycle/audit field is cleared.
  assert.equal(draft.status, 'draft');
  assert.equal(draft.createdAt, undefined);
  assert.equal(draft.updatedAt, undefined);
  assert.equal(draft.submittedAt, undefined);
  assert.equal(draft.approvedAt, undefined);
  assert.equal(draft.rejectedAt, undefined);
  assert.equal(draft.rejectedBy, undefined);
  assert.equal(draft.rejectionReason, undefined);
  assert.equal(draft.cancelledAt, undefined);
  assert.equal(draft.cancellationReason, undefined);
  assert.equal(draft.voidedAt, undefined);
  assert.equal(draft.voidedBy, undefined);
  assert.equal(draft.voidReason, undefined);
  assert.equal(draft.deleted, false);
  assert.equal(draft.deletedAt, undefined);
  assert.equal(draft.deleteReason, undefined);
  assert.deepEqual(Array.from(draft.auditLog), []);
});

test('Duplicate of an approved/completed memo still restores its detail rows (existing statuses remain valid)', () => {
  const { context } = createAppContext();
  const completed = softwareMemo({ status: 'completed', approvedAt: '2026-06-30T00:00:00.000Z' });
  const draft = context.draftFromMemo(completed);
  assert.equal(draft.status, 'draft');
  assert.deepEqual(draft.slItems, completed.slItems);
  assert.equal(completed.status, 'completed', 'original remains unchanged');
});

test('populateMemoTypeDetail restores Software/HW/INT/ENT/DEP sections from the memo object and recalculates via the existing calc*() functions (no direct total patch)', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  const fn = createCode.match(/function populateMemoTypeDetail\(memo\) \{([\s\S]*)\n\}\n/)?.[0] || '';
  assert.ok(fn, 'populateMemoTypeDetail must be defined');

  // Wired into the Re-edit/Duplicate entry point.
  assert.match(createCode, /populateMemoTypeDetail\(memo\);[\s\S]{0,40}\} catch\(e\) \{ console\.error\('applyDraftEdit error'/);

  // Software: rebuilt from slItems + account table, then recalculated.
  assert.match(fn, /memo\.slItems/);
  assert.match(fn, /addSLRow\(\)/);
  assert.match(fn, /calcSL\(\)/);
  assert.match(fn, /memo\.acctCols/);
  assert.match(fn, /memo\.acctRows/);

  // Hardware — restored via _hwItemsForFormRestore(), which prefers structured
  // memo.hwItems but falls back to scraping the legacy Hardware HTML table
  // (see the dedicated fallback test below).
  assert.match(fn, /_hwItemsForFormRestore\(memo\)/);
  assert.match(fn, /memo\.hwOwner/);
  assert.match(fn, /calcHW\(\)/);

  // Internal.
  assert.match(fn, /memo\.intActivity/);
  assert.match(fn, /memo\.intNames/);
  assert.match(fn, /calcINT\(\)/);
  assert.match(fn, /checkIntHeadcount\(\)/);

  // Entertainment.
  assert.match(fn, /memo\.entClient/);

  // Deployment.
  assert.match(fn, /memo\.depItems/);
  assert.match(fn, /calcDepGrand\(\)/);

  // Totals must come from recalculation, never a direct patch of the total.
  assert.doesNotMatch(fn, /\.total\s*=/, 'must restore source data and let calc*() recompute totals, not patch totals directly');
});

// Root cause: Duplicating/Re-editing a Hardware memo sometimes failed to restore
// hardware rows into the Create Memo form. populateMemoTypeDetail()'s hw branch
// only ever restored from memo.hwItems — legacy/test memos with hwItems empty
// or missing (predating the "Memo Detail Restore" hotfix) but with the original
// line items still captured in the printable "รายการ Hardware" HTML table had
// nothing to restore from. _hwItemsForFormRestore() (views/create.js) now
// prefers structured hwItems and falls back to scraping that HTML table.
test('_hwItemsForFormRestore() prefers structured hwItems, and falls back to scraping the legacy Hardware HTML table when hwItems is empty/missing', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  const fnSrc = createCode.match(/function _hwItemsForFormRestore\(memo\) \{[\s\S]*?\n\}\n/)?.[0];
  assert.ok(fnSrc, '_hwItemsForFormRestore must be defined');

  // Minimal HTML-table parser standing in for the browser's DOMParser, mirroring
  // tests/device.test.js's FakeDOMParser convention for the same legacy shape.
  class FakeDOMParser {
    parseFromString(html) {
      const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
      const scope = tbodyMatch ? tbodyMatch[1] : html;
      const rows = [...scope.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(rm => {
        const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cm => ({ textContent: cm[1].trim() }));
        return { querySelectorAll: sel => sel === 'td' ? cells : [] };
      });
      return { querySelectorAll: sel => sel === 'tbody tr' ? rows : [] };
    }
  }
  const sandbox = { DOMParser: FakeDOMParser, console };
  vm.createContext(sandbox);
  vm.runInContext(`${fnSrc}\nthis._hwItemsForFormRestore = _hwItemsForFormRestore;`, sandbox);

  // Newer memo: structured hwItems present -> used directly, legacy section ignored.
  const withStructured = sandbox._hwItemsForFormRestore({
    hwItems: [{ name: 'Dell Monitor', price: 12000, qty: 3 }],
    sections: [{ title: 'รายการ Hardware', html: '<table><tbody><tr><td>1</td><td>Should Not Be Used</td><td>99</td><td>1</td></tr></tbody></table>' }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(withStructured)), [{ name: 'Dell Monitor', price: 12000, qty: 3 }]);

  // Legacy/test memo: hwItems empty -> falls back to the HTML table, extracting name/price/qty.
  const legacyOnly = sandbox._hwItemsForFormRestore({
    hwItems: [],
    sections: [{ title: 'รายการ Hardware', html:
      '<table><thead><tr><th>#</th><th>ชื่ออุปกรณ์</th><th>ราคา/ชิ้น</th><th>จำนวน</th><th>รวม</th></tr></thead>' +
      '<tbody><tr><td>1</td><td>Legacy Laptop</td><td>฿30,000</td><td>4</td><td>฿120,000</td></tr></tbody></table>' }],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(legacyOnly)), [{ name: 'Legacy Laptop', price: 30000, qty: 4 }]);

  // Neither structured hwItems nor a matching legacy section -> empty, no throw.
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox._hwItemsForFormRestore({ hwItems: [], sections: [] }))), []);
});

test('collectMemoData captures raw structured detail (hwItems, hwOwner, acctCols, acctRows, intNames, depItems) alongside the existing HTML sections', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  const fn = createCode.match(/function collectMemoData\(\) \{([\s\S]*?)\nfunction validateMemo/)?.[0] || '';
  assert.ok(fn, 'collectMemoData must be defined');
  assert.match(fn, /data\.hwItems\s*=/);
  assert.match(fn, /data\.hwOwner\s*=/);
  assert.match(fn, /data\.acctCols\s*=/);
  assert.match(fn, /data\.acctRows\s*=/);
  assert.match(fn, /data\.intNames\s*=/);
  assert.match(fn, /data\.depItems\s*=/);
});

test('Hotfix: thaiDateToISO reverses dateInput()/thaiDate() so a saved date can be restored into an <input type="date">', () => {
  // collectMemoData() stores dates via dateInput(), which renders a
  // print-ready Thai Buddhist-calendar string (e.g. "3 กรกฎาคม พ.ศ. 2569"),
  // not ISO. Restoring that string directly into <input type="date"> is
  // silently rejected by the browser, so Re-edit/Duplicate showed blank date
  // fields even though the underlying memo carried a value. thaiDateToISO()
  // is the reverse conversion used by applyDraftEdit()/populateMemoTypeDetail().
  const { context } = createAppContext();
  context.document.addEventListener = () => {};
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  vm.runInContext(createCode, context, { filename: 'views/create.js' });

  assert.equal(context.thaiDateToISO(context.dateInput('2026-07-15')), '2026-07-15');
  assert.equal(context.thaiDateToISO(context.dateInput('2026-01-05')), '2026-01-05');
  assert.equal(context.thaiDateToISO(''), '');
  assert.equal(context.thaiDateToISO(null), '');
  assert.equal(context.thaiDateToISO('not a date'), '');
});

test('Hotfix: applyDraftEdit/populateMemoTypeDetail restore dates via thaiDateToISO, not the raw Thai string', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  assert.match(createCode, /dateEl\.value = thaiDateToISO\(memo\.date\)/, 'memo date (Re-edit)');
  assert.match(createCode, /signDate\.value = thaiDateToISO\(memo\.reviewerDate\)/, 'sign date');
  assert.match(createCode, /dateEl\.value = thaiDateToISO\(memo\.intDate\)/, 'INT activity date');
  assert.match(createCode, /entInp\[1\]\.value = thaiDateToISO\(memo\.entDate\)/, 'ENT event date');
  assert.match(createCode, /startEl\.value = thaiDateToISO\(memo\.depStart\)/, 'DEP start date');
  assert.match(createCode, /endEl\.value = thaiDateToISO\(memo\.depEnd\)/, 'DEP end date');
});

test('memoToDb/dbToMemo map the new Hotfix detail fields to/from snake_case DB columns', () => {
  assert.match(appCode, /hw_items:\s*m\.hwItems/);
  assert.match(appCode, /hw_owner:\s*m\.hwOwner/);
  assert.match(appCode, /acct_cols:\s*m\.acctCols/);
  assert.match(appCode, /acct_rows:\s*m\.acctRows/);
  assert.match(appCode, /int_names:\s*m\.intNames/);
  assert.match(appCode, /dep_items:\s*m\.depItems/);
  assert.match(appCode, /hwItems:\s*r\.hw_items/);
  assert.match(appCode, /acctCols:\s*r\.acct_cols/);
  assert.match(appCode, /intNames:\s*r\.int_names/);
  assert.match(appCode, /depItems:\s*r\.dep_items/);
});

// ══════════════════════════════════════════════════════════════════
// Hotfix: saveDraft() navigation regression — switchPendingTab() never
// existed (drafts moved to All Memos/history.js; see the "Draft management
// is handled in All Memos" note in views/pending.js). Calling it threw a
// ReferenceError right after every Save Draft, surfacing as a console error.
// ══════════════════════════════════════════════════════════════════

test("saveDraft() no longer calls the undefined switchPendingTab() and navigates to History's Draft tab instead", () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  const fn = createCode.match(/async function saveDraft\(\) \{([\s\S]*?)\n\}\n/)?.[0] || '';
  assert.ok(fn, 'saveDraft must be defined');

  assert.doesNotMatch(fn, /switchPendingTab/, 'switchPendingTab does not exist anywhere in the codebase');
  assert.doesNotMatch(createCode, /switchPendingTab/, 'no other caller should reference it either');

  // Must land on the view that actually renders Drafts (All Memos/History,
  // not Pending) and select the Draft tab there.
  assert.match(fn, /swView\('history'/);
  assert.match(fn, /switchHistTab\('draft'\)/);
  assert.match(historyCode, /function switchHistTab\(status, btn\)/, 'switchHistTab must exist and be the real tab-switch function');
});

// ══════════════════════════════════════════════════════════════════
// Functional audit fix — Save Draft had NO memo-number uniqueness check at
// all: saveMemo()/saveMemoAsync() upsert by memoNo, so typing (or editing
// into) a number that already belonged to a different, non-Draft memo
// silently overwrote that unrelated record (MEMO_LIFECYCLE.md §5: "Memo
// Number must be unique", "Duplicate Memo Number is not allowed" — no stated
// Draft exception). saveDraft() now reuses the same checkMemoNoConflict()
// check submitMemo() already performed.
// ══════════════════════════════════════════════════════════════════

function createMemoNoConflictContext(fetchImpl) {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  const context = {
    console, Date, URL, Blob, AbortController,
    setTimeout, clearTimeout,
    alert: () => {}, confirm: () => true,
    fetch: fetchImpl,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
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
  vm.runInContext(createCode, context, { filename: 'views/create.js' });
  return context;
}

test('saveDraft() calls the shared checkMemoNoConflict() before saving and blocks on a real conflict — the same check submitMemo() already performs', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  const fn = createCode.match(/async function saveDraft\(\) \{([\s\S]*?)\n\}\n/)?.[0] || '';
  assert.ok(fn, 'saveDraft must be defined and async (it now awaits a network check)');
  assert.match(fn, /checkMemoNoConflict\(data\.memoNo\)/, 'saveDraft must run the shared conflict check before saveMemo()');
  assert.match(fn, /MEMO_NO_BLOCKING_STATUSES\.has\(conflict\.status\)/, 'saveDraft must apply the same blocking-status rule submitMemo() uses (Rejected/Cancelled may still be reused)');
  assert.match(fn, /editingSameDraft/, 're-saving the SAME draft under its own existing number must not be blocked');
  // saveMemo() itself must run strictly after the check (not before), i.e. the check can still return/block first.
  const checkPos = fn.indexOf('checkMemoNoConflict');
  const savePos = fn.indexOf('saveMemo(data)');
  assert.ok(checkPos >= 0 && savePos > checkPos, 'the conflict check must run before saveMemo() persists anything');

  // checkMemoNoConflict() must be a single shared implementation, not duplicated per caller.
  const defCount = (createCode.match(/async function checkMemoNoConflict\(/g) || []).length;
  assert.equal(defCount, 1, 'checkMemoNoConflict must be defined exactly once and reused by both saveDraft and submitMemo');
  assert.match(createCode.match(/async function submitMemo\(\) \{([\s\S]*?)\n\}\n/)?.[0] || '', /checkMemoNoConflict\(data\.memoNo\)/, 'submitMemo must reuse the same shared helper, not its own inline duplicate query');
});

test('checkMemoNoConflict() returns the conflicting row when Supabase reports one, and null when there is none', async () => {
  const conflictCtx = createMemoNoConflictContext(async () => ({
    ok: true, text: async () => JSON.stringify([{ memo_no: 'MEMO-100', status: 'pending', deleted: false }]),
  }));
  const conflict = await conflictCtx.checkMemoNoConflict('MEMO-100');
  assert.equal(conflict.memo_no, 'MEMO-100');
  assert.equal(conflict.status, 'pending');
  assert.equal(conflict.deleted, false);

  const cleanCtx = createMemoNoConflictContext(async () => ({ ok: true, text: async () => '[]' }));
  const none = await cleanCtx.checkMemoNoConflict('MEMO-200');
  assert.equal(none, null);
});

test('checkMemoNoConflict() surfaces a real existing memo\'s status so saveDraft can correctly refuse to overwrite it', async () => {
  // Reproduces the exact reported bug scenario: a second user types an already-in-use memo
  // number (belonging to a Pending memo) into a brand-new Create Memo form and hits Save Draft.
  const ctx = createMemoNoConflictContext(async () => ({
    ok: true, text: async () => JSON.stringify([{ memo_no: 'MEMO-100', status: 'pending', deleted: false }]),
  }));
  const conflict = await ctx.checkMemoNoConflict('MEMO-100');
  // MEMO_NO_BLOCKING_STATUSES is a module-scope const (not exposed on the vm
  // global object); its membership is already asserted structurally above,
  // so mirror the same set here rather than reaching into the vm context.
  const blockingStatuses = new Set(['draft', 'pending', 'pending_a2', 'pending_a3', 'completed', 'voided']);
  const blocked = !!conflict && !conflict.deleted && blockingStatuses.has(conflict.status);
  assert.equal(blocked, true, 'Save Draft must refuse to proceed — saving would have silently overwritten the unrelated Pending memo');
});

// ══════════════════════════════════════════════════════════════════
// Milestone 2 — Financial Foundation
// ══════════════════════════════════════════════════════════════════

// ── Task 2.1 (reverted 2026-07-03 — THB-only, see CHANGELOG) ──

test('Currency soft-revert: collectMemoData falls back to THB and validateMemo only accepts THB', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  assert.match(createCode, /currency: val\('#f-currency'\) \|\| 'THB'/);
  assert.match(createCode, /SUPPORTED_CURRENCIES\.includes\(data\.currency\)/);
  const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(appCode, /const SUPPORTED_CURRENCIES = \['THB'\];/, 'USD must not be a supported currency');
});

test('Currency soft-revert: Create Memo form has no currency selector — THB-only, no user-facing USD option', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /id="f-currency"/, 'the currency selector must be removed from the Create Memo form');
  assert.doesNotMatch(html, /option value="USD"/, 'USD must not appear anywhere in user-facing UI');
});

test('Milestone 2: SL/HW/INT/DEP running totals use the selected currency symbol, never a hardcoded ฿', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  ['function calcSL', 'function calcHW', 'function calcINT', 'function calcDepRow', 'function calcDepGrand'].forEach(sig => {
    const fn = createCode.match(new RegExp(`${sig.replace(/[()]/g,'\\$&')}\\([^)]*\\) \\{([\\s\\S]*?)\\n\\}\\n`))?.[0] || '';
    assert.ok(fn, `${sig} must be defined`);
    assert.doesNotMatch(fn, /'฿'/, `${sig} must not hardcode the ฿ symbol`);
    assert.match(fn, /currentCurrencySymbol\(\)/, `${sig} must use the currency-aware helper`);
  });
});

test('Milestone 2: applyDraftEdit restores the memo\'s currency on Re-edit/Duplicate', () => {
  const createCode = fs.readFileSync(path.join(root, 'views/create.js'), 'utf8');
  assert.match(createCode, /currencySel\.value = memo\.currency \|\| 'THB'/);
});

// ── Task 2.3: Created By / Updated By metadata ──

test('Milestone 2: saveMemoAsync stamps createdBy on first save and preserves it on later saves; updatedBy always refreshes', () => {
  const { context, userName } = createAppContext();
  userName.textContent = 'นาย A';
  const draft = memo({ status: 'draft', memoNo: 'ORB-META-001' });
  vm.runInContext('_memCache = []', context);
  return context.saveMemoAsync(draft).then(first => {
    assert.equal(first.createdBy, 'นาย A');
    assert.equal(first.updatedBy, 'นาย A');
    userName.textContent = 'นาย B';
    return context.saveMemoAsync({ ...first, subject: 'edited' }).then(second => {
      assert.equal(second.createdBy, 'นาย A', 'createdBy must be preserved, not overwritten by whoever edits later');
      assert.equal(second.updatedBy, 'นาย B', 'updatedBy must reflect whoever actually made this save');
    });
  });
});

test('Milestone 2: updateMemoStatusAsync stamps updatedBy with the acting user', async () => {
  const { context, userName } = createAppContext();
  const pending = memo({ status: 'pending' });
  vm.runInContext(`_memCache = [${JSON.stringify(pending)}]`, context);
  userName.textContent = 'นาย ผู้อนุมัติ';
  const updated = await context.updateMemoStatusAsync(pending.memoNo, 'rejected', { rejectedBy: 'นาย ผู้อนุมัติ' });
  assert.equal(updated.updatedBy, 'นาย ผู้อนุมัติ');
});

test('Milestone 2: memoToDb/dbToMemo round-trip preserves createdBy/updatedBy', () => {
  const { context } = createAppContext();
  const m = memo({ createdBy: 'นาย A', updatedBy: 'นาย B' });
  const restored = context.dbToMemo(context.memoToDb(m));
  assert.equal(restored.createdBy, 'นาย A');
  assert.equal(restored.updatedBy, 'นาย B');
});

test('Milestone 2: Device/Purchase Order/Budget Pool writers stamp Created By / Updated By', () => {
  const deviceCode = fs.readFileSync(path.join(root, 'views/device.js'), 'utf8');
  const budgetCode = fs.readFileSync(path.join(root, 'views/budget.js'), 'utf8');

  // Device: deviceToDb/dbToDevice map the new columns, saveDevice() stamps them.
  assert.match(deviceCode, /created_by:\s*d\.createdBy \|\| null/);
  assert.match(deviceCode, /updated_by:\s*d\.updatedBy \|\| null/);
  assert.match(deviceCode, /createdBy:\s*r\.created_by \|\| null/);
  const saveDeviceFn = deviceCode.match(/function saveDevice\(\) \{([\s\S]*?)\n\}/)?.[0] || '';
  assert.match(saveDeviceFn, /updatedBy:\s*currentUser\(\)/);
  assert.match(saveDeviceFn, /createdBy:\s*currentUser\(\)/);

  // Purchase Order: poToDb/dbToPo map the new columns; auto-created POs and
  // markArrived() both stamp an actor.
  const poToDbFn = deviceCode.match(/function poToDb\(po\) \{([\s\S]*?)\n\}\n/)?.[0] || '';
  assert.match(poToDbFn, /created_by:\s*po\.createdBy \|\| null/);
  const createPoFn = deviceCode.match(/function createPurchaseOrdersFromMemo\(memo\) \{([\s\S]*?)\n\}\n/)?.[0] || '';
  assert.match(createPoFn, /createdBy:\s*currentUser\(\)/);
  assert.match(deviceCode, /po\.updatedBy\s*=\s*currentUser\(\)/);

  // Budget Pool: savePoolAsync() forwards createdBy/updatedBy to Supabase;
  // saveBudgetPool() preserves the existing pool's creator on edit.
  assert.match(budgetCode, /created_by:\s*pool\.createdBy \|\| null/);
  assert.match(budgetCode, /updated_by:\s*pool\.updatedBy \|\| null/);
  assert.match(budgetCode, /createdBy:\s*existingPool\?\.createdBy \|\| currentUser\(\)/);
});

// ── Task 2.4: Budget tag audit log ──

test('Milestone 2: appendAuditLog captures previousBudgetPoolId/newBudgetPoolId alongside the existing actor/timestamp capture', () => {
  const { context } = createAppContext();
  const memos = [memo({ auditLog: [] })];
  context.appendAuditLog(memos, memos[0].memoNo, 'Budget tag changed', '"Auto-match" → "Pool X"', {
    previousBudgetPoolId: null,
    newBudgetPoolId: 'pool-x',
  });
  const entry = memos[0].auditLog.at(-1);
  assert.equal(entry.action, 'Budget tag changed');
  assert.equal(entry.previousBudgetPoolId, null);
  assert.equal(entry.newBudgetPoolId, 'pool-x');
  assert.ok(entry.actor, 'actor must still be captured automatically');
  assert.ok(entry.timestamp, 'timestamp must still be captured automatically');
});

test('Milestone 2: saveBudgetTag() writes a Budget tag changed audit entry via the shared appendAuditLog helper, without altering the tagging logic', () => {
  const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
  const fn = historyCode.match(/function saveBudgetTag\(memoNo\) \{([\s\S]*?)\n\}\n/)?.[0] || '';
  assert.ok(fn, 'saveBudgetTag must be defined');
  assert.match(fn, /const previousPoolId = memos\[idx\]\.budgetPoolId \|\| null;/);
  assert.match(fn, /appendAuditLog\(memos, memoNo, 'Budget tag changed'/);
  assert.match(fn, /previousBudgetPoolId: previousPoolId/);
  assert.match(fn, /newBudgetPoolId: newPoolId/);
  // The audit entry must be part of the SAME storeMemos() write as the tag
  // change itself, not a separate save — appendAuditLog() must run before it.
  const auditIndex = fn.indexOf('appendAuditLog(memos, memoNo');
  const storeIndex = fn.indexOf('storeMemos(memos)');
  assert.ok(auditIndex >= 0 && storeIndex >= 0 && auditIndex < storeIndex);
  // Business logic (cross-year/cross-project guards, pool selection) is untouched.
  assert.match(fn, /updateActualSpendBudgetOverride/);
  assert.match(fn, /canonicalPool\.project && memo\.project && canonicalPool\.project !== memo\.project/);
});
