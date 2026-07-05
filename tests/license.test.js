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
// Users Tab UX Follow-up — main table is User / Licenses (compact chip
// preview, max 3 + "+N more") / Action, with a single "Manage Licenses"
// button replacing the earlier separate View Details + Edit Licenses pair.
// The Manage Licenses dialog itself now combines both: an active
// assignment's Plan/Source/Source Memo/Status render inline next to its
// (checked) checkbox under "Current Licenses"; every not-yet-assigned
// software is listed, unchecked, under "+ Add Manual License". Presentation
// only — computeLicUserMappingData(), the Review Queue, and the override
// editor's (email, project) key/save logic are unchanged (covered by the
// tests above); this locks the new render shape, chip preview, and combined
// modal.
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

// Common DOM-element mock for License Users tab tests: only the ids the
// render path actually touches, so initMultiSelect()/msValues() degrade to
// their documented test-double fallbacks instead of crashing on a full
// browser-only <select> enhancement (see msValues()'s doc comment, app.js).
function licUsersElements(extra = {}) {
  return {
    'lic-content': { innerHTML: '' },
    'lic-usr-body': { innerHTML: '' },
    'lic-usr-editor': { style: {} },
    'lic-usr-editor-name': {},
    'lic-usr-editor-options': { innerHTML: '' },
    ...extra,
  };
}

// Builds a single approved SL memo granting `n` distinct software+plan pairs
// to one user, for testing the ">3 licenses -> +N more" chip-preview rule.
function memoWithNLicenses(n, email) {
  const items = [];
  const cols = [];
  const cells = [];
  for (let i = 1; i <= n; i++) {
    const name = `Tool${i}`;
    items.push({ name, plan: `Plan${i}`, price: 10, qty: 1, months: 12 });
    cols.push(`<th>${name}</th>`);
    cells.push('<td>✓</td>');
  }
  return slMemo({
    memoNo: 'ORB-2620-001', project: 'AOA-MP',
    slItems: items,
    sections: [{
      title: 'ตาราง Account',
      html: `<table><thead><tr><th>Email</th>${cols.join('')}</tr></thead>` +
            `<tbody><tr><td>${email}</td>${cells.join('')}</tr></tbody></table>`,
    }],
  });
}

test('License Users tab renders a compact license preview (up to 3 chips) with a single Manage Licenses action', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
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

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);

  context._renderLicUsers();

  const licContent = elements['lic-content'];
  const licUsrBody = elements['lic-usr-body'];

  // Top-level columns: User / Licenses / Action only.
  assert.match(licContent.innerHTML, /<th[^>]*>User<\/th>/);
  assert.match(licContent.innerHTML, /<th[^>]*>Licenses<\/th>/);
  assert.match(licContent.innerHTML, /<th[^>]*>Action<\/th>/);
  assert.doesNotMatch(licContent.innerHTML, /<th[^>]*>Department<\/th>/, 'Department must not remain a primary table column');
  assert.doesNotMatch(licContent.innerHTML, /<th[^>]*>Project<\/th>/, 'Project must not remain a primary table column');

  // Row: one per user (email), a compact chip preview (not just a count), and
  // exactly one action — Manage Licenses. No Seat/Source Memo/Status here.
  assert.match(licUsrBody.innerHTML, /designer@orbit\.co\.th/);
  assert.match(licUsrBody.innerHTML, /class="badge[^>]*>Figma Professional<\/span>/, 'Licenses column must render an actual chip, not just a count');
  assert.doesNotMatch(licUsrBody.innerHTML, />Seat<\/th>/);
  assert.doesNotMatch(licUsrBody.innerHTML, />Source Memo<\/th>/);
  assert.doesNotMatch(licUsrBody.innerHTML, />Status<\/th>/);
  assert.match(licUsrBody.innerHTML, /Manage Licenses/);
  assert.doesNotMatch(licUsrBody.innerHTML, /View Details/, 'View Details must no longer be a separate action');
  assert.doesNotMatch(licUsrBody.innerHTML, />Edit Licenses</, 'Edit Licenses must no longer be a separate action label');

  // Manage Licenses is keyed off the email, but still resolves to the exact
  // same (email, project) keyed editor the override mechanism depends on —
  // business logic unchanged, only the entry point/label changed.
  assert.match(licUsrBody.innerHTML, /_openLicUserEditorForEmail\('designer@orbit\.co\.th'\)/);
  context._openLicUserEditorForEmail('designer@orbit.co.th');
  assert.equal(context.window._licUsrEditKey, 'designer@orbit.co.th|AOA-MP');
});

