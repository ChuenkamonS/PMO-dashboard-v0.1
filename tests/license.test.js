// Milestone 3A — License Logic: PMO Review Queue for the SL memo account list
// ("License User Mapping" gate). Loads app.js then views/license.js into the same
// VM context (mirroring index.html's real script load order) so license.js's
// references to app.js globals (loadMemos, esc, checkSupa, supaFetch, currentUser)
// resolve exactly as they do in the browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const licenseCode = fs.readFileSync(path.join(root, 'views/license.js'), 'utf8');

function createLicenseContext() {
  const storage = new Map();
  const elements = {
    'sb-uname': { textContent: 'PMO Admin' },
    'sb-urole': { textContent: 'PMO' },
  };
  let lastPrompt = null;
  const context = {
    console,
    Date,
    Intl,
    URL,
    Blob,
    setTimeout,
    clearTimeout,
    alert: () => {},
    confirm: () => true,
    prompt: () => lastPrompt,
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
  context.window = context; // so `window._x = ...` in license.js lands on context too
  vm.createContext(context);
  vm.runInContext(appCode, context, { filename: 'app.js' });
  vm.runInContext(licenseCode, context, { filename: 'views/license.js' });
  return {
    context,
    storage,
    setPrompt: v => { lastPrompt = v; },
  };
}

function slMemo(overrides = {}) {
  return {
    memoNo: 'ORB-2607-001',
    type: 'sl',
    status: 'completed',
    project: 'AOA-MP',
    approvedAt: '2026-06-01T00:00:00.000Z', // before rollout cutoff by default
    updatedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

const stubAcct = { cols: ['Figma'], rows: [{ email: 'user@orbit.co.th', licenses: { Figma: true } }] };
const stubParseAcctFn = () => stubAcct;

// ── 1. Grandfather rule ────────────────────────────────────────────────
test('existing (pre-cutoff) approved License memo account list is visible in User Mapping by default', () => {
  const { context } = createLicenseContext();
  const memo = slMemo(); // approvedAt is before LIC_REVIEW_ROLLOUT_AT
  const result = context.computeLicUserMappingData([memo], {}, stubParseAcctFn);
  assert.equal(result.allUserRows.length, 1);
  assert.equal(result.queueItems.length, 0);
  assert.equal(context.licReviewDefaultStatus(memo), 'approved');
});

// ── 2 & 3. New memo enters the Review Queue and is excluded from mapping ──
test('new (post-cutoff) approved License memo account list appears in Review Queue and is excluded from User Mapping', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({ memoNo: 'ORB-2608-777', approvedAt: '2026-08-01T00:00:00.000Z' });
  const result = context.computeLicUserMappingData([memo], {}, stubParseAcctFn);
  assert.equal(result.allUserRows.length, 0, 'pending memo rows must not appear in User Mapping');
  assert.equal(result.queueItems.length, 1);
  assert.equal(result.queueItems[0].memo.memoNo, 'ORB-2608-777');
  assert.equal(context.licReviewDefaultStatus(memo), 'pending');
});

// ── 4. Approve makes the account list appear ──────────────────────────
test('approving a review item makes its account list appear in User Mapping', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({ memoNo: 'ORB-2608-778', approvedAt: '2026-08-01T00:00:00.000Z' });
  const reviewState = { [memo.memoNo]: { status: 'approved' } };
  const result = context.computeLicUserMappingData([memo], reviewState, stubParseAcctFn);
  assert.equal(result.allUserRows.length, 1);
  assert.equal(result.queueItems.length, 0);
});

// ── 5. Reject keeps the account list out ──────────────────────────────
test('rejecting a review item keeps its account list out of User Mapping and out of the queue', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({ memoNo: 'ORB-2608-779', approvedAt: '2026-08-01T00:00:00.000Z' });
  const reviewState = { [memo.memoNo]: { status: 'rejected' } };
  const result = context.computeLicUserMappingData([memo], reviewState, stubParseAcctFn);
  assert.equal(result.allUserRows.length, 0);
  assert.equal(result.queueItems.length, 0);
});

// ── 6. Reject does not disable the pre-existing manual override mechanism ─
test('rejecting a memo does not touch or block the separate manual user-override store', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({ memoNo: 'ORB-2608-780', approvedAt: '2026-08-01T00:00:00.000Z' });
  context._setLicReviewStatus(memo.memoNo, 'rejected', 'wrong seat count');

  // The manual override mechanism (pre-existing, untouched by Milestone 3A) must
  // still work exactly as before — proving the reject action didn't lock it out.
  const ovKey = 'user@orbit.co.th|AOA-MP|Figma';
  context._saveLicUserOverrides({ [ovKey]: true });
  const overrides = context._getLicUserOverrides();
  assert.equal(overrides[ovKey], true);
});

// ── 7. View Memo uses the existing memo viewer, guarded, no new viewer built ─
test('Review Queue "View Memo" action reuses openMemoReadOnly via the existing guarded pattern', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({ memoNo: 'ORB-2608-781' });
  const html = context._renderLicReviewQueueHtml([{ memo, acct: stubAcct }]);
  assert.match(html, /typeof openMemoReadOnly==='function'&&openMemoReadOnly\('ORB-2608-781'\)/);
  assert.doesNotMatch(licenseCode, /function openLicenseMemoViewer/);
});

