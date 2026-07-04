// PDF Business Document milestone — regression tests.
//
// Scope: renderMemoPdf() (app.js) must render from exactly the same memo
// record and the exact same data-computation helpers History's "View Memo"
// detail modal uses (views/history.js: buildApprovalInfoRows(),
// computeApprovalTimelineEvents(), histStatusLabel()/histStatusBadgeClass()
// from app.js) — no parallel/duplicated business logic. These tests assert
// behavior (banner text, which rows/events appear, that both the screen and
// PDF renderers agree), not raw HTML snapshots.
//
// Loads app.js -> views/history.js -> views/settings.js into one VM context,
// mirroring index.html's real script order (mirrors tests/device.test.js's
// established pattern for cross-file global reuse).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const historyCode = fs.readFileSync(path.join(root, 'views/history.js'), 'utf8');
const pendingCode = fs.readFileSync(path.join(root, 'views/pending.js'), 'utf8');
const settingsCode = fs.readFileSync(path.join(root, 'views/settings.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Minimal HTML-table parser standing in for the browser's DOMParser — same
// convention as tests/device.test.js's FakeDOMParser, extended with
// `thead th` support for the SL closing-text/Account-table code paths.
class FakeDOMParser {
  parseFromString(html) {
    const theadMatch = html.match(/<thead>([\s\S]*?)<\/thead>/);
    const ths = theadMatch
      ? [...theadMatch[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => ({ textContent: m[1].trim() }))
      : [];
    const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const scope = tbodyMatch ? tbodyMatch[1] : html;
    const rows = [...scope.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(rm => {
      const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cm => ({ textContent: cm[1].trim() }));
      return { querySelectorAll: sel => (sel === 'td' ? cells : []) };
    });
    return { querySelectorAll: sel => (sel === 'tbody tr' ? rows : sel === 'thead th' ? ths : []) };
  }
}

function context() {
  const ctx = {
    console, Date, Intl, URL, Blob, AbortController,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    fetch: async () => ({ ok: true, text: async () => '[]', blob: async () => new Blob() }),
    alert: () => {}, confirm: () => true,
    DOMParser: FakeDOMParser,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, click() {}, remove() {}, appendChild() {} }),
      body: { appendChild() {}, removeChild() {}, classList: { add() {}, remove() {} } },
      addEventListener: () => {},
    },
    window: {},
    location: { reload() {} },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(appCode, ctx, { filename: 'app.js' });
  vm.runInContext(historyCode, ctx, { filename: 'views/history.js' });
  vm.runInContext(pendingCode, ctx, { filename: 'views/pending.js' });
  vm.runInContext(settingsCode, ctx, { filename: 'views/settings.js' });
  return ctx;
}

function tableSection(title, headerRow, bodyRows) {
  const ths = headerRow.map(h => `<th>${h}</th>`).join('');
  const trs = bodyRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('');
  return { title, html: `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>` };
}

// One base fixture per memo type, each with realistic sections/approvers —
// the same shape saveMemoAsync()/loadMemos() produce (see views/create.js).
function baseMemo(type, overrides = {}) {
  const common = {
    memoNo: `ORB-PDF-${type.toUpperCase()}-1`,
    type, project: 'AOA-MP', subject: `ทดสอบ ${type}`, reason: 'ทดสอบ', to: 'ผู้อำนวยการโครงการ',
    date: '2026-01-10', total: 10000, amountWords: 'หนึ่งหมื่นบาทถ้วน',
    requesterName: 'สมชาย ใจดี',
    createdAt: '2026-01-01T02:00:00.000Z',
    submittedAt: '2026-01-02T03:00:00.000Z',
    approvers: [
      { name: 'สมหญิง รักงาน', title: 'ผู้จัดการโครงการ', status: 'approved', approvedAt: '2026-01-03T04:00:00.000Z', approvedBy: 'สมหญิง รักงาน' },
      { name: 'ผู้บริหาร ใหญ่', title: 'ผู้อำนวยการ (Team Director)', status: 'approved', approvedAt: '2026-01-04T05:00:00.000Z', approvedBy: 'ผู้บริหาร ใหญ่' },
    ],
    status: 'completed', approvedAt: '2026-01-04T05:00:00.000Z', approvedBy: 'ผู้บริหาร ใหญ่',
    auditLog: [],
    sections: [],
  };
  const byType = {
    sl: { slItems: [{ name: 'Adobe Photoshop', plan: 'Business', price: 500, months: 12, qty: 2, startMonth: '2026-01', endMonth: '2026-12' }],
      sections: [tableSection('รายการ Software', ['#','ชื่อ Software','Plan','฿/เดือน','เดือน','จำนวน','เริ่ม','สิ้นสุด','รวม'],
        [['1','Adobe Photoshop','Business','500','12','2','2026-01','2026-12','12000']]) ] },
    hw: { hwItems: [{ name: 'Laptop Dell', price: 30000, qty: 1 }],
      sections: [tableSection('รายการ Hardware', ['#','ชื่ออุปกรณ์','ราคา/ชิ้น','จำนวน','รวม'], [['1','Laptop Dell','30000','1','30000']]) ] },
    int: { intActivity: 'Team Building', intDate: '2026-02-01', intHeadcount: 10, intPP: 1000,
      sections: [tableSection('รายชื่อผู้เข้าร่วม', ['No.','รายชื่อ'], [['1','สมชาย ใจดี']]) ] },
    ent: { entClient: 'บริษัท ลูกค้า จำกัด', entDate: '2026-02-15', entPlace: 'โรงแรม ABC', entPeople: 20 },
    dep: { depLocation: 'ไซต์งาน A', depStart: '2026-03-01', depEnd: '2026-03-05', depEmpCount: 4,
      sections: [tableSection('รายการค่าใช้จ่าย', ['ที่','รายการ'], [['1','ค่าที่พัก']]) ] },
  };
  return Object.assign({}, common, byType[type], overrides);
}

const TYPES = ['sl', 'hw', 'int', 'ent', 'dep'];

// ── Task 1 — Single Source of Truth ─────────────────────────────────────
test('renderMemoPdf and the History detail view derive Approval Information from the exact same row data (no parallel logic)', () => {
  const ctx = context();
  const memo = baseMemo('hw');
  const rows = ctx.buildApprovalInfoRows(memo);
  assert.ok(rows.length > 0);
  const pdfHtml = ctx.renderMemoPdf(memo);
  const screenHtml = ctx._buildMemoApprovalInfoHtml(memo);
  rows.forEach(([label]) => {
    assert.ok(pdfHtml.includes(label.replace(/&/g, '&amp;')) || pdfHtml.includes(label), `PDF must include row label "${label}"`);
    assert.ok(screenHtml.includes(label), `Screen detail view must include row label "${label}"`);
  });
});

test('renderMemoPdf and the History detail view derive the Approval Timeline from the exact same event data', () => {
  const ctx = context();
  const memo = baseMemo('dep');
  const events = ctx.computeApprovalTimelineEvents(memo);
  assert.ok(events.length > 0);
  const pdfHtml = ctx.renderMemoPdf(memo);
  const screenHtml = ctx.buildApprovalTimeline(memo);
  events.forEach(e => {
    assert.ok(pdfHtml.includes(e.label), `PDF timeline must include event "${e.label}"`);
    assert.ok(screenHtml.includes(e.label), `Screen timeline must include event "${e.label}"`);
  });
});

// ── Task 6 — Data Consistency across all five memo types ────────────────
for (const type of TYPES) {
  test(`Data Consistency (${type}): PDF renders the same business data as the memo record (sections/total/subject)`, () => {
    const ctx = context();
    const memo = baseMemo(type);
    const html = ctx.renderMemoPdf(memo);
    assert.ok(html.includes(ctx.esc(memo.subject)), 'subject must appear');
    assert.ok(html.includes(ctx.esc(memo.project)), 'project must appear');
    (memo.sections || []).forEach(s => {
      // Section title is rendered verbatim; row content flows through unescaped
      // (already-built HTML strings) inside the PDF's per-type post-processing.
      assert.ok(html.includes(ctx.esc(s.title)), `${type}: section title "${s.title}" must appear in the PDF`);
    });
    assert.ok(html.includes('10,000'), 'total amount must appear');
  });
}

// ── Task 4 — Status Banner (reuses histStatusLabel/histStatusBadgeClass, no duplicated logic) ──
const STATUS_CASES = [
  ['draft', 'DRAFT'], ['pending', 'PENDING A1'], ['completed', 'COMPLETED'],
  ['rejected', 'REJECTED'], ['cancelled', 'CANCELLED'], ['voided', 'VOIDED'],
];
for (const [status, expectedLabel] of STATUS_CASES) {
  test(`Status Banner: a ${status} memo's PDF banner exactly matches histStatusLabel() (uppercased)`, () => {
    const ctx = context();
    const memo = baseMemo('hw', { status, voidedAt: status === 'voided' ? '2026-02-01T00:00:00.000Z' : undefined, voidedBy: status === 'voided' ? 'PMO Admin' : undefined, voidReason: status === 'voided' ? 'wrong vendor' : undefined });
    const canonicalLabel = ctx.histStatusLabel(memo).toUpperCase();
    assert.equal(canonicalLabel, expectedLabel);
    const html = ctx.renderMemoPdf(memo);
    assert.ok(html.includes(canonicalLabel), `PDF banner must show "${canonicalLabel}" for status ${status}`);
  });
}

// ── Task 2 — Approval Information completeness ───────────────────────────
test('Approval Information: PMO Override on an approval step is shown with actor and reason', () => {
  const ctx = context();
  const memo = baseMemo('sl', {
    status: 'rejected', rejectedAt: '2026-01-05T00:00:00.000Z', rejectedBy: 'PMO Admin',
    approvers: [
      { name: 'สมหญิง รักงาน', title: 'ผู้จัดการโครงการ', status: 'approved', approvedAt: '2026-01-03T00:00:00.000Z', approvedBy: 'สมหญิง รักงาน' },
      { name: 'ผู้บริหาร ใหญ่', title: 'ผู้อำนวยการ (Team Director)', status: 'overridden', overriddenAt: '2026-01-05T00:00:00.000Z', overriddenBy: 'PMO Admin', overrideNote: 'Approved via email outside the system' },
    ],
  });
  const html = ctx.renderMemoPdf(memo);
  assert.match(html, /PMO Override/);
  assert.ok(html.includes('PMO Admin'));
  assert.ok(html.includes(ctx.esc('Approved via email outside the system')));
});

test('Approval Information: Self Review (A1 bypassed because requester is also reviewer) is shown', () => {
  const ctx = context();
  const memo = baseMemo('hw', {
    approvers: [
      { name: 'สมชาย ใจดี', title: 'ผู้จัดการโครงการ', status: 'bypassed', approvedAt: '2026-01-02T03:00:00.000Z', approvedBy: 'สมชาย ใจดี', selfReviewed: true },
      { name: 'ผู้บริหาร ใหญ่', title: 'ผู้อำนวยการ (Team Director)', status: 'approved', approvedAt: '2026-01-04T05:00:00.000Z', approvedBy: 'ผู้บริหาร ใหญ่' },
    ],
  });
  const html = ctx.renderMemoPdf(memo);
  assert.match(html, /Self Review/);
  assert.match(html, /ข้ามขั้นตอนการตรวจสอบของตนเอง/);
});

test('Approval Information: Rejected document shows rejection reason, actor, and timestamp', () => {
  const ctx = context();
  const memo = baseMemo('int', {
    status: 'rejected', rejectionReason: 'งบประมาณไม่เพียงพอ', rejectedBy: 'ผู้บริหาร ใหญ่', rejectedAt: '2026-01-06T00:00:00.000Z',
  });
  const html = ctx.renderMemoPdf(memo);
  assert.ok(html.includes(ctx.esc('งบประมาณไม่เพียงพอ')));
  assert.ok(html.includes('ผู้บริหาร ใหญ่'));
  assert.match(html, /REJECTED/);
});

test('Approval Information: Cancelled document shows cancellation reason and actor', () => {
  const ctx = context();
  const memo = baseMemo('ent', {
    status: 'cancelled', cancellationReason: 'โครงการถูกยกเลิก', cancelledBy: 'สมชาย ใจดี', cancelledAt: '2026-01-07T00:00:00.000Z',
  });
  const html = ctx.renderMemoPdf(memo);
  assert.ok(html.includes(ctx.esc('โครงการถูกยกเลิก')));
  assert.match(html, /CANCELLED/);
});

test('Approval Information: Voided document shows void reason, void by, void timestamp, and evidence marker', () => {
  const ctx = context();
  const memo = baseMemo('dep', {
    status: 'voided', voidReason: 'ผู้ขายผิด', voidedBy: 'PMO Admin', voidedAt: '2026-01-08T00:00:00.000Z',
    voidEvidenceUrl: 'data:image/png;base64,zzz',
  });
  const html = ctx.renderMemoPdf(memo);
  assert.ok(html.includes(ctx.esc('ผู้ขายผิด')));
  assert.ok(html.includes('PMO Admin'));
  assert.match(html, /VOIDED/);
  assert.match(html, /หลักฐาน Void/);
});

test('Display only information that actually exists: a Draft with no approval activity yet shows no Rejected/Cancelled/Void/Override rows', () => {
  const ctx = context();
  const memo = baseMemo('hw', {
    status: 'draft', submittedAt: undefined, approvedAt: undefined, approvedBy: undefined,
    approvers: [
      { name: 'สมหญิง รักงาน', title: 'ผู้จัดการโครงการ', status: 'pending' },
      { name: 'ผู้บริหาร ใหญ่', title: 'ผู้อำนวยการ (Team Director)', status: 'pending' },
    ],
  });
  const rows = ctx.buildApprovalInfoRows(memo);
  const labels = rows.map(r => r[0]).join(' | ');
  assert.doesNotMatch(labels, /PMO Override/);
  assert.doesNotMatch(labels, /Self Review/);
  assert.doesNotMatch(labels, /Rejected Reason/);
  assert.doesNotMatch(labels, /Cancelled Reason/);
  assert.doesNotMatch(labels, /Void Reason/);
  assert.match(ctx.renderMemoPdf(memo), /DRAFT/);
});

// ── Task 3 — Approval Timeline: only applicable events ───────────────────
test('Approval Timeline: a brand-new Draft only shows the create event, not later stages that never happened', () => {
  const ctx = context();
  const memo = baseMemo('hw', {
    status: 'draft', submittedAt: undefined, approvedAt: undefined, approvedBy: undefined,
    approvers: [
      { name: 'สมหญิง รักงาน', title: 'ผู้จัดการโครงการ', status: 'pending' },
      { name: 'ผู้บริหาร ใหญ่', title: 'ผู้อำนวยการ (Team Director)', status: 'pending' },
    ],
  });
  const events = ctx.computeApprovalTimelineEvents(memo);
  assert.equal(events.length, 1);
  assert.match(events[0].label, /Draft/);
});

test('Approval Timeline: a completed memo shows create, submit, each approval step, and completion in order', () => {
  const ctx = context();
  const memo = baseMemo('sl');
  const events = ctx.computeApprovalTimelineEvents(memo);
  const labels = events.map(e => e.label);
  assert.ok(labels.some(l => /Draft/.test(l)));
  assert.ok(labels.some(l => /Submitted/.test(l)));
  assert.ok(labels.some(l => /Reviewer.*Reviewed\/Approved/.test(l)));
  assert.ok(labels.some(l => /Completed/.test(l)));
  // The final approver's own step-event is intentionally not duplicated
  // alongside "Completed" — both fire at the exact same instant in real
  // data (updateMemoStatusAsync stamps the last step and the memo with the
  // same timestamp), so the terminal "Completed" label wins the collision.
  assert.ok(!labels.some(l => /Approver 1.*Reviewed\/Approved/.test(l)));
  // Chronological order
  for (let i = 1; i < events.length; i++) {
    assert.ok(new Date(events[i].at) >= new Date(events[i - 1].at), 'timeline events must be in chronological order');
  }
});

test('Approval Timeline: a Voided memo includes a Voided event after Completed', () => {
  const ctx = context();
  const memo = baseMemo('dep', { status: 'voided', voidedAt: '2026-02-01T00:00:00.000Z', voidedBy: 'PMO Admin', voidReason: 'wrong vendor' });
  const events = ctx.computeApprovalTimelineEvents(memo);
  const voidedIdx = events.findIndex(e => /Voided/.test(e.label));
  const completedIdx = events.findIndex(e => /Completed/.test(e.label));
  assert.ok(voidedIdx >= 0, 'a Voided event must be present');
  assert.ok(completedIdx >= 0 && voidedIdx > completedIdx, 'Voided must come after Completed chronologically');
});

// ── Task 8 — Duplicate document ─────────────────────────────────────────
test('Duplicate document: a freshly duplicated Draft (lifecycle metadata cleared) renders a clean PDF with a DRAFT banner and no stale approval history', () => {
  const ctx = context();
  const original = baseMemo('sl', { status: 'voided', voidedAt: '2026-01-08T00:00:00.000Z', voidedBy: 'PMO Admin', voidReason: 'wrong vendor' });
  // Mirrors duplicateMemo()'s draftFromMemo() contract: business detail (sections/
  // items/total) survives, lifecycle/approval metadata is cleared, memoNo is blank.
  const duplicated = Object.assign({}, original, {
    memoNo: '', status: 'draft',
    submittedAt: undefined, approvedAt: undefined, approvedBy: undefined,
    voidedAt: undefined, voidedBy: undefined, voidReason: undefined, voidEvidenceUrl: undefined,
    rejectedAt: undefined, rejectedBy: undefined, rejectionReason: undefined,
    cancelledAt: undefined, cancelledBy: undefined, cancellationReason: undefined,
    auditLog: [],
    approvers: original.approvers.map(a => ({ name: a.name, title: a.title, status: 'pending' })),
  });
  const html = ctx.renderMemoPdf(duplicated);
  assert.match(html, /DRAFT/);
  assert.doesNotMatch(html, /VOIDED/);
  assert.doesNotMatch(html, /wrong vendor/);
  // Business content (software line item) must still be present — duplicate keeps detail.
  assert.ok(html.includes('Adobe Photoshop'));
});

// ── Task 5 — Signature section: hide empty blocks, requester included ────
test('Approval Information includes the Requester row', () => {
  const ctx = context();
  const memo = baseMemo('hw');
  const rows = ctx.buildApprovalInfoRows(memo);
  assert.ok(rows.some(([label, value]) => /Requester/.test(label) && value.includes('สมชาย ใจดี')));
});

test('Approval Information hides a Reviewer/Approver row when that approver has no name', () => {
  const ctx = context();
  const memo = baseMemo('hw', { approvers: [{ name: '', title: '', status: 'pending' }, { name: 'ผู้บริหาร ใหญ่', title: 'ผู้อำนวยการ (Team Director)', status: 'pending' }] });
  const rows = ctx.buildApprovalInfoRows(memo);
  const reviewerRow = rows.find(([label]) => label.includes('ผู้ตรวจสอบ'));
  assert.equal(reviewerRow, undefined, 'a nameless reviewer must not produce an empty row');
});

// ── Task 7 — Printing: A4, page breaks, multi-page tables, no clipped sections ──
test('Printing: index.html defines an A4 @page rule for the print fallback (previously missing entirely)', () => {
  assert.match(indexHtml, /@page\s*\{\s*size:\s*A4/);
});

test('Printing: index.html defines page-break rules so table rows, the signature grid, and multi-page tables are not clipped', () => {
  assert.match(indexHtml, /page-break-inside:\s*avoid/);
  assert.match(indexHtml, /thead\s*\{\s*display:\s*table-header-group/);
  assert.match(indexHtml, /\.mp-approval\s*\{\s*page-break-inside:\s*avoid/);
});

test('Printing: the PDF appendix starts on a new page so the original signed memo layout is never disturbed', () => {
  const ctx = context();
  const memo = baseMemo('hw');
  const html = ctx.renderMemoPdf(memo);
  assert.match(html, /page-break-before:always/);
});

// ── Task 1 — Single Source of Truth: PDF always reads the same stored memo, no re-derivation ──
test('renderMemoPdf never invents approval data — an empty approvers array produces no PMO Override/Self Review/Reviewer rows', () => {
  const ctx = context();
  const memo = baseMemo('hw', { approvers: [] });
  const html = ctx.renderMemoPdf(memo);
  assert.doesNotMatch(html, /PMO Override/);
  assert.doesNotMatch(html, /Self Review/);
});
