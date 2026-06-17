// ─────────────────────────────────────────────────────────────
// views/license.js  —  License Management  (4-tab redesign)
// Tabs: Memo Index | By Project | Users | Other
// Data sources:
//   1. SL memos (completed) → slItems JSON → memo-derived licenses
//   2. SL memos sections['ตาราง Account'] → user × license matrix
//   3. licenses Supabase table (source='manual') → manual / other
// ─────────────────────────────────────────────────────────────

const LICENSE_KEY = 'orbit-pmo-licenses-v1';
let _licCache = null;
let _licCurrentTab = 'memo-index';

// ── Supabase field mapping ──────────────────────────────────
function licenseToDb(l) {
  return {
    id:              String(l.id),
    name:            l.name,
    plan:            l.plan || null,
    vendor:          l.vendor || null,
    seats:           Number(l.seats) || 1,
    price_per_month: Number(l.pricePerMonth) || 0,
    owner:           l.owner || null,
    department:      l.department || null,
    project:         l.project || null,
    license_type:    l.licenseType || 'subscription',
    purchase_date:   l.purchaseDate || null,
    expiry:          l.expiry || null,
    billing_freq:    l.billingFreq || 'monthly',
    status_override: l.statusOverride || null,
    memo_no:         l.memoNo || null,
    note:            l.note || null,
    source:          l.source || 'manual',
    updated_at:      l.updatedAt || new Date().toISOString(),
  };
}
function dbToLicense(r) {
  return {
    id: r.id, name: r.name, plan: r.plan || '',
    vendor: r.vendor || '',
    seats: Number(r.seats) || 1, pricePerMonth: Number(r.price_per_month) || 0,
    owner: r.owner || '', department: r.department || '', project: r.project || '',
    licenseType: r.license_type || 'subscription', purchaseDate: r.purchase_date || '',
    expiry: r.expiry || null, billingFreq: r.billing_freq || 'monthly',
    statusOverride: r.status_override || null, memoNo: r.memo_no || '',
    note: r.note || '', source: r.source || 'manual',
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ── localStorage / Supabase CRUD ───────────────────────────
function loadManualLicenses() {
  try { const d = JSON.parse(localStorage.getItem(LICENSE_KEY) || '[]'); return Array.isArray(d) ? d : []; }
  catch(e) { return []; }
}
function storeManualLicenses(ls) {
  try { localStorage.setItem(LICENSE_KEY, JSON.stringify(ls)); } catch(e) {}
}
function nextLicenseId() { return `lic_${Date.now()}`; }

async function loadManualLicensesAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('licenses', 'GET', null, '?source=eq.manual&order=created_at.desc&limit=500');
      _licCache = (rows || []).map(dbToLicense);
      try { localStorage.setItem(LICENSE_KEY, JSON.stringify(_licCache)); } catch(e) {}
      return _licCache;
    } catch(e) { console.warn('Supabase licenses read failed', e.message); }
  }
  return loadManualLicenses();
}
async function saveLicenseAsync(data) {
  const saved = { ...data, updatedAt: new Date().toISOString() };
  if (await checkSupa()) {
    try { await supaFetch('licenses', 'POST', licenseToDb(saved), '?on_conflict=id'); _licCache = null; return saved; }
    catch(e) { console.warn('Supabase license save failed', e.message); }
  }
  const ls = loadManualLicenses(); const idx = ls.findIndex(l => String(l.id) === String(data.id));
  if (idx >= 0) ls[idx] = saved; else ls.push(saved);
  storeManualLicenses(ls); return saved;
}
async function deleteLicenseAsync(id) {
  if (await checkSupa()) {
    try { await supaFetch('licenses', 'DELETE', null, '?id=eq.' + encodeURIComponent(id)); _licCache = null; }
    catch(e) { console.warn('Supabase license delete failed', e.message); }
  }
  storeManualLicenses(loadManualLicenses().filter(l => String(l.id) !== String(id)));
}

// ── Parse SL memo → licenses (use slItems JSON not HTML) ───
function parseLicenseFromMemo(memo) {
  if (memo.type !== 'sl' || memo.status !== 'completed') return [];
  const purchaseDate = memo.approvedAt || memo.updatedAt || memo.createdAt;
  const fxRate = Number(memo.fxRate) || 1;

  // Prefer slItems (structured JSON) over parsing HTML
  const items = (memo.slItems && memo.slItems.length)
    ? memo.slItems
    : _parseSlItemsFromHtml(memo);

  return items
    .filter(it => it.name && it.name !== '-')
    .map(it => {
      const price  = Number(it.price) || 0;
      const months = Number(it.months) || 12;
      const seats  = Number(it.qty) || 1;
      const start  = (it.startMonth && it.startMonth.match(/^\d{4}-\d{2}$/))
        ? new Date(it.startMonth + '-01')
        : new Date(purchaseDate);
      const expiry = new Date(start);
      expiry.setMonth(expiry.getMonth() + months);
      return {
        id: `memo-${memo.memoNo}-${it.name}`.replace(/\s/g, '_'),
        name: it.name, plan: it.plan || '', seats, pricePerMonth: price, months,
        fxRate, pricePerMonthTHB: price * fxRate,
        purchaseDate: start.toISOString(),
        expiry: expiry.toISOString(),
        project: memo.project, memoNo: memo.memoNo,
        source: 'memo', owner: '', department: '',
        vendor: '', billingFreq: 'monthly', licenseType: 'subscription',
        statusOverride: null, note: '',
        startMonth: it.startMonth || '', endMonth: it.endMonth || '',
        memoYear: new Date(memo.approvedAt || memo.createdAt).getFullYear(),
      };
    });
}

