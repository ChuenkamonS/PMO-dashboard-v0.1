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

test('Manage Licenses dialog combines detail (Plan/Source) with an editable checkbox per software, grouped Current vs + Add Manual License', () => {
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

  // Figma: active, checked, with inline detail incl. "Multiple memos". Per
  // the Simplify hotfix (2026-07-06), Source Memo numbers and Status are no
  // longer shown in this modal (still available via License Summary >
  // Reconciliation's Assigned Users drill-down) — only Plan + Source.
  assert.match(body, /data-license-index="0"[^>]*checked/);
  assert.match(body, /Plan: Professional/);
  assert.match(body, /Source: Multiple memos/, 'same software+plan granted by two memos in one group must say "Multiple memos"');
  assert.doesNotMatch(body, /ORB-2613-001/, 'Source Memo numbers are no longer shown in this modal');
  assert.doesNotMatch(body, /Status:/, 'Status is no longer shown in this modal');

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

// ══════════════════════════════════════════════════════════════════
// Phase 2A — License Management UX Improvements. Presentation-only, on top
// of Phase 1's inventory/assignment alignment: Manage Licenses now groups a
// user's software by Project (collapsible sections replace the old single-
// project dropdown switcher) with read-only Purchased/Assigned/Remaining
// seat context and a realtime search box; License Summary is split into
// Summary/Reconciliation sub-tabs. No reconciliation math, override
// precedence, Review Queue gate, or (email, project) override key shape is
// changed — computeLicReconciliation()/_saveLicUserEditor()'s branching are
// reused as-is.
// ══════════════════════════════════════════════════════════════════

test('Manage Licenses groups a user\'s licenses by Project, with each project section keeping independent checkbox state (Part 1/5)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memoGeo9 = slMemo({
    memoNo: 'ORB-2801-001', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>multi@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  const memoEV = slMemo({
    memoNo: 'ORB-2801-002', project: 'EV',
    slItems: [{ name: 'Slack', plan: '', price: 50, qty: 3, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Slack</th></tr></thead>' +
      '<tbody><tr><td>multi@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memoGeo9, memoEV]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  // Users table itself keeps showing only software names — no Project column.
  assert.doesNotMatch(elements['lic-content'].innerHTML, /<th[^>]*>Project<\/th>/);

  context._openLicUserEditorForEmail('multi@orbit.co.th');
  const body = elements['lic-usr-editor-options'].innerHTML;

  assert.match(body, /Geo9/);
  assert.match(body, /EV/);
  assert.equal((body.match(/Current Licenses \(/g) || []).length, 2, 'one "Current Licenses" heading per project section — a grouped tree, not a flat list');

  const inputs = body.match(/<input[^>]*>/g) || [];
  const find = (project, license) => inputs.find(i =>
    i.includes(`data-group-key="multi@orbit.co.th|${project}"`) && i.includes(`data-license-index="${license}"`));

  const figmaGeo9 = find('Geo9', context.window._licUsrCols.indexOf('Figma'));
  const figmaEV   = find('EV', context.window._licUsrCols.indexOf('Figma'));
  const slackGeo9 = find('Geo9', context.window._licUsrCols.indexOf('Slack'));
  const slackEV   = find('EV', context.window._licUsrCols.indexOf('Slack'));

  assert.ok(figmaGeo9 && /checked/.test(figmaGeo9), 'Figma must be checked within its own Geo9 section');
  assert.ok(figmaEV && !/checked/.test(figmaEV), 'Figma must be unchecked within the EV section — project scoping is independent');
  assert.ok(slackEV && /checked/.test(slackEV), 'Slack must be checked within its own EV section');
  assert.ok(slackGeo9 && !/checked/.test(slackGeo9), 'Slack must be unchecked within the Geo9 section — project scoping is independent');
});

// Simplify hotfix (2026-07-06): the common case — a user belonging to only
// one project — renders as a flat list with NO redundant "Project: X"
// heading above Current Licenses (that heading only earns its keep for a
// multi-project user, covered by the test above). This matches the user's
// literal requested layout ("Current Licenses" / "+ Add Manual License",
// no outer project wrapper for the single-project case).
test('Manage Licenses: single-project user renders a flat list with no redundant outer "Project: X" heading (Simplify hotfix)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2900-010', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();
  context._openLicUserEditorForEmail('designer@orbit.co.th');

  const body = elements['lic-usr-editor-options'].innerHTML;
  assert.equal((body.match(/Current Licenses \(/g) || []).length, 1, 'exactly one Current Licenses heading for a single-project user');
  assert.doesNotMatch(body.split('Current Licenses')[0], /class="project-group"/, 'no outer "Project: X" heading is shown before Current Licenses when the user has only one project');
});

// Hotfix (2026-07-05, tightened 2026-07-06): Current Licenses is a per-user
// assignment view — it must NOT show Purchased/Assigned/Remaining (those are
// License Inventory / Reconciliation context, not user-assignment detail).
// As of the 2026-07-06 Simplify hotfix, seat context is not shown ANYWHERE
// in this modal any more (not even under + Add Manual License) — it lives
// only in License Summary > Reconciliation.
test('Manage Licenses: Current Licenses does NOT show Purchased/Assigned/Remaining seat counts (Fix 1)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2802-001', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();
  context._openLicUserEditorForEmail('designer@orbit.co.th');

  const body = elements['lic-usr-editor-options'].innerHTML;
  assert.doesNotMatch(body, /Purchased/, 'no row anywhere in this modal may show Purchased seats');
  assert.doesNotMatch(body, /Assigned \d/, 'no row anywhere in this modal may show an Assigned count');
  assert.doesNotMatch(body, /Remaining/, 'no row anywhere in this modal may show Remaining seats');

  const figmaLabel = (body.match(/<label[^]*?<\/label>/g) || []).find(l => l.includes('>Figma<'));
  assert.ok(figmaLabel, 'Figma (active/Current License) row must exist');
  // Plan/Source (the fields Fix 1 says Current Licenses should show) must
  // still be present, unchanged.
  assert.match(figmaLabel, /Plan: Professional/);
  assert.match(figmaLabel, /Source: Memo/);
});

// Simplify hotfix (2026-07-06): + Add Manual License rows show Plan only —
// NO Purchased/Assigned/Remaining and NO per-row Project text any more
// (Project is now shown once, as the enclosing "Project: X" group header,
// per the new simplified layout). Seat counts live only in License Summary
// > Reconciliation.
test('Manage Licenses: + Add Manual License rows show Plan only — no seat counts, no per-row Project text (Fix 2, simplified)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2802-002', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);
  // Slack is purchased in Geo9's inventory (10 seats) but not yet assigned
  // to anyone — must appear under + Add Manual License with just its Plan
  // (none here) under the "Project: Geo9" group header.
  context.storeManualLicenses([{
    id: 'man-slack-geo9', name: 'Slack', plan: 'Pro', vendor: '', seats: 10, pricePerMonth: 0,
    owner: '', department: '', project: 'Geo9', licenseType: 'subscription',
    purchaseDate: '2026-01-01', expiry: null, billingFreq: 'monthly',
    statusOverride: null, memoNo: '', note: '', source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();
  context._openLicUserEditorForEmail('designer@orbit.co.th');

  const body = elements['lic-usr-editor-options'].innerHTML;
  const slackLabel = (body.match(/<label[^]*?<\/label>/g) || []).find(l => l.includes('>Slack<'));
  assert.ok(slackLabel, 'Slack (available/Add Manual License) row must exist');
  assert.doesNotMatch(slackLabel, /checked/, 'not yet assigned to anyone, so it starts unchecked');
  assert.match(slackLabel, /Plan: Pro/, 'available row must show Plan');
  assert.doesNotMatch(slackLabel, /Project:/, 'Project is shown once as the group header, not repeated inside the row');
  assert.doesNotMatch(slackLabel, /Purchased/, 'no seat counts in this modal any more');
  assert.doesNotMatch(slackLabel, /Assigned \d/, 'no seat counts in this modal any more');
  assert.doesNotMatch(slackLabel, /Remaining/, 'no seat counts in this modal any more');

  // Read-only structure: no button/extra control on the row itself, only
  // the checkbox.
  assert.doesNotMatch(slackLabel, /<button/);
});

// Fix 2 (grouped by Project), now with a plain "Project: X" text header
// instead of a card/caret — + Add Manual License must be grouped by which
// Project each available license's inventory match belongs to.
test('Manage Licenses: + Add Manual License is grouped by Project, with a plain "Project: X" header (Fix 2, simplified)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2806-001', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);
  // Two not-yet-assigned licenses, purchased under two different projects —
  // Notion Business under designer's own Geo9 group, Slack Pro under a
  // completely different project (AOA-MP) designer has no account-table row
  // in at all. Both must still be offered (Manage Licenses never gained an
  // "Add User" affordance — out of scope), but grouped under their own
  // Project so PMO can tell which inventory item each would pin.
  context.storeManualLicenses([
    { id: 'man-notion', name: 'Notion Business', plan: 'Business', vendor: '', seats: 10, pricePerMonth: 0,
      owner: '', department: '', project: 'Geo9', licenseType: 'subscription',
      purchaseDate: '2026-01-01', expiry: null, billingFreq: 'monthly', statusOverride: null,
      memoNo: '', note: '', source: 'manual', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'man-slack-aoa', name: 'Slack Pro', plan: '', vendor: '', seats: 15, pricePerMonth: 0,
      owner: '', department: '', project: 'AOA-MP', licenseType: 'subscription',
      purchaseDate: '2026-01-01', expiry: null, billingFreq: 'monthly', statusOverride: null,
      memoNo: '', note: '', source: 'manual', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();
  context._openLicUserEditorForEmail('designer@orbit.co.th');

  const body = elements['lic-usr-editor-options'].innerHTML;
  const addManualSection = body.split('+ Add Manual License')[1] || '';
  assert.match(addManualSection, /class="lic-usr-add-group"/, 'available rows must be wrapped in Project sub-groups (search/collapse hook, unchanged)');
  assert.match(addManualSection, /<div class="project-group"[^>]*>Project: Geo9<\/div>/, 'a plain "Project: Geo9" text header must exist (Notion Business) — no card/caret');
  assert.match(addManualSection, /<div class="project-group"[^>]*>Project: AOA-MP<\/div>/, 'a plain "Project: AOA-MP" text header must exist (Slack Pro), even though it differs from the enclosing Geo9 section');

  const notionLabel = (body.match(/<label[^]*?<\/label>/g) || []).find(l => l.includes('>Notion Business<'));
  const slackLabel = (body.match(/<label[^]*?<\/label>/g) || []).find(l => l.includes('>Slack Pro<'));
  assert.match(notionLabel, /Plan: Business/, 'Notion Business must show its own Plan');
  assert.doesNotMatch(notionLabel, /Project:/, 'Project is not repeated inside the row, only in the group header');
  assert.doesNotMatch(slackLabel, /Plan:/, 'Slack Pro has no plan, so no Plan line renders');
});

test('Manage Licenses renders a realtime search box, and each software row carries a lowercase name for filtering (Part 2)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2803-001', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  assert.match(elements['lic-content'].innerHTML, /id="lic-usr-editor-search"/, 'a search input must exist in the Manage Licenses dialog');
  assert.match(elements['lic-content'].innerHTML, /oninput="_filterLicUserEditorOptions\(\)"/, 'the search box must filter in realtime (on every keystroke), not on submit/blur');

  context._openLicUserEditorForEmail('designer@orbit.co.th');
  const body = elements['lic-usr-editor-options'].innerHTML;
  assert.match(body, /data-license-name="figma"/, 'each row must expose a lowercase, filterable software name');
  assert.match(body, /data-project="geo9"/, 'each row must also expose a lowercase, filterable project name (Fix 3)');
  assert.equal(typeof context._filterLicUserEditorOptions, 'function');
});

// Hotfix (2026-07-05, Fix 3): search must match software name, plan, OR
// project — previously name only, so typing a Project name (the main way
// PMO would now navigate the Project-grouped + Add Manual License list)
// found nothing.
test('Manage Licenses search matches software name, plan, and project; hides a Project sub-group with no matches (Fix 3)', () => {
  const { context } = createLicenseContext();
  const rows = [
    { dataset: { licenseName: 'notion business', plan: '', project: 'geo9' }, style: {} },
    { dataset: { licenseName: 'slack pro', plan: '', project: 'aoa-mp' }, style: {} },
  ];
  const addGroups = [
    { querySelectorAll: () => [rows[0]], style: {} },
    { querySelectorAll: () => [rows[1]], style: {} },
  ];
  const editGroups = [
    { querySelectorAll: () => rows, style: {} },
  ];
  const searchEl = { value: 'geo9' };
  context.document.getElementById = id => (id === 'lic-usr-editor-search') ? searchEl : null;
  context.document.querySelectorAll = sel => {
    if (sel === '#lic-usr-editor-options .lic-usr-edit-row') return rows;
    if (sel === '#lic-usr-editor-options .lic-usr-add-group') return addGroups;
    if (sel === '#lic-usr-editor-options .lic-usr-edit-group') return editGroups;
    return [];
  };

  context._filterLicUserEditorOptions();

  assert.equal(rows[0].style.display, '', 'Notion Business row must stay visible — search matched its Project (Geo9)');
  assert.equal(rows[1].style.display, 'none', 'Slack Pro row must hide — no match on name/plan/project');
  assert.equal(addGroups[0].style.display, '', 'the Geo9 sub-group must stay visible (has a matching row)');
  assert.equal(addGroups[1].style.display, 'none', 'the AOA-MP sub-group must hide (no matching row left)');
});

// ══════════════════════════════════════════════════════════════════
// Layout hotfix (2026-07-06) — the project-grouping change above left the
// modal's rows/search/footer visually broken: overlapping/misaligned detail
// lines, an inconsistent placeholder, and a footer that scrolled away with
// the (potentially very long) options list. Business logic, override model,
// licenseId behavior, and reconciliation math are unchanged — this is pure
// markup/CSS restructuring, locked in here via the rendered class/structure.
// ══════════════════════════════════════════════════════════════════

test('Manage Licenses search input shows the required placeholder text (Layout hotfix)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  context.storeMemos([slMemo({
    memoNo: 'ORB-2900-001', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  })]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  assert.match(elements['lic-content'].innerHTML, /placeholder="Search software, plan, or project\.\.\."/, 'search placeholder must be the exact required text, with no missing/blank rendering');
});

// Simplify hotfix (2026-07-06): the elaborate card/border row + 3-line meta
// structure from the prior "Layout hotfix" rounds was replaced with a very
// simple, borderless, at-most-one-detail-line row — per explicit new
// instruction, no seat data anywhere and no nested card/table layout.
test('Manage Licenses row layout: simple [checkbox][name + one small detail line] structure, no card/border, no overlap-prone markup (Simplify hotfix)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2900-002', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);
  // A not-yet-assigned license with a known Plan, purchased in Geo9 — the
  // available row must show only "Plan: X", nothing else.
  context.storeManualLicenses([{
    id: 'man-notion', name: 'Notion Business', plan: 'Team', vendor: '', seats: 10, pricePerMonth: 0,
    owner: '', department: '', project: 'Geo9', licenseType: 'subscription',
    purchaseDate: '2026-01-01', expiry: null, billingFreq: 'monthly', statusOverride: null,
    memoNo: '', note: '', source: 'manual', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();
  context._openLicUserEditorForEmail('designer@orbit.co.th');

  const body = elements['lic-usr-editor-options'].innerHTML;

  // Row shell: [checkbox] [name + at most one <small> detail line]. Search/
  // save still key off the pre-existing lic-usr-edit-row/lic-usr-edit-check
  // classes and data-* attrs (unchanged — verified by the pre-existing
  // search/save tests still passing).
  const figmaLabel = (body.match(/<label[^]*?<\/label>/g) || []).find(l => l.includes('>Figma<'));
  assert.match(figmaLabel, /class="lic-usr-edit-row lic-simple-row"/, 'row keeps its pre-existing search/save class AND gains the new lic-simple-row structural class');
  assert.doesNotMatch(figmaLabel, /border:1px solid|border-radius|background:var\(--surface\)/, 'no card/border styling — a plain vertical list per the Simplify hotfix');
  assert.match(figmaLabel, /<input type="checkbox"[^>]*flex:0 0 auto[^>]*>\s*<div[^>]*flex:1;min-width:0/, 'checkbox (flex:0 0 auto, so it never grows/shrinks/overlaps) must be immediately followed by a flex:1;min-width:0 content div');
  assert.doesNotMatch(figmaLabel, /white-space:nowrap/, 'title/detail text must be allowed to wrap (no nowrap that could force it to escape the row)');
  assert.match(figmaLabel, /Plan: Professional · Source: Memo/, 'Current License row: exactly one small detail line combining Plan + Source');
  assert.equal((figmaLabel.match(/<small/g) || []).length, 1, 'exactly one detail line, not several stacked meta lines');

  const notionLabel = (body.match(/<label[^]*?<\/label>/g) || []).find(l => l.includes('>Notion Business<'));
  assert.match(notionLabel, /class="lic-usr-edit-row lic-simple-row"/);
  assert.match(notionLabel, /<small[^>]*>Plan: Team<\/small>/, 'Add Manual License row: Plan only, nothing else');
  assert.doesNotMatch(notionLabel, /Project:|Purchased|Assigned|Remaining/, 'no Project/seat text inside the row itself');
});

test('Manage Licenses modal shell: options list scrolls independently, Save/Cancel stay outside the scroll area (Layout hotfix)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  context.storeMemos([slMemo({
    memoNo: 'ORB-2900-003', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  })]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  const shell = elements['lic-content'].innerHTML;
  const optionsTag = shell.match(/<div id="lic-usr-editor-options"[^>]*>/)[0];
  assert.match(optionsTag, /overflow-y:auto/, 'the options list must scroll on its own, not the whole modal');
  assert.match(optionsTag, /flex:1/, 'the options list must be the flexible/growing region between the fixed header and footer');

  // Save/Cancel must be siblings of, not inside, the scrollable options div.
  const afterOptions = shell.slice(shell.indexOf(optionsTag) + optionsTag.length);
  const optionsCloseIdx = afterOptions.indexOf('</div>');
  const footerHtml = afterOptions.slice(optionsCloseIdx);
  assert.match(footerHtml, /Save licenses/, 'Save licenses must appear after the options div closes (outside the scroll area)');
  assert.match(footerHtml, />Cancel</, 'Cancel must appear after the options div closes (outside the scroll area)');
});

