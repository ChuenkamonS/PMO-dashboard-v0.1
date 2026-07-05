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

// Functional audit fix: when a line item has no (or an invalid) startMonth, expiry falls back to
// `new Date(purchaseDate)` (memo.approvedAt/updatedAt/createdAt) + setMonth(+months). Without
// normalizing to day 1 first, Date.setMonth() overflows into the next month whenever the
// purchase-date day-of-month (29-31) exceeds the target month's day count (e.g. Jan 31 + 1 month
// => Mar 3, not Feb 28), pushing the computed expiry later than intended.
test('parseLicenseFromMemo does not let Date.setMonth() overflow the expiry into the wrong month when startMonth is missing', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({
    memoNo: 'ORB-2610-100',
    approvedAt: '2026-01-31T10:00:00.000Z',
    updatedAt: '2026-01-31T10:00:00.000Z',
    createdAt: '2026-01-31T10:00:00.000Z',
    slItems: [
      { name: 'Canva', plan: 'Pro', price: 300, qty: 1, months: 1 }, // no startMonth
    ],
  });
  const [license] = context.parseLicenseFromMemo(memo);
  assert.equal(license.purchaseDate.slice(0, 10), '2026-01-01', 'start must normalize to day 1 of the month, not the raw approval day (31)');
  assert.equal(license.expiry.slice(0, 10), '2026-02-01', 'expiry must land in February (Jan + 1 month), not roll over into March');
});

// Functional audit fix: _renderLicMemoIndexRows() has always looked for
// #license-load-more (to show remaining count / wire loadMoreLicense()), but
// no such element was ever added to _renderLicMemoIndex()'s own template —
// pagination was silently unreachable, capping License Index at 20 rows with
// no way to see the rest.
test('_renderLicMemoIndex renders a Load More control wired to the existing loadMoreLicense() (previously missing entirely)', () => {
  const { context } = createLicenseContext();
  const licContent = { innerHTML: '' };
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => (id === 'lic-content') ? licContent : origGetById(id);

  context._renderLicMemoIndex();

  assert.match(licContent.innerHTML, /id="license-load-more"/, 'the Load More container must exist in the rendered DOM');
  assert.match(licContent.innerHTML, /onclick="loadMoreLicense\(\)"/, 'its button must call the already-implemented loadMoreLicense()');
});

test('parseLicenseFromMemo still computes the correct 12-month expiry when startMonth is missing (regression control)', () => {
  const { context } = createLicenseContext();
  const memo = slMemo({
    memoNo: 'ORB-2610-101',
    approvedAt: '2026-01-31T10:00:00.000Z',
    updatedAt: '2026-01-31T10:00:00.000Z',
    createdAt: '2026-01-31T10:00:00.000Z',
    slItems: [
      { name: 'Notion', plan: 'Team', price: 1000, qty: 1, months: 12 }, // no startMonth
    ],
  });
  const [license] = context.parseLicenseFromMemo(memo);
  assert.equal(license.expiry.slice(0, 10), '2027-01-01', 'a 12-month term from Jan must expire exactly one year later');
});

// ══════════════════════════════════════════════════════════════════
// Final UX Consistency Pass — Part 6: License User Mapping becomes a
// user-centric view (User / Department / Software Count, expandable to
// Program / Plan / Seat / Source Memo / Status), replacing the old wide
// per-project matrix. Presentation only — computeLicUserMappingData(),
// the Review Queue, and the override editor's (email, project) key shape
// are unchanged (already covered by the tests above); this locks the new
// render shape itself.
// ══════════════════════════════════════════════════════════════════
class FakeAcctDOMParser {
  parseFromString(html) {
    const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/);
    const ths = theadMatch
      ? [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => ({ textContent: m[1].trim() }))
      : [];
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const scope = tbodyMatch ? tbodyMatch[1] : '';
    const rows = [...scope.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(rm => {
      const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cm => ({ textContent: cm[1].trim() }));
      return { querySelectorAll: sel => sel === 'td' ? cells : [] };
    });
    return { querySelectorAll: sel => sel === 'thead th' ? ths : sel === 'tbody tr' ? rows : [] };
  }
}

test('License Users tab renders a user-centric table (User / Department / Software Count) with an expandable Program/Plan/Seat/Source Memo/Status detail per project', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  const memo = slMemo({
    memoNo: 'ORB-2611-001',
    project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12, startMonth: '2026-01', endMonth: '2026-12' }],
    sections: [{
      title: 'ตาราง Account',
      html: '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
            '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>',
    }],
  });
  context.storeMemos([memo]);

  const licContent = { innerHTML: '' };
  const licUsrBody = { innerHTML: '' };
  const elements = { 'lic-content': licContent, 'lic-usr-body': licUsrBody };
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);

  context._renderLicUsers();

  // Top-level columns: User / Department / Software Count — no per-license
  // matrix column, no Project column (Part 6 + TD-AUDIT-07).
  assert.match(licContent.innerHTML, /<th[^>]*>User<\/th>/);
  assert.match(licContent.innerHTML, /<th[^>]*>Department<\/th>/);
  assert.match(licContent.innerHTML, />Software Count<\/th>/);
  assert.doesNotMatch(licContent.innerHTML, /<th[^>]*>Project<\/th>/, 'Project must not remain a primary matrix column');

  // Row: one per user (email), with a Software Count reflecting the memo's
  // active license(s), and Department showing "—" (no data source exists
  // for it, so it must not fabricate a value).
  assert.match(licUsrBody.innerHTML, /designer@orbit\.co\.th/);
  const rowMatch = licUsrBody.innerHTML.match(/<tr[^>]*onclick="_toggleLicUserRow\('[^']*'\)">([\s\S]*?)<\/tr>/);
  assert.ok(rowMatch, 'the user row must be clickable via _toggleLicUserRow');
  assert.match(rowMatch[1], />—<\/td>/, 'Department has no data source yet and must show "—", not a fabricated value');
  assert.match(rowMatch[1], />1<\/td>/, 'Software Count must be 1 for a single active license');

  // Expand the row (mirrors clicking it) and confirm the detail view exposes
  // exactly Program / Plan / Seat / Source Memo / Status, sourced from the
  // memo's own slItems (Plan/Seat) and account table (Source Memo), not
  // fabricated.
  context._toggleLicUserRow(encodeURIComponent('designer@orbit.co.th'));
  assert.match(licUsrBody.innerHTML, />Program<\/th>/);
  assert.match(licUsrBody.innerHTML, />Plan<\/th>/);
  assert.match(licUsrBody.innerHTML, />Seat<\/th>/);
  assert.match(licUsrBody.innerHTML, />Source Memo<\/th>/);
  assert.match(licUsrBody.innerHTML, />Status<\/th>/);
  assert.match(licUsrBody.innerHTML, />Figma<\/td>/);
  assert.match(licUsrBody.innerHTML, />Professional<\/td>/);
  assert.match(licUsrBody.innerHTML, />5<\/td>/);
  assert.match(licUsrBody.innerHTML, /ORB-2611-001/, 'Source Memo must link back to the real memo, not a placeholder');
  // Edit licenses still opens the exact same (email, project) keyed editor
  // the override mechanism already depends on (Part 6 explicitly keeps this
  // logic unchanged).
  assert.match(licUsrBody.innerHTML, /_openLicUserEditor\(decodeURIComponent\('[^']*designer%40orbit\.co\.th%7CAOA-MP[^']*'\)\)/);
});