// Fallback: parse slItems from HTML if slItems JSON is empty
function _parseSlItemsFromHtml(memo) {
  const section = memo.sections?.find(s => s.title === 'รายการ Software');
  if (!section) return [];
  const doc = new DOMParser().parseFromString(section.html, 'text/html');
  const items = [];
  doc.querySelectorAll('tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 6) return;
    items.push({
      name:       cells[1]?.textContent?.trim(),
      price:      parseFloat((cells[2]?.textContent || '').replace(/[฿,]/g, '')) || 0,
      months:     parseInt(cells[3]?.textContent) || 12,
      qty:        parseInt(cells[4]?.textContent) || 1,
      startMonth: cells[5]?.textContent?.trim(),
      endMonth:   cells[6]?.textContent?.trim(),
    });
  });
  return items;
}

// ── Parse account table from SL memo ──────────────────────
// Returns { cols: ['GitHub','Figma Dev',...], rows: [{email, licenses:{GitHub:true,...}}] }
function parseAccountTableFromMemo(memo) {
  const section = memo.sections?.find(s => s.title === 'ตาราง Account');
  if (!section) return null;
  const doc = new DOMParser().parseFromString(section.html, 'text/html');
  const headerCells = [...doc.querySelectorAll('thead th')];
  // First col is Email, rest are license names
  const cols = headerCells.slice(1).map(th => th.textContent.trim()).filter(Boolean);
  if (!cols.length) return null;
  const rows = [];
  doc.querySelectorAll('tbody tr').forEach(tr => {
    const cells = [...tr.querySelectorAll('td')];
    const email = cells[0]?.textContent?.trim();
    if (!email) return;
    const licenses = {};
    cols.forEach((col, i) => {
      const val = cells[i + 1]?.textContent?.trim();
      licenses[col] = val === '✓';
    });
    rows.push({ email, licenses });
  });
  return { cols, rows };
}

// ── getAllLicenses: memo-derived + manual merged ─────────
function getAllLicenses() {
  const memoLicenses = loadMemos()
    .filter(m => m.type === 'sl' && m.status === 'completed')
    .flatMap(parseLicenseFromMemo);
  const manual = _licCache !== null ? _licCache : loadManualLicenses();
  const manualIds = new Set(manual.map(l => l.id));
  return [...memoLicenses.filter(l => !manualIds.has(l.id)), ...manual];
}

// ── Status logic ─────────────────────────────────────────
function getLicenseStatus(lic) {
  if (lic.statusOverride === 'cancelled') return { label: 'Cancelled', badge: 'badge-gray', days: null, key: 'cancelled' };
  if (!lic.expiry) return { label: 'Active', badge: 'badge-green', days: null, key: 'active' };
  const days = Math.floor((new Date(lic.expiry) - new Date()) / 86400000);
  if (days < 0)   return { label: 'Expired',     badge: 'badge-red',    days, key: 'expired' };
  if (days <= 7)  return { label: `${days}d`,    badge: 'badge-red',    days, key: 'expiring-7' };
  if (days <= 15) return { label: `${days}d`,    badge: 'badge-orange', days, key: 'expiring-15' };
  if (days <= 30) return { label: `${days}d`,    badge: 'badge-amber',  days, key: 'expiring-30' };
  return                  { label: 'Active',     badge: 'badge-green',  days, key: 'active' };
}

// ── Main render entry point ───────────────────────────────
function renderLicense() {
  loadManualLicensesAsync()
    .then(() => _renderLicTab(_licCurrentTab))
    .catch(() => _renderLicTab(_licCurrentTab));
}

function switchLicTab(tab) {
  _licCurrentTab = tab;
  document.querySelectorAll('.lic-tab-btn').forEach(b => {
    b.classList.toggle('lic-tab-active', b.dataset.tab === tab);
  });
  _renderLicTab(tab);
}

function _renderLicTab(tab) {
  if (tab === 'memo-index')  _renderLicMemoIndex();
  if (tab === 'by-project')  _renderLicByProject();
  if (tab === 'users')       _renderLicUsers();
  if (tab === 'other')       _renderLicOther();
}

// ── TAB 1: MEMO INDEX ─────────────────────────────────────
function _populateLicenseFilters(allLicenses) {
  const projSel = document.getElementById('lic-filter-project');
  if (projSel) {
    const cur = projSel.value;
    const projects = [...new Set(allLicenses.map(l => l.project).filter(Boolean))].sort();
    projSel.innerHTML = `<option value="all">ทุกโครงการ</option>` +
      projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    if ([...projSel.options].some(o => o.value === cur)) projSel.value = cur;
  }
  const modalProj = document.getElementById('lic-project');
  if (modalProj) {
    const s = typeof loadSettings === 'function' ? loadSettings() : null;
    const projects = s?.projects || [...new Set(allLicenses.map(l => l.project).filter(Boolean))].sort();
    const cur = modalProj.value;
    modalProj.innerHTML = `<option value="">— ไม่ระบุ —</option>` +
      projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    if ([...modalProj.options].some(o => o.value === cur)) modalProj.value = cur;
  }
}