test('License Summary is split into Summary and Reconciliation sub-tabs — only one panel visible at a time (Part 3)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  const memo = slMemo({
    memoNo: 'ORB-2804-001', project: 'AOA-MP',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);

  const elements = {
    'lic-content': { innerHTML: '' },
    'bp-table-wrap': { innerHTML: '' },
    'lic-recon-wrap': { innerHTML: '' },
  };
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);

  context._renderLicByProject();
  let content = elements['lic-content'].innerHTML;
  let summaryTag = content.match(/<div id="lic-summary-panel"[^>]*>/)[0];
  let reconTag = content.match(/<div id="lic-reconciliation-panel"[^>]*>/)[0];
  assert.doesNotMatch(summaryTag, /display:none/, 'Summary panel must be visible by default');
  assert.match(reconTag, /display:none/, 'Reconciliation panel must be hidden while Summary sub-tab is active');

  context._switchLicSummarySubTab('reconciliation');
  content = elements['lic-content'].innerHTML;
  summaryTag = content.match(/<div id="lic-summary-panel"[^>]*>/)[0];
  reconTag = content.match(/<div id="lic-reconciliation-panel"[^>]*>/)[0];
  assert.match(summaryTag, /display:none/, 'Summary panel must hide after switching to Reconciliation');
  assert.doesNotMatch(reconTag, /display:none/, 'Reconciliation panel must become visible after switching');

  // Underlying data is untouched by the split — same tables, same numbers.
  assert.match(elements['lic-recon-wrap'].innerHTML, /Figma/);
});