test('License preview shows at most 3 chips, then "+N more" for a user with more than 3 licenses', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  context.storeMemos([memoWithNLicenses(5, 'chuen@orbit.co.th')]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  const body = elements['lic-usr-body'].innerHTML;
  const chipCount = (body.match(/class="badge[^>]*>Tool\d Plan\d<\/span>/g) || []).length;
  assert.equal(chipCount, 3, 'no more than 3 chips should render in the main row');
  assert.match(body, />\+2 more</, '2 remaining licenses (5 total - 3 shown) must render as "+2 more"');
});

test('License preview shows every chip with no "+N more" for a user with exactly 3 licenses', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  context.storeMemos([memoWithNLicenses(3, 'dev@orbit.co.th')]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  const body = elements['lic-usr-body'].innerHTML;
  const chipCount = (body.match(/class="badge[^>]*>Tool\d Plan\d<\/span>/g) || []).length;
  assert.equal(chipCount, 3);
  assert.doesNotMatch(body, /more</);
});

test('License chips merge duplicate Software+Plan assignments across memos/projects into one item, but keep distinct Plans separate', () => {
  const { context } = createLicenseContext();
  const allLicCols = ['Figma'];
  const overrides = {};
  const allLicenses = [
    { name: 'Figma', plan: 'Professional', project: 'AOA-MP', memoNo: 'M1' },
    { name: 'Figma', plan: 'Professional', project: 'GAMMA', memoNo: 'M3' },
    { name: 'Figma', plan: 'Enterprise', project: 'BETA', memoNo: 'M2' },
  ];
  const user = {
    email: 'u@orbit.co.th',
    projectGroups: [
      { email: 'u@orbit.co.th', project: 'AOA-MP', licenses: { Figma: true }, licenseSources: { Figma: new Set(['M1']) } },
      { email: 'u@orbit.co.th', project: 'GAMMA', licenses: { Figma: true }, licenseSources: { Figma: new Set(['M3']) } }, // different memo/project, same software+plan
      { email: 'u@orbit.co.th', project: 'BETA', licenses: { Figma: true }, licenseSources: { Figma: new Set(['M2']) } }, // different plan
    ],
  };
  const chips = Array.from(context._licChipsForUser(user, allLicCols, overrides, allLicenses));
  assert.deepEqual(chips.sort(), ['Figma Enterprise', 'Figma Professional'].sort(), 'same software+plan across projects/memos must collapse to one item; different plans stay separate');
});

test('Manage Licenses dialog combines detail (Plan/Source/Source Memo/Status) with an editable checkbox per software, grouped Current vs + Add Manual License', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  // Two memos both grant Figma Professional to the same user in the same
  // project — a same-project duplicate grant, so Source must say "Multiple
  // memos" without needing any cross-project merge.
  const memo1 = slMemo({
    memoNo: 'ORB-2613-001', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12, startMonth: '2026-01', endMonth: '2026-12' }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th><th>Slack</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td><td>-</td></tr></tbody></table>' }],
  });
  const memo2 = slMemo({
    memoNo: 'ORB-2613-002', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12, startMonth: '2026-01', endMonth: '2026-12' }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo1, memo2]);
  // Manual override grants Slack directly (no memo ever checked it) — the
  // pre-existing manual-override storage/precedence is untouched.
  context._saveLicUserOverrides({ 'designer@orbit.co.th|AOA-MP|Slack': true });

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);

  context._renderLicUsers();
  context._openLicUserEditorForEmail('designer@orbit.co.th');

  const body = elements['lic-usr-editor-options'].innerHTML;
  // Grouped headings, not a flat list.
  assert.match(body, /Current Licenses \(2\)/);
  assert.match(body, /\+ Add Manual License/);

  // Figma: active, checked, with inline detail incl. "Multiple memos".
  assert.match(body, /data-license-index="0"[^>]*checked/);
  assert.match(body, /Plan: Professional/);
  assert.match(body, /Source: Multiple memos/, 'same software+plan granted by two memos in one group must say "Multiple memos"');
  assert.match(body, /ORB-2613-001/);
  assert.match(body, /ORB-2613-002/);
  assert.match(body, /Status:.*Active/s);

  // Slack: active via manual override, checked, "Source: Manual".
  assert.match(body, /Source: Manual/, 'a pure manual-override assignment must show Source: Manual');
});