function _renderLicMemoIndex() {
  const el = document.getElementById('lic-content');
  if (!el) return;

  el.innerHTML = `
    <div class="metric-row" style="grid-template-columns:repeat(5,1fr);margin-bottom:14px">
      <div class="metric-card"><div class="metric-label">Active Licenses</div><div class="metric-val" id="lic-active" style="color:var(--blue)">0</div><div class="metric-sub" id="lic-active-cost"></div></div>
      <div class="metric-card"><div class="metric-label">Expiring Soon (≤30d)</div><div class="metric-val" id="lic-expiring" style="color:var(--amber)">0</div><div class="metric-sub">ต้องต่ออายุเร็วๆ นี้</div></div>
      <div class="metric-card"><div class="metric-label">Expired</div><div class="metric-val" id="lic-expired" style="color:var(--red)">0</div><div class="metric-sub">หมดอายุแล้ว</div></div>
      <div class="metric-card"><div class="metric-label">ค่าใช้จ่าย/เดือน</div><div class="metric-val" id="lic-monthly" style="font-size:18px;margin-top:4px">฿0</div><div class="metric-sub">รวมทุก active</div></div>
      <div class="metric-card"><div class="metric-label">ค่าใช้จ่าย/ปี</div><div class="metric-val" id="lic-annual" style="font-size:18px;margin-top:4px">฿0</div><div class="metric-sub" id="lic-renewal-3m"></div></div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
      <input type="text" id="lic-search" placeholder="🔍 ค้นหา Software, Project, Owner..."
        style="font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface);min-width:200px;outline:none"
        oninput="_renderLicMemoIndexRows()">
      <select id="lic-filter-status" onchange="_renderLicMemoIndexRows()" style="font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
        <option value="all">ทุกสถานะ</option>
        <option value="active">Active</option>
        <option value="expiring">Expiring (≤30d)</option>
        <option value="expiring-7">≤ 7 วัน</option>
        <option value="expiring-15">≤ 15 วัน</option>
        <option value="expiring-30">≤ 30 วัน</option>
        <option value="expired">Expired</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select id="lic-filter-project" onchange="_renderLicMemoIndexRows()" style="font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
        <option value="all">ทุกโครงการ</option>
      </select>
      <select id="lic-sort" onchange="_renderLicMemoIndexRows()" style="font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
        <option value="expiry-asc">หมดอายุใกล้สุด</option>
        <option value="cost-desc">ราคา มาก→น้อย</option>
        <option value="seats-desc">Seats มาก→น้อย</option>
        <option value="purchase-desc">ซื้อล่าสุด</option>
      </select>
      <button class="btn-sm" style="font-size:12px;padding:6px 12px" onclick="downloadTemplate('license')" title="Download Template">⬇ Template</button>
      <button class="btn-sm" style="font-size:12px;padding:6px 12px" onclick="importBulk('license')" title="Import from Excel">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Import Excel
      </button>
      <button class="btn-primary" style="font-size:12px;padding:6px 14px" onclick="openLicenseModal()">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add License
      </button>
    </div>

    <div class="card" style="padding:0;overflow:hidden">
      <table class="hist-table">
        <thead><tr>
          <th style="width:15%;padding-left:16px">Software</th>
          <th style="width:7%">Seats</th>
          <th style="width:9%">฿/เดือน</th>
          <th style="width:9%">Owner</th>
          <th style="width:8%">Department</th>
          <th style="width:8%">โครงการ</th>
          <th style="width:8%">วันที่ซื้อ</th>
          <th style="width:8%">หมดอายุ</th>
          <th style="width:9%;text-align:center">สถานะ</th>
          <th style="width:7%;text-align:center">Source</th>
          <th style="width:8%;text-align:center">Actions</th>
        </tr></thead>
        <tbody id="lic-table-body"></tbody>
      </table>
    </div>`;

  _renderLicMemoIndexRows();
}