test('Manage Licenses "Save licenses" applies checkbox state per project section for a multi-project user (grouping does not change the override save path)', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memoGeo9 = slMemo({
    memoNo: 'ORB-2805-001', project: 'Geo9',
    slItems: [{ name: 'Figma', plan: 'Professional', price: 500, qty: 5, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Figma</th></tr></thead>' +
      '<tbody><tr><td>multi@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  const memoEV = slMemo({
    memoNo: 'ORB-2805-002', project: 'EV',
    slItems: [{ name: 'Slack', plan: '', price: 50, qty: 3, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Slack</th></tr></thead>' +
      '<tbody><tr><td>multi@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memoGeo9, memoEV]);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();
  context._openLicUserEditorForEmail('multi@orbit.co.th');

  // Simulate the checkbox states after PMO edits both sections in one Save:
  // remove Figma from Geo9, manually add Figma to EV, leave Slack untouched
  // in both sections.
  const fakeInputs = [
    { dataset: { groupKey: 'multi@orbit.co.th|Geo9', licenseIndex: '0' }, checked: false },
    { dataset: { groupKey: 'multi@orbit.co.th|Geo9', licenseIndex: '1' }, checked: false },
    { dataset: { groupKey: 'multi@orbit.co.th|EV', licenseIndex: '0' }, checked: true },
    { dataset: { groupKey: 'multi@orbit.co.th|EV', licenseIndex: '1' }, checked: true },
  ];
  const origQSA = context.document.querySelectorAll;
  context.document.querySelectorAll = sel =>
    sel === '#lic-usr-editor-options .lic-usr-edit-check' ? fakeInputs : origQSA(sel);

  context._saveLicUserEditor();

  const overrides = context._getLicUserOverrides();
  assert.equal(overrides['multi@orbit.co.th|Geo9|Figma'], false, 'unchecking a memo-granted identity in its own project section writes a scoped false override');
  assert.equal(overrides['multi@orbit.co.th|EV|Figma'], true, 'checking the same identity in a different project section writes an override scoped to that project only, independent of Geo9');
  assert.ok(!('multi@orbit.co.th|Geo9|Slack' in overrides), 'an untouched, still-unchecked entry writes no override');
  assert.ok(!('multi@orbit.co.th|EV|Slack' in overrides), 'an untouched, still-checked (memo-granted) entry resets to memo default — no override');
});

// ══════════════════════════════════════════════════════════════════
// Phase 2B — Assignment Import (Excel/CSV). Assigns users to *existing*
// License Inventory records via the same override mechanism Manage Licenses
// already uses — never creates inventory, projects, or memos. A new manual
// user-row store (_LIC_USR_MANUAL_KEY) lets an imported (email, project)
// pair surface in the Users tab/Reconciliation/export even when no memo ever
// granted that user anything; every downstream number still flows through
// the pre-existing computeLicUserMappingData()/computeLicReconciliation()/
// exportUserLicensesCSV() — no calculation logic duplicated.
// ══════════════════════════════════════════════════════════════════

function invLicense(overrides = {}) {
  return {
    id: 'inv-1', name: 'Figma', plan: 'Professional', vendor: '', seats: 5, pricePerMonth: 0,
    owner: '', department: '', project: 'Geo9', licenseType: 'subscription',
    purchaseDate: '2026-01-01', expiry: null, billingFreq: 'monthly',
    statusOverride: null, memoNo: '', note: '', source: 'manual',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('_parseAssignmentImportFile maps the Assignment Import template header row to structured rows', () => {
  const { context } = createLicenseContext();
  const csv = 'User Email,Software,Plan,Project,Note\n' +
    'designer1@orbit.co.th,Figma,Professional,Geo9,Historical assignment\n' +
    'dev1@orbit.co.th,GitHub Copilot,,AOA-MP,\n';
  const rows = context._parseAssignmentImportFile(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual({ ...rows[0] }, { email: 'designer1@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: 'Historical assignment' });
  assert.deepEqual({ ...rows[1] }, { email: 'dev1@orbit.co.th', software: 'GitHub Copilot', plan: '', project: 'AOA-MP', note: '' });
});

test('downloadAssignmentTemplate downloads a CSV with the required + optional template columns', () => {
  const { context } = createLicenseContext();
  let downloaded = null;
  context._downloadCSV = (name, headers, rows) => { downloaded = { name, headers, rows }; };
  context.downloadAssignmentTemplate();
  assert.ok(downloaded);
  assert.deepEqual(Array.from(downloaded.headers), ['User Email', 'Software', 'Plan', 'Project', 'Note']);
  assert.ok(downloaded.rows.length >= 1);
});

test('computeAssignmentImportPreview: blank Plan matches when exactly one plan exists for that Software+Project', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([invLicense()]);
  const preview = context.computeAssignmentImportPreview([
    { email: 'designer1@orbit.co.th', software: 'Figma', plan: '', project: 'Geo9', note: '' },
  ], context.getAllLicenses());
  assert.equal(preview.total, 1);
  assert.equal(preview.validCount, 1);
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[0].matchedLicenseId, 'inv-1');
});

test('computeAssignmentImportPreview: required-field gaps and bad email format are rejected with specific reasons', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([invLicense()]);
  const allLicenses = context.getAllLicenses();
  const preview = context.computeAssignmentImportPreview([
    { email: '', software: 'Figma', plan: '', project: 'Geo9', note: '' },
    { email: 'not-an-email', software: 'Figma', plan: '', project: 'Geo9', note: '' },
    { email: 'a@orbit.co.th', software: '', plan: '', project: 'Geo9', note: '' },
    { email: 'a@orbit.co.th', software: 'Figma', plan: '', project: '', note: '' },
  ], allLicenses);
  assert.equal(preview.rejectedCount, 4);
  assert.equal(preview.rows[0].reason, 'missing email');
  assert.equal(preview.rows[1].reason, 'invalid email format');
  assert.equal(preview.rows[2].reason, 'missing software');
  assert.equal(preview.rows[3].reason, 'missing project');
});

test('computeAssignmentImportPreview: rejects a row with no matching inventory record ("inventory not found")', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([]);
  const preview = context.computeAssignmentImportPreview([
    { email: 'nobody@orbit.co.th', software: 'Nonexistent Tool', plan: '', project: 'Geo9', note: '' },
  ], context.getAllLicenses());
  assert.equal(preview.rejectedCount, 1);
  assert.equal(preview.rows[0].status, 'rejected');
  assert.equal(preview.rows[0].reason, 'inventory not found');
});

test('computeAssignmentImportPreview: blank Plan with multiple plans for the same Software+Project is rejected as ambiguous', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([
    invLicense({ id: 'inv-1', name: 'Adobe Creative Cloud', plan: 'Business', project: 'AOA-MP' }),
    invLicense({ id: 'inv-2', name: 'Adobe Creative Cloud', plan: 'Enterprise', project: 'AOA-MP' }),
  ]);
  const preview = context.computeAssignmentImportPreview([
    { email: 'dev1@orbit.co.th', software: 'Adobe Creative Cloud', plan: '', project: 'AOA-MP', note: '' },
  ], context.getAllLicenses());
  assert.equal(preview.ambiguousCount, 1);
  assert.equal(preview.rows[0].status, 'ambiguous');
  assert.equal(preview.rejectedCount, 0, 'ambiguous rows are tracked separately from rejected rows');
});

test('computeAssignmentImportPreview: an explicit Plan disambiguates when multiple plans exist for the same Software+Project', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([
    invLicense({ id: 'inv-1', name: 'Adobe Creative Cloud', plan: 'Business', project: 'AOA-MP' }),
    invLicense({ id: 'inv-2', name: 'Adobe Creative Cloud', plan: 'Enterprise', project: 'AOA-MP' }),
  ]);
  const preview = context.computeAssignmentImportPreview([
    { email: 'dev1@orbit.co.th', software: 'Adobe Creative Cloud', plan: 'Enterprise', project: 'AOA-MP', note: '' },
  ], context.getAllLicenses());
  assert.equal(preview.validCount, 1);
  assert.equal(preview.rows[0].matchedLicenseId, 'inv-2');
});

test('computeAssignmentImportPreview: same user+software+project+plan appearing twice in the file is flagged duplicate, not valid twice', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([invLicense()]);
  const row = { email: 'designer1@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: '' };
  const preview = context.computeAssignmentImportPreview([row, { ...row }], context.getAllLicenses());
  assert.equal(preview.total, 2);
  assert.equal(preview.validCount, 1);
  assert.equal(preview.duplicateCount, 1);
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[1].status, 'duplicate');
});

test('computeAssignmentImportPreview: same software in different projects requires Project to disambiguate — no cross-project match', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([
    invLicense({ id: 'inv-geo9', name: 'Figma', plan: 'Professional', project: 'Geo9' }),
    invLicense({ id: 'inv-aoa', name: 'Figma', plan: 'Professional', project: 'AOA-MP' }),
  ]);
  const preview = context.computeAssignmentImportPreview([
    { email: 'designer1@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: '' },
  ], context.getAllLicenses());
  assert.equal(preview.rows[0].status, 'valid');
  assert.equal(preview.rows[0].matchedLicenseId, 'inv-geo9', 'must match the Geo9 record, never the AOA-MP one');
});

test('applyAssignmentImport: re-applying the same valid row does not double-count the assignment', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([invLicense({ seats: 5 })]);
  const allLicenses = context.getAllLicenses();
  const preview = context.computeAssignmentImportPreview([
    { email: 'designer1@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: '' },
  ], allLicenses);

  const applied1 = context.applyAssignmentImport(preview, allLicenses);
  const applied2 = context.applyAssignmentImport(preview, allLicenses);
  assert.equal(applied1, 1);
  assert.equal(applied2, 1);
  assert.equal(context._getLicUserManualRows().length, 1, 'manual row store must not grow on re-import');

  const recon = context.computeLicReconciliation(context.loadMemos(), context._getLicReviewState(), context._getLicUserOverrides());
  const row = recon.find(r => r.name === 'Figma');
  assert.equal(row.assignedCount, 1, 'assigned count must not double count a re-imported row');
});

test('an imported assignment appears in the Users tab for a user with no memo account-table row at all', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  context.storeManualLicenses([invLicense()]);
  const allLicenses = context.getAllLicenses();
  const preview = context.computeAssignmentImportPreview([
    { email: 'newuser@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: '' },
  ], allLicenses);
  context.applyAssignmentImport(preview, allLicenses);

  const elements = licUsersElements();
  const origGetById = context.document.getElementById;
  context.document.getElementById = id => elements[id] || origGetById(id);
  context._renderLicUsers();

  assert.match(elements['lic-usr-body'].innerHTML, /newuser@orbit\.co\.th/);
  assert.match(elements['lic-usr-body'].innerHTML, /Figma/);
});

test('imported assignment increases Reconciliation Assigned Users and decreases Remaining Seats', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([invLicense({ seats: 5 })]);
  const before = context.computeLicReconciliation(context.loadMemos(), context._getLicReviewState(), context._getLicUserOverrides());
  const beforeRow = before.find(r => r.name === 'Figma');
  assert.equal(beforeRow.purchased, 5);
  assert.equal(beforeRow.assignedCount, 0);
  assert.equal(beforeRow.remaining, 5);

  const allLicenses = context.getAllLicenses();
  const preview = context.computeAssignmentImportPreview([
    { email: 'newuser@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: '' },
  ], allLicenses);
  context.applyAssignmentImport(preview, allLicenses);

  const after = context.computeLicReconciliation(context.loadMemos(), context._getLicReviewState(), context._getLicUserOverrides());
  const afterRow = after.find(r => r.name === 'Figma');
  assert.equal(afterRow.assignedCount, 1);
  assert.equal(afterRow.remaining, 4);
});

test('imported assignment does not block on Review Queue status and is labeled "Import" in the Assigned Users drill-down', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([invLicense({ seats: 2 })]);
  const allLicenses = context.getAllLicenses();
  const preview = context.computeAssignmentImportPreview([
    { email: 'newuser@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: '' },
  ], allLicenses);
  context.applyAssignmentImport(preview, allLicenses);

  // No memos/review state exist at all — the import must not depend on the
  // Review Queue gate, which only governs memo-derived account-table rows.
  const recon = context.computeLicReconciliation([], {}, context._getLicUserOverrides());
  const row = recon.find(r => r.name === 'Figma');
  assert.equal(row.assignedCount, 1);
  assert.equal(row.assignedUsers[0].source, 'Import');
});

test('exportUserLicensesCSV includes an imported assignment for a user with no memo account-table row (fallback path, Users tab not yet rendered)', () => {
  const { context } = createLicenseContext();
  context.storeManualLicenses([invLicense()]);
  const allLicenses = context.getAllLicenses();
  const preview = context.computeAssignmentImportPreview([
    { email: 'newuser@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: '' },
  ], allLicenses);
  context.applyAssignmentImport(preview, allLicenses);

  let downloaded = null;
  context._downloadCSV = (name, headers, rows) => { downloaded = { name, headers, rows }; };
  context.exportUserLicensesCSV();

  assert.ok(downloaded);
  const headers = Array.from(downloaded.headers);
  assert.ok(headers.includes('Figma — Professional'));
  const rows = downloaded.rows.map(r => Array.from(r));
  const userRow = rows.find(r => r[0] === 'newuser@orbit.co.th');
  assert.ok(userRow, 'imported user must appear in the export even though no memo ever granted them anything');
  assert.equal(userRow[headers.indexOf('Figma — Professional')], '✓');
});

test('pre-existing legacy boolean overrides are unaffected by an unrelated Assignment Import', () => {
  const { context } = createLicenseContext();
  context.DOMParser = FakeAcctDOMParser;
  context.initMultiSelect = () => {};
  const memo = slMemo({
    memoNo: 'ORB-2900-001', project: 'AOA-MP',
    slItems: [{ name: 'Slack', plan: '', price: 50, qty: 3, months: 12 }],
    sections: [{ title: 'ตาราง Account', html:
      '<table><thead><tr><th>Email</th><th>Slack</th></tr></thead>' +
      '<tbody><tr><td>designer@orbit.co.th</td><td>✓</td></tr></tbody></table>' }],
  });
  context.storeMemos([memo]);
  // Legacy plain-boolean override, unrelated to the import below.
  context._saveLicUserOverrides({ 'designer@orbit.co.th|AOA-MP|Slack': false });

  context.storeManualLicenses([invLicense({ id: 'inv-9', name: 'Figma', plan: 'Professional', project: 'Geo9' })]);
  const allLicenses = context.getAllLicenses();
  const preview = context.computeAssignmentImportPreview([
    { email: 'newuser@orbit.co.th', software: 'Figma', plan: 'Professional', project: 'Geo9', note: '' },
  ], allLicenses);
  context.applyAssignmentImport(preview, allLicenses);

  const overrides = context._getLicUserOverrides();
  assert.equal(overrides['designer@orbit.co.th|AOA-MP|Slack'], false, 'legacy boolean override for an unrelated user/software must survive an import untouched');
  // Only one Figma record exists in inventory, so its assignable identity
  // stays the bare name (no "— Plan" suffix) per _licAssignableIdentities()
  // — same widening rule Manage Licenses already uses, reused unchanged here.
  const importedOv = overrides['newuser@orbit.co.th|Geo9|Figma'];
  assert.deepEqual({ ...importedOv }, { active: true, licenseId: 'inv-9', source: 'import', importedAt: importedOv.importedAt });
});