test('Manage Licenses dialog lists not-yet-assigned software, unchecked, under + Add Manual License — reusing the existing override save path', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2614-500', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th><th>Slack</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td><td>-</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  // Before any manual add: Slack is unchecked under "+ Add Manual License",
  // with no Plan/Source/Status line (nothing to show for an inactive item).
  context._openLicUserEditorForEmail('designer@orbit.co.th');
  let body = elements['lic-usr-editor-options'].innerHTML;
  assert.match(body, /Current Licenses \(1\)/);
  const slackLabel = (body.match(/<label[^]*?<\/label>/g) || []).find(l => l.includes('data-license-index="1"')) || '';
  assert.doesNotMatch(slackLabel, /checked/, 'Slack must render unchecked (not yet assigned)');
  assert.doesNotMatch(slackLabel, /Source:/, 'an inactive item shows no detail line');

  // Manually assigning Slack is the exact same override write the pre-existing
  // editor already performed (business logic untouched) — simulate the save
  // that checking the box + clicking "Save licenses" would produce.
  context._saveLicUserOverrides({ 'designer@orbit.co.th|AOA-MP|Slack': true });
  context._renderLicUsersRows();
  context._openLicUserEditorForEmail('designer@orbit.co.th');
  body = elements['lic-usr-editor-options'].innerHTML;
  assert.match(body, /Current Licenses \(2\)/, 'Slack must now count as a Current License');
  assert.match(body, /Source: Manual/);
});