test('Review Queue renders nothing when there are no pending items', () => {
  const { context } = createLicenseContext();
  assert.equal(context._renderLicReviewQueueHtml([]), '');
});

// ── 8. Audit record written for approve/reject ────────────────────────
test('approving a review item writes an audit entry with the correct shape', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({ memoNo: 'ORB-2608-782', approvedAt: '2026-08-01T00:00:00.000Z' });
  context._approveLicReview(memo.memoNo);
  const state = context._getLicReviewState();
  assert.equal(state[memo.memoNo].status, 'approved');
  const entry = state[memo.memoNo].auditLog.at(-1);
  assert.equal(entry.newStatus, 'approved');
  assert.equal(entry.previousStatus, 'pending');
  assert.equal(entry.memoNo, memo.memoNo);
  assert.equal(entry.actor, 'PMO Admin');
  assert.ok(entry.timestamp);
});

test('rejecting a review item requires and stores a reason in the audit entry', () => {
  const { context, setPrompt } = createLicenseContext();
  setPrompt('duplicate account list, superseded by ORB-2608-700');
  const memo = slMemo({ memoNo: 'ORB-2608-783', approvedAt: '2026-08-01T00:00:00.000Z' });
  context._rejectLicReview(memo.memoNo);
  const state = context._getLicReviewState();
  assert.equal(state[memo.memoNo].status, 'rejected');
  assert.equal(state[memo.memoNo].reason, 'duplicate account list, superseded by ORB-2608-700');
  const entry = state[memo.memoNo].auditLog.at(-1);
  assert.equal(entry.newStatus, 'rejected');
  assert.equal(entry.reason, 'duplicate account list, superseded by ORB-2608-700');
});

test('cancelling the reject prompt leaves review status unchanged', () => {
  const { context, setPrompt } = createLicenseContext();
  setPrompt(null); // user hit Cancel
  const memo = slMemo({ memoNo: 'ORB-2608-784', approvedAt: '2026-08-01T00:00:00.000Z' });
  context._rejectLicReview(memo.memoNo);
  const state = context._getLicReviewState();
  assert.equal(state[memo.memoNo], undefined);
});

// ── 9. Voided memo remains excluded (extends the existing pin) ────────
test('a Voided License memo is excluded from both User Mapping and the Review Queue', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({ memoNo: 'ORB-2608-785', status: 'voided', approvedAt: '2026-08-01T00:00:00.000Z' });
  const result = context.computeLicUserMappingData([memo], {}, stubParseAcctFn);
  assert.equal(result.allUserRows.length, 0);
  assert.equal(result.queueItems.length, 0);
});

// ── Additional regression coverage ─────────────────────────────────────
test('review status defaults to pending when no explicit record and memo is post-cutoff, approved when pre-cutoff', () => {
  const { context } = createLicenseContext();
  const pre  = slMemo({ approvedAt: '2020-01-01T00:00:00.000Z' });
  const post = slMemo({ approvedAt: '2099-01-01T00:00:00.000Z' });
  assert.equal(context.licReviewStatusForMemo(pre, {}), 'approved');
  assert.equal(context.licReviewStatusForMemo(post, {}), 'pending');
});

test('an explicit review record always wins over the default, regardless of cutoff', () => {
  const { context } = createLicenseContext();
  const pre = slMemo({ approvedAt: '2020-01-01T00:00:00.000Z' });
  assert.equal(context.licReviewStatusForMemo(pre, { [pre.memoNo]: { status: 'rejected' } }), 'rejected');
});

test('memos without an account list never enter the queue or the mapping table', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({ memoNo: 'ORB-2608-786', approvedAt: '2026-08-01T00:00:00.000Z' });
  const emptyAcctFn = () => null;
  const result = context.computeLicUserMappingData([memo], {}, emptyAcctFn);
  assert.equal(result.allUserRows.length, 0);
  assert.equal(result.queueItems.length, 0);
});

test('review state persists to localStorage and round-trips through _getLicReviewState', () => {
  const { context, storage } = createLicenseContext();
  context._approveLicReview('ORB-2608-787');
  assert.ok(storage.has('orbit-lic-user-review-status-v1'));
  const reloaded = context._getLicReviewState();
  assert.equal(reloaded['ORB-2608-787'].status, 'approved');
});

test('parseLicenseFromMemo gives each line item a unique id even when two lines share the same name/plan/coverage', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({
    memoNo: 'ORB-2609-900',
    slItems: [
      { name: 'Figma', plan: 'Pro', price: 500, qty: 2, months: 12, startMonth: '2026-01', endMonth: '2026-12' },
      { name: 'Figma', plan: 'Pro', price: 500, qty: 3, months: 12, startMonth: '2026-01', endMonth: '2026-12' },
    ],
  });
  const licenses = context.parseLicenseFromMemo(memo);
  assert.equal(licenses.length, 2, 'both duplicate-named lines must be represented');
  assert.equal(new Set(licenses.map(l => l.id)).size, 2, 'each line item must have a unique id, not a collision on memoNo+name+plan+coverage');
  assert.deepEqual(Array.from(licenses.map(l => l.seats)).sort(), [2, 3], 'seat counts for both lines must be preserved, not overwritten by a colliding id');
});