function _renderLicMemoIndexRows() {
  const allLicenses = getAllLicenses();
  _populateLicenseFilters(allLicenses);
  const search     = (document.getElementById('lic-search')?.value || '').toLowerCase();
  const filterSt   = document.getElementById('lic-filter-status')?.value || 'all';
  const filterProj = document.getElementById('lic-filter-project')?.value || 'all';
  const sort       = document.getElementById('lic-sort')?.value || 'expiry-asc';

  // Metrics
  let activeCount = 0, renewSoonCount = 0, expiredCount = 0, monthlyCost = 0;
  allLicenses.forEach(lic => {
    const s = getLicenseStatus(lic);
    const cost = (lic.pricePerMonthTHB ?? lic.pricePerMonth ?? 0) * (lic.seats || 1);
    if (s.key === 'active') { activeCount++; monthlyCost += cost; }
    if (s.key === 'expiring-7' || s.key === 'expiring-15' || s.key === 'expiring-30') { renewSoonCount++; monthlyCost += cost; }
    if (s.key === 'expired') expiredCount++;
  });
  const annualCost = monthlyCost * 12;

  const in3m = new Date(); in3m.setMonth(in3m.getMonth() + 3);
  const renewal3m = allLicenses
    .filter(l => { if (!l.expiry) return false; const e = new Date(l.expiry); return e >= new Date() && e <= in3m; })
    .reduce((s, l) => s + (l.pricePerMonthTHB ?? l.pricePerMonth ?? 0) * (l.seats || 1) * (l.months || 12), 0);

  const setText = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  setText('lic-active', activeCount);
  setText('lic-active-cost', monthlyCost ? money(monthlyCost) + '/เดือน' : '');
  setText('lic-expiring', renewSoonCount);
  setText('lic-expired', expiredCount);
  setText('lic-monthly', money(monthlyCost));
  setText('lic-annual', money(annualCost));
  setText('lic-renewal-3m', renewal3m ? `Renewal 3m: ${money(renewal3m)}` : 'ไม่มี renewal ใน 3 เดือน');

  let filtered = allLicenses.filter(lic => {
    const s = getLicenseStatus(lic);
    if (filterSt !== 'all') {
      if (filterSt === 'expiring' && !['expiring-7', 'expiring-15', 'expiring-30'].includes(s.key)) return false;
      if (filterSt !== 'expiring' && s.key !== filterSt) return false;
    }
    if (filterProj !== 'all' && lic.project !== filterProj) return false;
    if (search) {
      const hay = `${lic.name} ${lic.project} ${lic.owner} ${lic.vendor} ${lic.department}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const costA = (a.pricePerMonthTHB ?? a.pricePerMonth ?? 0) * (a.seats || 1);
    const costB = (b.pricePerMonthTHB ?? b.pricePerMonth ?? 0) * (b.seats || 1);
    if (sort === 'cost-desc')     return costB - costA;
    if (sort === 'seats-desc')    return (b.seats || 1) - (a.seats || 1);
    if (sort === 'purchase-desc') return new Date(b.purchaseDate || 0) - new Date(a.purchaseDate || 0);
    const sa = getLicenseStatus(a), sb = getLicenseStatus(b);
    if (sa.key === 'expired' && sb.key !== 'expired') return 1;
    if (sb.key === 'expired' && sa.key !== 'expired') return -1;
    if (!a.expiry) return 1; if (!b.expiry) return -1;
    return new Date(a.expiry) - new Date(b.expiry);
  });

  const tbody = document.getElementById('lic-table-body');
  if (!tbody) return;
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:34px 16px;color:var(--text-3)">ยังไม่มีข้อมูล${search ? ' ที่ตรงกับการค้นหา' : ''} — Approve SL Memo หรือกด Add License</td></tr>`;
    return;
  }

  window._licFiltered = filtered;
  tbody.innerHTML = filtered.map((lic, _idx) => {
    const s = getLicenseStatus(lic);
    const monthlyCostLic = (lic.pricePerMonthTHB ?? lic.pricePerMonth ?? 0) * (lic.seats || 1);
    const sourceBadge = lic.source === 'memo'
      ? `<span style="font-size:10px;background:#E6F1FB;color:#0C447C;padding:1px 6px;border-radius:3px;white-space:nowrap">Memo</span>`
      : `<span style="font-size:10px;background:#F1EFE8;color:#5F5E5A;padding:1px 6px;border-radius:3px;white-space:nowrap">Manual</span>`;
    return `<tr>
      <td style="padding-left:16px;font-weight:600">
        ${esc(lic.name)}
        ${lic.vendor ? `<div style="font-size:10px;color:var(--text-3);font-weight:400">${esc(lic.vendor)}</div>` : ''}
        ${lic.memoNo ? `<div style="font-size:10px;color:var(--blue);font-weight:400;cursor:pointer" onclick="openMemoPdf && openMemoPdf('${esc(lic.memoNo)}')">${esc(lic.memoNo)}</div>` : ''}
      </td>
      <td>${esc(lic.seats || 1)}</td>
      <td class="mono">${esc(money(monthlyCostLic))}</td>
      <td style="font-size:12px">${esc(lic.owner || '—')}</td>
      <td style="font-size:12px">${esc(lic.department || '—')}</td>
      <td style="font-size:12px">${esc(lic.project || '—')}</td>
      <td style="font-size:11px">${esc(shortDate(lic.purchaseDate))}</td>
      <td style="font-size:11px">${esc(shortDate(lic.expiry))}</td>
      <td style="text-align:center"><span class="badge ${s.badge}">${esc(s.label)}</span></td>
      <td style="text-align:center">${sourceBadge}</td>
      <td style="text-align:center;white-space:nowrap">
        <button class="btn-sm" data-action="edit" data-idx="${_idx}" style="padding:3px 7px;font-size:11px" title="${lic.source === 'memo' ? 'แก้ไข owner/dept/note' : 'Edit'}">✎</button>
        ${lic.source !== 'memo' ? `<button class="btn-sm" data-action="delete" data-idx="${_idx}" style="padding:3px 7px;font-size:11px;color:var(--red)" title="Delete">✕</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  tbody.onclick = function(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const lic = window._licFiltered?.[idx];
    if (!lic) return;
    if (btn.dataset.action === 'edit')   openLicenseModal(String(lic.id));
    if (btn.dataset.action === 'delete') deleteLicense(String(lic.id));
  };
}

function _worstLicenseStatus(lics) {
  const order = ['expired','expiring-7','expiring-15','expiring-30','active','cancelled'];
  const statuses = lics.map(l => getLicenseStatus(l));
  return statuses.sort((a,b) => order.indexOf(a.key) - order.indexOf(b.key))[0]
    || { label:'Active', badge:'badge-green', key:'active', days:null };
}

// ── TAB 2: LICENSE SUMMARY ───────────────────────────────
let _bpYear = 'all';

function _renderLicByProject() {
  const el = document.getElementById('lic-content');
  if (!el) return;

  const allLics = getAllLicenses().filter(l => getLicenseStatus(l).key !== 'cancelled');
  const years   = [...new Set(allLics.map(l => l.memoYear).filter(Boolean))].sort((a,b)=>b-a);

  el.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
      <div>
        <div style="font-size:11px;color:var(--text-2);margin-bottom:4px">Year</div>
        <select onchange="_bpYear=this.value;_bpRenderMatrix()" style="font-size:12px;padding:5px 8px;border:0.5px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface);color:var(--text-1)">
          <option value="all">All years</option>
          ${years.map(y=>`<option value="${y}" ${String(y)===_bpYear?'selected':''}>${y}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="bp-table-wrap"></div>`;

  _bpRenderMatrix();
}

function _bpGetFiltered() {
  return getAllLicenses().filter(l => {
    if (getLicenseStatus(l).key === 'cancelled') return false;
    if (_bpYear !== 'all' && String(l.memoYear) !== String(_bpYear)) return false;
    return true;
  });
}

function _bpRenderMatrix() {
  const wrap = document.getElementById('bp-table-wrap');
  if (!wrap) return;
  const filtered = _bpGetFiltered();
  const projects = [...new Set(filtered.map(l => l.project || '(ไม่ระบุ)'))].sort();

  const rowMap = {};
  filtered.forEach(l => {
    const k = `${l.name}||${l.plan||''}`;
    if (!rowMap[k]) rowMap[k] = { name: l.name, plan: l.plan||'', byProj: {}, total: 0 };
    const proj = l.project || '(ไม่ระบุ)';
    rowMap[k].byProj[proj] = (rowMap[k].byProj[proj]||0) + (l.seats||1);
    rowMap[k].total += (l.seats||1);
  });

  const matrixRows = Object.values(rowMap).sort((a,b) => a.name.localeCompare(b.name) || a.plan.localeCompare(b.plan));
  const grandTotal = matrixRows.reduce((s,r) => s+r.total, 0);

  const head = `<thead><tr>
    <th style="padding-left:14px">License</th>
    <th>Plan</th>
    ${projects.map(p=>`<th style="text-align:right;white-space:nowrap">${esc(p)}</th>`).join('')}
    <th style="text-align:right">Total</th>
  </tr></thead>`;

  const bodyRows = matrixRows.map(r => `<tr onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background=''">
    <td style="padding-left:14px;font-weight:500">${esc(r.name)}</td>
    <td style="font-size:12px;color:var(--text-2)">${esc(r.plan)||'<span style="color:var(--text-3)">—</span>'}</td>
    ${projects.map(p => r.byProj[p]
      ? `<td style="text-align:right">${r.byProj[p]}</td>`
      : `<td style="text-align:right;color:var(--text-3)">—</td>`
    ).join('')}
    <td style="text-align:right;font-weight:500">${r.total}</td>
  </tr>`).join('');

  const totalRow = `<tr style="font-weight:600;background:var(--bg-2,#F8F8F6);border-top:0.5px solid var(--border-md)">
    <td style="padding-left:14px">Total</td>
    <td></td>
    ${projects.map(p => {
      const t = matrixRows.reduce((s,r) => s+(r.byProj[p]||0), 0);
      return `<td style="text-align:right">${t||'—'}</td>`;
    }).join('')}
    <td style="text-align:right">${grandTotal}</td>
  </tr>`;

  wrap.innerHTML = `<div class="card" style="padding:0;overflow:hidden;overflow-x:auto">
    <table class="hist-table" style="min-width:500px">
      ${head}<tbody>${bodyRows}${totalRow}</tbody>
    </table>
  </div>`;
}

// ── TAB 3: USERS ─────────────────────────────────────────
function _renderLicUsers() {
  const memos = loadMemos().filter(m => m.type === 'sl' && m.status === 'completed');

  // Parse all account tables
  const allUserRows = []; // { email, project, memoNo, licenses:{name:bool} }
  const allLicColsSet = new Set();
  memos.forEach(memo => {
    const acct = parseAccountTableFromMemo(memo);
    if (!acct || !acct.rows.length) return;
    acct.cols.forEach(c => allLicColsSet.add(c));
    acct.rows.forEach(r => allUserRows.push({
      email: r.email,
      project: memo.project || '',
      memoNo: memo.memoNo,
      licenses: r.licenses,
    }));
  });

  const allLicCols = [...allLicColsSet].sort();
  const projects   = [...new Set(allUserRows.map(r=>r.project).filter(Boolean))].sort();

  const el = document.getElementById('lic-content');
  if (!el) return;

  if (!allUserRows.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-3)">
      ยังไม่มีข้อมูลผู้ใช้ — กรอก "ตาราง Account" ใน SL Memo เพื่อให้ข้อมูลปรากฎที่นี่
    </div>`;
    return;
  }

  el.innerHTML = `
    <div style="background:var(--bg-2,#F8F8F6);border-radius:var(--r-sm);padding:8px 12px;margin-bottom:12px;font-size:11px;color:var(--text-2)">
      ℹ ข้อมูลมาจาก "ตาราง Account" ใน SL Memo — email + ✓/- ต่อโปรแกรม
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center">
      <input id="lic-usr-search" type="text" placeholder="ค้นหา email..."
        style="font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface);min-width:200px"
        oninput="_renderLicUsersRows(${JSON.stringify(allUserRows)}, ${JSON.stringify(allLicCols)})">
      <select id="lic-usr-proj" onchange="_renderLicUsersRows(${JSON.stringify(allUserRows)}, ${JSON.stringify(allLicCols)})"
        style="font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
        <option value="all">ทุก project</option>
        ${projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
      <select id="lic-usr-lic" onchange="_renderLicUsersRows(${JSON.stringify(allUserRows)}, ${JSON.stringify(allLicCols)})"
        style="font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
        <option value="all">ทุก license</option>
        ${allLicCols.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div class="card" style="padding:0;overflow:hidden;overflow-x:auto">
      <table class="hist-table" style="min-width:500px" id="lic-usr-table">
        <thead><tr>
          <th style="padding-left:14px">Email</th>
          <th>Project</th>
          ${allLicCols.map(c=>`<th style="text-align:center;white-space:nowrap">${esc(c)}</th>`).join('')}
          <th>Memo</th>
        </tr></thead>
        <tbody id="lic-usr-body"></tbody>
      </table>
    </div>
    <div style="font-size:11px;color:var(--text-2);margin-top:6px">
      ✅ = ได้รับ license นี้ · — = ไม่ได้รับ (ตามที่กรอกใน memo)
    </div>`;

  _renderLicUsersRows(allUserRows, allLicCols);
}

function _renderLicUsersRows(allUserRows, allLicCols) {
  const search  = (document.getElementById('lic-usr-search')?.value || '').toLowerCase();
  const projF   = document.getElementById('lic-usr-proj')?.value || 'all';
  const licF    = document.getElementById('lic-usr-lic')?.value || 'all';
  const tbody   = document.getElementById('lic-usr-body');
  if (!tbody) return;

  let rows = allUserRows;
  if (projF !== 'all') rows = rows.filter(r => r.project === projF);
  if (licF  !== 'all') rows = rows.filter(r => r.licenses[licF] === true);
  if (search) rows = rows.filter(r => r.email.toLowerCase().includes(search));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${allLicCols.length+3}" style="text-align:center;padding:24px;color:var(--text-3)">ไม่พบข้อมูล</td></tr>`;
    return;
  }

  // Deduplicate: if same email appears in multiple memos for same license, merge
  const emailMap = {};
  rows.forEach(r => {
    const key = `${r.email}|${r.project}`;
    if (!emailMap[key]) emailMap[key] = { email: r.email, project: r.project, memos: new Set(), licenses: {} };
    emailMap[key].memos.add(r.memoNo);
    Object.entries(r.licenses).forEach(([lic, val]) => {
      if (val) emailMap[key].licenses[lic] = true;
    });
  });

  tbody.innerHTML = Object.values(emailMap).map(r => {
    const initials = r.email.substring(0, 2).toUpperCase();
    return `<tr>
      <td style="padding-left:14px">
        <span style="width:26px;height:26px;border-radius:50%;background:var(--blue-50,#E6F1FB);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--blue);margin-right:6px;vertical-align:middle">${initials}</span>
        ${esc(r.email)}
      </td>
      <td style="font-size:12px">${esc(r.project)}</td>
      ${allLicCols.map(c => `<td style="text-align:center;font-size:13px">${r.licenses[c] ? '✅' : '<span style="color:var(--text-3)">—</span>'}</td>`).join('')}
      <td style="font-size:11px;color:var(--text-2)">${[...r.memos].join(', ')}</td>
    </tr>`;
  }).join('');
}

// ── TAB 4: OTHER LICENSE ─────────────────────────────────
function _renderLicOther() {
  // "Other" = manual licenses (not memo-derived) OR memo licenses with no seat-based plan
  const allLics = getAllLicenses();
  const manual  = allLics.filter(l => l.source === 'manual');
  const fxRate  = _getLicFxRate();

  const licTypes = [...new Set(manual.map(l => l.licenseType || 'subscription'))].sort();
  const projects  = [...new Set(manual.map(l => l.project).filter(Boolean))].sort();

  const el = document.getElementById('lic-content');
  if (!el) return;

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="lic-ot-type" onchange="_renderLicOtherRows()"
          style="font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
          <option value="all">ทุกประเภท</option>
          ${licTypes.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
        <select id="lic-ot-proj" onchange="_renderLicOtherRows()"
          style="font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
          <option value="all">ทุก project</option>
          ${projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
        </select>
        <select id="lic-ot-status" onchange="_renderLicOtherRows()"
          style="font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
          <option value="all">ทุกสถานะ</option>
          <option value="active">Active</option>
          <option value="expiring">Expiring</option>
          <option value="expired">Expired</option>
        </select>
      </div>
      <button class="btn-primary" style="font-size:12px;padding:6px 14px" onclick="openLicenseModal()">
        + Add License
      </button>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="hist-table"><thead><tr>
        <th style="padding-left:14px">License</th>
        <th>ประเภท</th>
        <th>Project</th>
        <th style="text-align:right">Seats</th>
        <th style="text-align:right">Monthly (THB)</th>
        <th>Memo</th>
        <th>หมดอายุ</th>
        <th style="text-align:center">สถานะ</th>
        <th style="text-align:center">Actions</th>
      </tr></thead>
      <tbody id="lic-ot-body"></tbody>
      </table>
    </div>`;

  window._licOtherManual = manual;
  window._licOtherFxRate = fxRate;
  _renderLicOtherRows();
}

function _renderLicOtherRows() {
  const typeF   = document.getElementById('lic-ot-type')?.value || 'all';
  const projF   = document.getElementById('lic-ot-proj')?.value || 'all';
  const statF   = document.getElementById('lic-ot-status')?.value || 'all';
  const fxRate  = window._licOtherFxRate || _getLicFxRate();
  const tbody   = document.getElementById('lic-ot-body');
  if (!tbody) return;

  let rows = window._licOtherManual || [];
  if (typeF !== 'all') rows = rows.filter(r => (r.licenseType||'subscription') === typeF);
  if (projF !== 'all') rows = rows.filter(r => r.project === projF);
  if (statF !== 'all') rows = rows.filter(r => {
    const k = getLicenseStatus(r).key;
    if (statF === 'active')   return k === 'active';
    if (statF === 'expiring') return k.startsWith('expiring');
    if (statF === 'expired')  return k === 'expired';
    return true;
  });

  window._licOtherFiltered = rows;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-3)">ไม่มี manual license — กด Add License เพื่อเพิ่ม</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((l, idx) => {
    const s = getLicenseStatus(l);
    const cost = (l.pricePerMonth||0) * fxRate * (l.seats||1);
    const typeBadge = {
      subscription: 'background:#E6F1FB;color:#0C447C',
      perpetual:    'background:#EAF3DE;color:#27500A',
      free:         'background:#F1EFE8;color:#444441',
    }[l.licenseType] || 'background:#EEEDFE;color:#3C3489';
    return `<tr>
      <td style="padding-left:14px;font-weight:600">${esc(l.name)}
        ${l.vendor ? `<div style="font-size:10px;color:var(--text-3);font-weight:400">${esc(l.vendor)}</div>` : ''}
      </td>
      <td><span style="font-size:10px;padding:2px 7px;border-radius:4px;font-weight:500;${typeBadge}">${esc(l.licenseType||'subscription')}</span></td>
      <td style="font-size:12px">${esc(l.project||'—')}</td>
      <td style="text-align:right">${l.seats||1}</td>
      <td style="text-align:right" class="mono">${cost ? money(cost) : '฿0'}</td>
      <td style="font-size:11px;color:var(--blue)">${esc(l.memoNo||'—')}</td>
      <td style="font-size:11px">${shortDate(l.expiry)||'—'}</td>
      <td style="text-align:center"><span class="badge ${s.badge}">${s.label}</span></td>
      <td style="text-align:center;white-space:nowrap">
        <button class="btn-sm" data-action="edit" data-idx="${idx}" style="padding:3px 7px;font-size:11px">✎</button>
        <button class="btn-sm" data-action="delete" data-idx="${idx}" style="padding:3px 7px;font-size:11px;color:var(--red)">✕</button>
      </td>
    </tr>`;
  }).join('');

  tbody.onclick = e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const l = (window._licOtherFiltered||[])[Number(btn.dataset.idx)];
    if (!l) return;
    if (btn.dataset.action === 'edit')   openLicenseModal(String(l.id));
    if (btn.dataset.action === 'delete') deleteLicense(String(l.id));
  };
}

// ── FX rate persistence ──────────────────────────────────
function _getLicFxRate() {
  try { return Number(localStorage.getItem('orbit-lic-fx-rate')) || 35; } catch(e) { return 35; }
}
function _saveLicFxRate(val) {
  try { localStorage.setItem('orbit-lic-fx-rate', String(Number(val)||35)); } catch(e) {}
}

// ── KPI helper ───────────────────────────────────────────
function _kpi(label, val, color, sub) {
  return `<div style="background:var(--bg-2,#F8F8F6);border-radius:var(--r-sm);padding:10px 14px">
    <div style="font-size:11px;color:var(--text-2);margin-bottom:2px">${label}</div>
    <div style="font-size:18px;font-weight:600;color:${color}">${val}</div>
    <div style="font-size:10px;color:var(--text-3)">${sub}</div>
  </div>`;
}

// ── Modal CRUD (unchanged from original) ─────────────────
function openLicenseModal(id) {
  const modal = document.getElementById('license-modal');
  modal.style.display = 'flex';
  _populateLicenseFilters(getAllLicenses());
  if (id) {
    const lic = getAllLicenses().find(l => String(l.id) === String(id));
    if (!lic) { closeLicenseModal(); return; }
    const fromMemo = lic.source === 'memo';
    document.getElementById('lic-modal-title').textContent = fromMemo ? 'Edit License (from Memo)' : 'Edit License';
    document.getElementById('lic-edit-id').value     = lic.id;
    document.getElementById('lic-name').value        = lic.name || '';
    document.getElementById('lic-vendor').value      = lic.vendor || '';
    document.getElementById('lic-seats').value       = lic.seats || 1;
    document.getElementById('lic-price').value       = lic.pricePerMonth || 0;
    document.getElementById('lic-owner').value       = lic.owner || '';
    document.getElementById('lic-dept').value        = lic.department || '';
    document.getElementById('lic-project').value     = lic.project || '';
    document.getElementById('lic-type-field').value  = lic.licenseType || 'subscription';
    document.getElementById('lic-purchase-date').value = lic.purchaseDate?.slice(0,10) || '';
    document.getElementById('lic-expiry-date').value   = lic.expiry?.slice(0,10) || '';
    document.getElementById('lic-billing').value     = lic.billingFreq || 'monthly';
    document.getElementById('lic-status-field').value = lic.statusOverride || 'active';
    document.getElementById('lic-memo-ref').value    = lic.memoNo || '';
    document.getElementById('lic-note').value        = lic.note || '';
    ['lic-name','lic-vendor','lic-seats','lic-price','lic-purchase-date','lic-expiry-date','lic-billing','lic-memo-ref'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) { el.disabled = fromMemo; el.style.opacity = fromMemo ? '0.5' : '1'; }
    });
    const hint = document.getElementById('lic-memo-hint');
    if (hint) hint.style.display = fromMemo ? '' : 'none';
  } else {
    document.getElementById('lic-modal-title').textContent = 'Add License';
    document.getElementById('lic-edit-id').value = '';
    ['lic-name','lic-vendor','lic-owner','lic-dept','lic-note','lic-memo-ref'].forEach(fid => { const el = document.getElementById(fid); if (el) el.value = ''; });
    document.getElementById('lic-seats').value = 1;
    document.getElementById('lic-price').value = 0;
    document.getElementById('lic-purchase-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('lic-expiry-date').value = '';
    document.getElementById('lic-project').value = '';
    document.getElementById('lic-type-field').value = 'subscription';
    document.getElementById('lic-billing').value = 'monthly';
    document.getElementById('lic-status-field').value = 'active';
    ['lic-name','lic-vendor','lic-seats','lic-price','lic-purchase-date','lic-expiry-date','lic-billing','lic-memo-ref'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) { el.disabled = false; el.style.opacity = '1'; }
    });
    const hint = document.getElementById('lic-memo-hint');
    if (hint) hint.style.display = 'none';
  }
}
function closeLicenseModal() { document.getElementById('license-modal').style.display = 'none'; }

function saveLicenseManual() {
  const name = document.getElementById('lic-name').value.trim();
  if (!name) { alert('กรุณากรอก Software Name'); return; }
  const editId = document.getElementById('lic-edit-id').value;
  const now = new Date().toISOString();
  const data = {
    name, vendor: document.getElementById('lic-vendor').value.trim(),
    seats: Number(document.getElementById('lic-seats').value)||1,
    pricePerMonth: Number(document.getElementById('lic-price').value)||0,
    owner: document.getElementById('lic-owner').value.trim(),
    department: document.getElementById('lic-dept').value.trim(),
    project: document.getElementById('lic-project').value,
    licenseType: document.getElementById('lic-type-field').value,
    purchaseDate: document.getElementById('lic-purchase-date').value || now.slice(0,10),
    expiry: document.getElementById('lic-expiry-date').value
      ? new Date(document.getElementById('lic-expiry-date').value+'T00:00:00').toISOString() : null,
    billingFreq: document.getElementById('lic-billing').value,
    statusOverride: document.getElementById('lic-status-field').value === 'active' ? null : document.getElementById('lic-status-field').value,
    memoNo: document.getElementById('lic-memo-ref').value.trim(),
    note: document.getElementById('lic-note').value.trim(),
    source: 'manual', updatedAt: now,
  };
  const allLics = getAllLicenses();
  let finalData;
  if (editId) {
    const orig = allLics.find(l => String(l.id) === String(editId));
    finalData = { ...(orig||{}), ...data, id: editId, createdAt: orig?.createdAt || now };
  } else {
    finalData = { id: nextLicenseId(), ...data, createdAt: now };
  }
  const ls = loadManualLicenses();
  const idx = ls.findIndex(l => String(l.id) === String(finalData.id));
  if (idx >= 0) ls[idx] = finalData; else ls.push(finalData);
  storeManualLicenses(ls);
  _licCache = null;
  closeLicenseModal();
  _renderLicTab(_licCurrentTab);
  saveLicenseAsync(finalData).then(() => { _licCache = null; _renderLicTab(_licCurrentTab); }).catch(e => console.warn(e));
}

function deleteLicense(id) {
  const lic = getAllLicenses().find(l => String(l.id) === String(id));
  if (!lic) return;
  if (lic.source === 'memo') { alert('ไม่สามารถลบ License ที่มาจาก Memo ได้'); return; }
  if (!confirm(`ลบ "${lic.name}" ออกจากระบบ?`)) return;
  storeManualLicenses(loadManualLicenses().filter(l => String(l.id) !== String(id)));
  _licCache = null;
  _renderLicTab(_licCurrentTab);
  deleteLicenseAsync(id).catch(e => console.warn(e));
}

document.addEventListener('click', function(e) {
  if (e.target === document.getElementById('license-modal')) closeLicenseModal();
});