test('Software filter shows a user if they have at least one selected software (OR across selections), reflecting effective (post-override) assignment', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memoFigma = slMemo({
    memoNo: 'ORB-2614-001', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Pro', price: 100, qty: 1, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  const memoSlack = slMemo({
    memoNo: 'ORB-2614-002', project: 'BETA',
    slItems: [{ name: 'Slack', plan: '', price: 50, qty: 1, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Slack</th></tr></thead>' +
      '<tbody><tr><td>dev@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memoFigma, memoSlack]);

  const licUsrLic = { value: '', selectedOptions: [] };
  const elements = licUsersElements({ 'lic-usr-lic': licUsrLic });
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);

  context._renderLicUsers();
  const bodyOf = () => elements['lic-usr-body'].innerHTML;

  // No selection -> everyone shown.
  assert.match(bodyOf(), /designer@orbit\.co\.th/);
  assert.match(bodyOf(), /dev@orbit\.co\.th/);

  // Filter = Figma only -> only designer.
  licUsrLic.selectedOptions = [{ value: 'Figma' }];
  context._renderLicUsersRows();
  assert.match(bodyOf(), /designer@orbit\.co\.th/);
  assert.doesNotMatch(bodyOf(), /dev@orbit\.co\.th/);

  // Filter = Figma OR Slack -> both again.
  licUsrLic.selectedOptions = [{ value: 'Figma' }, { value: 'Slack' }];
  context._renderLicUsersRows();
  assert.match(bodyOf(), /designer@orbit\.co\.th/);
  assert.match(bodyOf(), /dev@orbit\.co\.th/);

  // Filter = Slack only, but designer has no Slack from any memo -> excluded...
  licUsrLic.selectedOptions = [{ value: 'Slack' }];
  context._renderLicUsersRows();
  assert.doesNotMatch(bodyOf(), /designer@orbit\.co\.th/);
  assert.match(bodyOf(), /dev@orbit\.co\.th/);

  // ...until a manual override effectively grants designer Slack too — the
  // filter must reflect the override, not just the original memo grant.
  context._saveLicUserOverrides({ 'designer@orbit.co.th|AOA-MP|Slack': true });
  context._renderLicUsersRows();
  assert.match(bodyOf(), /designer@orbit\.co\.th/, 'software filter must reflect effective (post-override) assignment');
});

test('exportUserLicensesCSV produces a User x Software matrix (Software — Plan columns, ✓/blank cells), respecting current filters', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2615-001',
    project: 'AOA-MP',
    slItems: [
      { name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 },
      { name: 'Slack', plan: '', price: 50, qty: 1, months: 12 },
    ],
    sections: [{
      title: 'ตาราง Account',
      html: '<table><thead><tr><th>Email</th><th>Figma</th><th>Slack</th><th>GitHub Copilot</th></tr></thead>' +
            '<tbody>' +
            '<tr><td>chuen@orbit.co.th</td><td>✓</td><td>✓</td><td>✓</td></tr>' +
            '<tr><td>designer@orbit.co.th</td><td>✓</td><td>-</td><td>-</td></tr>' +
            '</tbody></table>',
    }],
  });
  context.storeMemos([memo]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  let downloaded = null;
  context._downloadCSV = (name, headers, rows) => { downloaded = { name, headers, rows }; };
  context.exportUserLicensesCSV();

  assert.ok(downloaded, 'export must call _downloadCSV');
  const headers = Array.from(downloaded.headers);
  assert.equal(headers[0], 'User Email');
  assert.ok(headers.includes('Figma — Professional'), 'software with a plan is labeled "Software — Plan"');
  assert.ok(headers.includes('Slack'), 'software without a plan is labeled by name only');
  assert.equal(headers.filter(h => h.startsWith('Figma')).length, 1, 'no duplicate column for the same software+plan');

  const rows = downloaded.rows.map(r => Array.from(r));
  const chuenRow = rows.find(r => r[0] === 'chuen@orbit.co.th');
  const designerRow = rows.find(r => r[0] === 'designer@orbit.co.th');
  const figmaCol = headers.indexOf('Figma — Professional');
  const copilotCol = headers.indexOf('GitHub Copilot');
  assert.equal(chuenRow[figmaCol], '✓');
  assert.equal(chuenRow[copilotCol], '✓');
  assert.equal(designerRow[figmaCol], '✓');
  assert.equal(designerRow[copilotCol], '', 'blank cell (not ✓) when the user lacks that software');

  // Export respects the current Search filter — only chuen visible.
  elements['lic-usr-search'] = { value: 'chuen' };
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsersRows();
  downloaded = null;
  context.exportUserLicensesCSV();
  assert.equal(downloaded.rows.length, 1, 'export must only include the currently filtered/visible users');
  assert.equal(Array.from(downloaded.rows[0])[0], 'chuen@orbit.co.th');
});

// ══════════════════════════════════════════════════════════════════
// Phase 1 — Inventory ↔ Assignment Alignment. Manual/imported inventory
// becomes assignable (Part 1), the override shape gains an optional
// {active, licenseId} form without breaking legacy booleans (Part 2), and
// License Summary gains a Purchased/Assigned/Remaining reconciliation with a
// read-only Assigned Users drill-down (Part 3/4/7). Business logic untouched
// — computeLicUserMappingData()'s Review Queue gate, _buildLicUserGroups()'s
// merge, and _licActiveForGroup()'s override-wins precedence are all reused
// unchanged; only the assignable universe and the override value shape
// widen, and reconciliation is purely derived from them.
// ══════════════════════════════════════════════════════════════════

test('a manual license (never referenced by any memo account table) appears in the assignable list and Manage Licenses checklist', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2701-001', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);
  // A manual license — no memo ever checked it in an account table.
  context.storeManualLicenses([{
    id: 'man-1', name: 'Notion', plan: '', vendor: '', seats: 5, pricePerMonth: 0,
    owner: '', department: '', project: 'AOA-MP', licenseType: 'subscription',
    purchaseDate: '2026-01-01', expiry: null, billingFreq: 'monthly',
    statusOverride: null, memoNo: '', note: '', source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  assert.ok(context.window._licUsrCols.includes('Notion'), 'manual license must be in the widened assignable list');

  context._openLicUserEditorForEmail('designer@orbit.co.th');
  const body = elements['lic-usr-editor-options'].innerHTML;
  const notionLabel = (body.match(/<label[^]*?<\/label>/g) || []).find(l => l.includes('>Notion<'));
  assert.ok(notionLabel, 'Notion must appear as a checkbox option');
  assert.doesNotMatch(notionLabel, /checked/, 'not yet assigned, so it starts unchecked under + Add Manual License');
});

test('an imported license (bulk-import shaped record, source manual) participates in the assignment list exactly like a manual one', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2701-002', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);
  // Exact shape importLicenses() (views/bulk_import.js) produces — same
  // manual store, no separate "imported" flag exists or is needed.
  context.storeManualLicenses([{
    id: 'imp-1', name: 'Adobe Creative Cloud', plan: 'Business', vendor: 'Adobe',
    seats: 10, pricePerMonth: 1500, owner: '', department: '', project: 'AOA-MP',
    licenseType: 'subscription', purchaseDate: '2026-01-15', expiry: null,
    billingFreq: 'monthly', statusOverride: null, memoNo: '', note: '',
    source: 'manual', createdAt: '2026-01-15T00:00:00.000Z', updatedAt: '2026-01-15T00:00:00.000Z',
  }]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  assert.ok(context.window._licUsrCols.includes('Adobe Creative Cloud'), 'imported license must be in the widened assignable list');
});

test('legacy plain-boolean overrides still work end-to-end, no migration needed', () => {
  const { context } = createLicenseContext();
  const memoGranted = { email: 'u@orbit.co.th', project: 'AOA-MP', licenses: { Figma: true }, licenseSources: {} };
  const notGranted  = { email: 'u@orbit.co.th', project: 'AOA-MP', licenses: { Figma: false }, licenseSources: {} };

  // Legacy `true` turns ON a software the memo did not grant.
  assert.deepEqual(context._licActiveForGroup(notGranted, ['Figma'], { 'u@orbit.co.th|AOA-MP|Figma': true }), ['Figma']);
  // Legacy `false` turns OFF a software the memo granted.
  assert.deepEqual(context._licActiveForGroup(memoGranted, ['Figma'], { 'u@orbit.co.th|AOA-MP|Figma': false }), []);
  // No override at all -> falls back to the memo value, unchanged.
  assert.deepEqual(context._licActiveForGroup(memoGranted, ['Figma'], {}), ['Figma']);
});

test('the new {active, licenseId} override object works, and licenseId pins the exact inventory record for unambiguous plan/seat resolution', () => {
  const { context } = createLicenseContext();
  const group = { email: 'u@orbit.co.th', project: 'AOA-MP', licenses: {}, licenseSources: {} };
  // Two same-name, same-plan manual records in different projects — without
  // a pin, name/plan matching alone could pick either.
  const allLicenses = [
    { id: 'lic-a', name: 'Notion', plan: 'Team', project: 'AOA-MP', seats: 3 },
    { id: 'lic-b', name: 'Notion', plan: 'Team', project: 'BETA', seats: 7 },
  ];
  const ovKey = 'u@orbit.co.th|AOA-MP|Notion';
  const overrides = { [ovKey]: { active: true, licenseId: 'lic-b' } };

  assert.deepEqual(context._licActiveForGroup(group, ['Notion'], overrides), ['Notion'], 'object-shaped override must be read as active');

  const detail = context._licUserAssignmentDetail(group, 'Notion', allLicenses, overrides[ovKey]);
  assert.equal(detail.match.id, 'lic-b', 'licenseId must pin the exact record, not just best-effort name/project matching');
  assert.equal(detail.seat, 7);
});

test('computeLicReconciliation: Purchased/Assigned/Remaining match the effective inventory + assignment data, with a same-project duplicate memo grant counted once', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  // Two SL memos in the SAME project both grant the SAME user Figma — must
  // count as ONE assigned user, not two (duplicate assignment collapse).
  const memo1 = slMemo({
    memoNo: 'ORB-2702-001', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  const memo2 = slMemo({
    memoNo: 'ORB-2702-002', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo1, memo2]);

  const rows = context.computeLicReconciliation([memo1, memo2], {}, {});
  const figmaRow = rows.find(r => r.name === 'Figma' && r.project === 'AOA-MP');
  assert.ok(figmaRow, 'a reconciliation row must exist for Figma/AOA-MP');
  assert.equal(figmaRow.purchased, 10, '2 memo line items of 5 seats each = 10 purchased seats');
  assert.equal(figmaRow.assignedCount, 1, 'the same user granted by two memos in one project counts once');
  assert.equal(figmaRow.remaining, 9);
  assert.equal(figmaRow.overAssigned, false);
});

test('computeLicReconciliation flags Over Assigned when Assigned Users exceeds Purchased Seats', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  const memo = slMemo({
    memoNo: 'ORB-2703-001', project: 'AOA-MP',
    slItems: [{ name: 'Slack', plan: '', price: 50, qty: 1, months: 12 }], // 1 seat purchased
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Slack</th></tr></thead>' +
      '<tbody>' +
      '<tr><td>a@orbit.co.th</td><td>✓</td></tr>' +
      '<tr><td>b@orbit.co.th</td><td>✓</td></tr>' +
      '</tbody></table>' }],
  });
  context.storeMemos([memo]);

  const rows = context.computeLicReconciliation([memo], {}, {});
  const slackRow = rows.find(r => r.name === 'Slack' && r.project === 'AOA-MP');
  assert.equal(slackRow.purchased, 1);
  assert.equal(slackRow.assignedCount, 2);
  assert.equal(slackRow.remaining, -1);
  assert.equal(slackRow.overAssigned, true);
});

test('Assigned Users count is clickable and opens a read-only drill-down modal listing each user with Source/Project (no editing)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  const memo = slMemo({
    memoNo: 'ORB-2704-001', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 20, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody>' +
      '<tr><td>designer1@orbit.co.th</td><td>✓</td></tr>' +
      '<tr><td>designer2@orbit.co.th</td><td>✓</td></tr>' +
      '</tbody></table>' }],
  });
  context.storeMemos([memo]);

  const elements = {
    'lic-recon-wrap': { innerHTML: '' },
    'lic-recon-detail': { style: {} },
    'lic-recon-detail-name': {},
    'lic-recon-detail-purchased': {},
    'lic-recon-detail-assigned': {},
    'lic-recon-detail-remaining': {},
    'lic-recon-detail-body': { innerHTML: '' },
  };
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);

  context._renderLicReconciliation();
  assert.match(elements['lic-recon-wrap'].innerHTML, /onclick="_openLicReconDetail\(\d+\)"/, 'Assigned Users count must be clickable');

  const idx = context.window._licReconRows.findIndex(r => r.name === 'Figma' && r.project === 'AOA-MP');
  context._openLicReconDetail(idx);

  assert.equal(elements['lic-recon-detail'].style.display, 'flex');
  assert.equal(elements['lic-recon-detail-purchased'].textContent, 20);
  assert.equal(elements['lic-recon-detail-assigned'].textContent, 2);
  assert.equal(elements['lic-recon-detail-remaining'].textContent, 18);
  const body = elements['lic-recon-detail-body'].innerHTML;
  assert.match(body, /designer1@orbit\.co\.th/);
  assert.match(body, /designer2@orbit\.co\.th/);
  assert.match(body, /Source: Memo/);
  // Read-only: no editable controls (checkbox/input) in the drill-down.
  assert.doesNotMatch(body, /<input/);
});

test('exportLicReconciliationCSV exports Project/Software/Plan/Purchased/Assigned/Remaining and does not remove the existing User Matrix export', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  const memo = slMemo({
    memoNo: 'ORB-2705-001', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);

  let downloaded = null;
  context._downloadCSV = (name, headers, rows) => { downloaded = { name, headers, rows }; };
  context.exportLicReconciliationCSV();

  assert.ok(downloaded, 'reconciliation export must call _downloadCSV');
  assert.deepEqual(Array.from(downloaded.headers), ['Project', 'Software', 'Plan', 'Purchased Seats', 'Assigned Users', 'Remaining Seats']);
  const row = Array.from(downloaded.rows).map(r => Array.from(r)).find(r => r[1] === 'Figma');
  assert.deepEqual(row, ['AOA-MP', 'Figma', 'Professional', 5, 1, 4]);

  assert.equal(typeof context.exportUserLicensesCSV, 'function', 'the existing User Matrix export must still exist, unremoved');
});
