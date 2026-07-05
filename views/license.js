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
    billing_freq:    l.billingFreq || null,
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
    expiry: r.expiry || null, billingFreq: r.billing_freq || '',
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
    .map((it, idx) => {
      const price  = Number(it.price) || 0;
      const months = Number(it.months) || 12;
      const seats  = Number(it.qty) || 1;
      // Functional audit fix: always normalize `start` to day 1 of the month
      // before adding `months` below. Without this, when startMonth is
      // missing/invalid and purchaseDate's day-of-month is 29-31,
      // Date.setMonth() overflows into the next month for any `months` value
      // that lands on a shorter month (e.g. Jan 31 + 1 month => Mar 3, not
      // Feb 28) — silently pushing the license's expiry date later than
      // intended and mis-bucketing License Index's "expiring soon" status.
      let start;
      if (it.startMonth && it.startMonth.match(/^\d{4}-\d{2}$/)) {
        start = new Date(it.startMonth + '-01');
      } else {
        // Build the same "YYYY-MM-01" UTC-midnight shape as the startMonth
        // branch above (not `new Date(y, m, 1)`, which is local-time and
        // would drift the stored ISO timestamp by the local UTC offset).
        const pd = new Date(purchaseDate);
        const ym = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
        start = new Date(ym + '-01');
      }
      const expiry = new Date(start);
      expiry.setMonth(expiry.getMonth() + months);
      // idx (line position within this memo) keeps the id unique even when two lines share the
      // same name/plan/coverage — matching on those fields alone would collide, making
      // Edit/Delete silently act on the wrong line item.
      const identity = [memo.memoNo, idx, it.name, it.plan || '', it.startMonth || '', it.endMonth || '']
        .map(value => String(value).trim().replace(/\s+/g, '_'))
        .join('-');
      return {
        id: `memo-${identity}`,
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
// ── Export License CSV ──────────────────────────────────────────
function exportLicenseCSV() {
  const memos    = loadMemos().filter(m => m.type === 'sl' && m.status === 'completed');
  const manuals  = typeof loadManualLicenses === 'function' ? loadManualLicenses() : [];
  // Build one row per license item from SL memos
  const headers = ['Memo No','โครงการ','ชื่อ Software','Plan','฿/เดือน','จำนวน (Seats)',
    'เริ่ม','สิ้นสุด','รวม (฿)','วันที่อนุมัติ','สถานะ','ผู้ขอ','แหล่งข้อมูล'];
  const rows = [];
  memos.forEach(m => {
    const items = m.slItems?.length ? m.slItems : [];
    items.forEach(it => {
      rows.push([
        m.memoNo, m.project, it.name, it.plan||'',
        it.price||0, it.qty||1,
        it.startMonth||'', it.endMonth||'',
        (it.price||0) * (it.months||0) * (it.qty||1),
        m.approvedAt?.slice(0,10)||'', 'จาก Memo',
        m.requesterName||'', 'Memo'
      ]);
    });
  });
  manuals.forEach(l => {
    rows.push([
      l.memoNo||'', l.project||'', l.name, l.plan||'',
      l.pricePerMonth||0, l.seats||1,
      l.purchaseDate||'', l.expiry?.slice?.(0,10)||'',
      (l.pricePerMonth||0) * (l.seats||1),
      l.purchaseDate||'', l.statusOverride||'active',
      l.owner||'', 'Manual'
    ]);
  });
  if (!rows.length) { alert('ไม่มีข้อมูล License'); return; }
  _downloadCSV('License', headers, rows);
}

// ── Bulk Import / Template ─────────────────────────────────────
function downloadTemplate(type) {
  if (type === 'license') {
    const headers = ['name','vendor','plan','seats','price_per_month','billing_freq',
      'expiry','project','owner','note'];
    const example = ['Figma','Figma Inc.','Professional','5','600','monthly',
      '2026-06-30','Geo9','กนกวรรณ มีสุข',''];
    _downloadCSV('License_Template', headers, [example]);
  } else if (type === 'device') {
    downloadDeviceTemplate();
  }
}

function renderLicense() {
  // Load all async settings first, then render
  Promise.all([
    loadManualLicensesAsync(),
    _loadLicSettingsAsync().then(d => {
      // Sync FX rate from Supabase into localStorage if present
      if (d.fxRate) try { localStorage.setItem('orbit-lic-fx-rate', String(d.fxRate)); } catch(e) {}
    }).catch(() => {}),
    _loadLicUserOverridesAsync().catch(() => {}),
    _loadLicReviewStateAsync().catch(() => {}),
  ])
    .then(() => _renderLicTab(_licCurrentTab))
    .catch(() => _renderLicTab(_licCurrentTab));
}

function switchLicTab(tab) {
  _licCurrentTab = tab;
  document.querySelectorAll('.lic-tab-btn, #view-license .tab-btn').forEach(b => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('lic-tab-active', on);
    b.classList.toggle('active', on);
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
    const curSelected = msValues('lic-filter-project'); // preserve selection across repopulation
    const projects = [...new Set(allLicenses.map(l => l.project).filter(Boolean))].sort();
    projSel.innerHTML = projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    Array.from(projSel.options).forEach(o => { if (curSelected.includes(o.value)) o.selected = true; });
    refreshMultiSelectUI('lic-filter-project');
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
        <option value="active">Active</option>
        <option value="expiring">Expiring (≤30d)</option>
        <option value="expiring-7">≤ 7 วัน</option>
        <option value="expiring-15">≤ 15 วัน</option>
        <option value="expiring-30">≤ 30 วัน</option>
        <option value="expired">Expired</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select id="lic-filter-project" onchange="_renderLicMemoIndexRows()" style="font-family:inherit;font-size:12px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface)">
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

    <div id="lic-count-display" style="font-size:11px;color:var(--text-3);padding:6px 14px;border-bottom:1px solid var(--border)">
      แสดง — รายการ
    </div>
    <div class="card" style="padding:0;overflow:hidden;overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="hist-table">
        <thead><tr>
          <th style="width:12%;padding-left:16px">Software</th>
          <th style="width:8%">Plan</th>
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
    </div>
    <div id="license-load-more" class="load-more-bar" style="display:none">
      <button onclick="loadMoreLicense()">Load more</button>
    </div>`;

  // Part 8 (UX consistency pass) — Status/Project are multi-select filters.
  initMultiSelect('lic-filter-status', 'ทุกสถานะ');
  initMultiSelect('lic-filter-project', 'ทุกโครงการ');
  _renderLicMemoIndexRows();
}

function _renderLicMemoIndexRows() {
  const allLicenses = getAllLicenses();
  _populateLicenseFilters(allLicenses);
  const search     = (document.getElementById('lic-search')?.value || '').toLowerCase();
  const filterSt   = msValues('lic-filter-status');
  const filterProj = msValues('lic-filter-project');
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
    if (filterSt.length && !filterSt.some(f => f === 'expiring'
      ? ['expiring-7', 'expiring-15', 'expiring-30'].includes(s.key)
      : f === s.key)) return false;
    if (filterProj.length && !filterProj.includes(lic.project)) return false;
    if (search) {
      const hay = `${lic.name} ${lic.plan} ${lic.project} ${lic.owner} ${lic.vendor} ${lic.department}`.toLowerCase();
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
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:34px 16px;color:var(--text-3)">ยังไม่มีข้อมูล${search ? ' ที่ตรงกับการค้นหา' : ''} — Approve SL Memo หรือกด Add License</td></tr>`;
    return;
  }

  window._licAllFiltered = filtered;
  if (typeof window._licVisible === 'undefined') window._licVisible = 20;
  const visible = filtered.slice(0, window._licVisible);
  window._licFiltered = visible;
  tbody.innerHTML = visible.map((lic, _idx) => {
    const s = getLicenseStatus(lic);
    const monthlyCostLic = (lic.pricePerMonthTHB ?? lic.pricePerMonth ?? 0) * (lic.seats || 1);
    const sourceBadge = lic.source === 'memo'
      ? `<span style="font-size:10px;background:#E6F1FB;color:#0C447C;padding:1px 6px;border-radius:3px;white-space:nowrap">Memo</span>`
      : `<span style="font-size:10px;background:#F1EFE8;color:#5F5E5A;padding:1px 6px;border-radius:3px;white-space:nowrap">Manual</span>`;
    return `<tr>
      <td style="padding-left:16px;font-weight:600">
        ${esc(lic.name)}
        ${lic.vendor ? `<div style="font-size:10px;color:var(--text-3);font-weight:400">${esc(lic.vendor)}</div>` : ''}
        ${lic.memoNo ? `<div style="font-size:10px;color:var(--blue);font-weight:400;cursor:pointer" onclick="typeof openMemoReadOnly==='function'&&openMemoReadOnly('${esc(lic.memoNo)}')">${esc(lic.memoNo)}</div>` : ''}
      </td>
      <td style="font-size:12px">${esc(lic.plan || '—')}</td>
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
        <button class="btn-sm" data-action="edit" data-idx="${_idx}" style="padding:3px 7px;font-size:11px" title="${lic.source === 'memo' ? 'แก้ไข owner/dept/note' : 'แก้ไข'}">✎</button>
        ${lic.source !== 'memo' ? `<button class="btn-sm" data-action="delete" data-idx="${_idx}" style="padding:3px 7px;font-size:11px;color:var(--red)" title="ลบ">✕</button>` : ''}
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

  // Load More
  const lmEl = document.getElementById('license-load-more');
  if (lmEl) {
    const rem = (window._licAllFiltered||[]).length - (window._licVisible||20);
    lmEl.style.display = rem > 0 ? '' : 'none';
    const lmBtn = lmEl.querySelector('button');
    if (lmBtn) lmBtn.textContent = `Load ${Math.min(rem,20)} more (เหลือ ${rem} รายการ)`;
  }

  // Update count in filter bar
  const countEl = document.getElementById('lic-count-display');
  if (countEl) {
    const total = (window._licAllFiltered||[]).length;
    const shown = Math.min(total, window._licVisible||20);
    countEl.textContent = `แสดง ${shown} จาก ${total} รายการ`;
  }
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

// ── TAB 3: USERS — PMO Review Queue (Milestone 3A) ────────
// Memo-level gate: an approved SL memo's account list ("ตาราง Account") must be
// PMO-approved before its rows reach the live User Mapping table. Review state is
// keyed by memoNo and stored via the same generic `settings` table pattern already
// used for _LIC_USR_OV_KEY / _LIC_SETTINGS_KEY — no new Supabase table.
const _LIC_REVIEW_KEY = 'orbit-lic-user-review-status-v1';

// Grandfather cutoff — memos approved before this instant (i.e. every real memo
// that existed prior to this feature shipping) are treated as already approved,
// per the locked business decision, so PMO never loses visibility into user-license
// data that was already live. Only memos approved at/after this instant default to
// 'pending' when no explicit review record exists yet.
const LIC_REVIEW_ROLLOUT_AT = '2026-07-03T00:00:00.000Z';

function licReviewDefaultStatus(memo) {
  const approvedAt = memo.approvedAt || memo.updatedAt || memo.createdAt;
  return (approvedAt && String(approvedAt) < LIC_REVIEW_ROLLOUT_AT) ? 'approved' : 'pending';
}

function licReviewStatusForMemo(memo, reviewState) {
  const rec = reviewState && reviewState[memo.memoNo];
  if (rec && rec.status) return rec.status;
  return licReviewDefaultStatus(memo);
}

async function _loadLicReviewStateAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('settings', 'GET', null, '?id=eq.lic-user-review-status');
      if (rows && rows[0]?.data) {
        const d = rows[0].data;
        try { localStorage.setItem(_LIC_REVIEW_KEY, JSON.stringify(d)); } catch(e) {}
        return d;
      }
    } catch(e) { console.warn('_loadLicReviewStateAsync failed', e.message); }
  }
  return _getLicReviewState();
}
async function _saveLicReviewStateAsync(data) {
  try { localStorage.setItem(_LIC_REVIEW_KEY, JSON.stringify(data)); } catch(e) {}
  if (await checkSupa()) {
    try {
      await supaFetch('settings', 'POST', { id: 'lic-user-review-status', data }, '?on_conflict=id');
    } catch(e) { console.warn('_saveLicReviewStateAsync failed', e.message); }
  }
}
function _getLicReviewState() {
  try { return JSON.parse(localStorage.getItem(_LIC_REVIEW_KEY) || '{}'); } catch(e) { return {}; }
}
function _saveLicReviewState(data) {
  try { localStorage.setItem(_LIC_REVIEW_KEY, JSON.stringify(data)); } catch(e) {}
  _saveLicReviewStateAsync(data).catch(e => console.warn('License review status sync failed', e));
}

// Pure computation, no DOM access — takes memos + review state (and an optional
// injected account-table parser, for testing without DOMParser) and returns which
// account-list rows are visible in User Mapping vs. sitting in the Review Queue.
// Rejected memos' rows are simply omitted (per locked decision #4): PMO can still
// add the same users via the existing manual override editor below.
function computeLicUserMappingData(memos, reviewState, parseAcctFn) {
  parseAcctFn = parseAcctFn || parseAccountTableFromMemo;
  reviewState = reviewState || {};
  const allUserRows = [];
  const allLicColsSet = new Set();
  const queueItems = [];

  memos
    .filter(m => m.type === 'sl' && m.status === 'completed')
    .forEach(memo => {
      const acct = parseAcctFn(memo);
      if (!acct || !acct.rows.length) return;
      const status = licReviewStatusForMemo(memo, reviewState);
      if (status === 'pending') { queueItems.push({ memo, acct }); return; }
      if (status === 'rejected') return;
      acct.cols.forEach(c => allLicColsSet.add(c));
      acct.rows.forEach(r => allUserRows.push({
        email: r.email,
        project: memo.project || '',
        memoNo: memo.memoNo,
        licenses: r.licenses,
      }));
    });

  return { allUserRows, allLicCols: [...allLicColsSet].sort(), queueItems };
}

function _renderLicReviewQueueHtml(queueItems) {
  if (!queueItems || !queueItems.length) return '';
  const rows = queueItems.map(({ memo, acct }) => `<tr>
      <td style="padding-left:14px;font-weight:600;color:var(--blue);cursor:pointer" onclick="typeof openMemoReadOnly==='function'&&openMemoReadOnly('${esc(memo.memoNo)}')">${esc(memo.memoNo)}</td>
      <td style="font-size:12px">${esc(memo.project || '—')}</td>
      <td style="text-align:center">${acct.rows.length}</td>
      <td style="text-align:center">${acct.cols.length}</td>
      <td style="text-align:center;white-space:nowrap">
        <button class="btn-sm" onclick="typeof openMemoReadOnly==='function'&&openMemoReadOnly('${esc(memo.memoNo)}')">View Memo</button>
        <button class="btn-sm" style="color:var(--green,#27500A)" onclick="_approveLicReview('${esc(memo.memoNo)}')">✓ Approve</button>
        <button class="btn-sm" style="color:var(--red)" onclick="_rejectLicReview('${esc(memo.memoNo)}')">✕ Reject</button>
      </td>
    </tr>`).join('');
  return `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:14px;border:1px solid var(--amber,#C9821A)">
      <div style="padding:10px 14px;font-size:12px;font-weight:600;background:var(--bg-2,#F8F8F6);border-bottom:1px solid var(--border)">
        ⏳ PMO Review Queue — บัญชี Software รอตรวจสอบ (${queueItems.length})
      </div>
      <div class="card" style="padding:0;overflow:hidden;overflow-x:auto;box-shadow:none;border:none;border-radius:0">
        <table class="hist-table">
          <thead><tr>
            <th style="padding-left:14px">Memo No</th>
            <th>โครงการ</th>
            <th style="text-align:center">Account</th>
            <th style="text-align:center">Software</th>
            <th style="text-align:center">Actions</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function _setLicReviewStatus(memoNo, newStatus, reason) {
  const memo = loadMemos().find(m => m.memoNo === memoNo) || { memoNo };
  const state = _getLicReviewState();
  const prevStatus = licReviewStatusForMemo(memo, state);
  const actor = typeof currentUser === 'function' ? currentUser() : '';
  const now = new Date().toISOString();
  const auditEntry = {
    action: newStatus === 'approved' ? 'License review approved' : 'License review rejected',
    actor, timestamp: now,
    previousStatus: prevStatus, newStatus,
    memoNo, reason: reason || '',
  };
  state[memoNo] = {
    status: newStatus,
    reviewedBy: actor,
    reviewedAt: now,
    reason: reason || '',
    auditLog: [...(state[memoNo]?.auditLog || []), auditEntry],
  };
  _saveLicReviewState(state);
  _renderLicUsers();
}

function _approveLicReview(memoNo) {
  _setLicReviewStatus(memoNo, 'approved', '');
}

function _rejectLicReview(memoNo) {
  const reason = prompt('เหตุผลที่ปฏิเสธรายการนี้ (Reject reason):');
  if (reason === null) return; // cancelled
  _setLicReviewStatus(memoNo, 'rejected', (reason || '').trim());
}

// ── TAB 3: USERS ─────────────────────────────────────────
function _renderLicUsers() {
  const memos = loadMemos();
  const reviewState = _getLicReviewState();
  const { allUserRows, allLicCols, queueItems } = computeLicUserMappingData(memos, reviewState);

  const projects = [...new Set(allUserRows.map(r=>r.project).filter(Boolean))].sort();

  const el = document.getElementById('lic-content');
  if (!el) return;

  window._licReviewQueue = queueItems;

  if (!allUserRows.length && !queueItems.length) {
    el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-3)">
      ยังไม่มีข้อมูลผู้ใช้ — กรอก "ตาราง Account" ใน SL Memo เพื่อให้ข้อมูลปรากฎที่นี่
    </div>`;
    return;
  }

  // Store data in window so handlers can access without embedding JSON in HTML
  window._licUsrRows = allUserRows;
  window._licUsrCols = allLicCols;

  el.innerHTML = `
    ${_renderLicReviewQueueHtml(queueItems)}
    <div style="background:var(--bg-2,#F8F8F6);border-radius:var(--r-sm);padding:8px 12px;margin-bottom:12px;font-size:11px;color:var(--text-2)">
      ℹ ข้อมูลมาจาก "ตาราง Account" ใน SL Memo — email + ✓/- ต่อโปรแกรม (เฉพาะรายการที่ PMO อนุมัติแล้ว)
    </div>
    <div class="filter-row" style="margin-bottom:12px">
      <input id="lic-usr-search" type="text" placeholder="ค้นหา email..."
        oninput="_renderLicUsersRows()">
      <select id="lic-usr-proj" onchange="_renderLicUsersRows()">
        ${projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
      <select id="lic-usr-lic" onchange="_renderLicUsersRows()">
        ${allLicCols.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
    </div>
    <div style="font-size:11px;color:var(--text-2);margin-bottom:6px">
      คลิกแถวเพื่อดูรายละเอียด Program / Plan / Seat / Source Memo / Status ต่อ project · กด Edit licenses เพื่อแก้หลายรายการพร้อมกัน
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="hist-table" id="lic-usr-table">
        <thead><tr>
          <th style="padding-left:14px">User</th>
          <th>Department</th>
          <th style="text-align:center">Software Count</th>
          <th style="text-align:center;white-space:nowrap"></th>
        </tr></thead>
        <tbody id="lic-usr-body"></tbody>
      </table>
    </div>
    <div id="lic-usr-editor" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:300;align-items:center;justify-content:center">
      <div class="card" style="width:480px;max-width:94vw;max-height:85vh;overflow-y:auto;padding:20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px">
          <div><div style="font-size:15px;font-weight:700">Edit licenses</div><div id="lic-usr-editor-name" style="font-size:11px;color:var(--text-2);margin-top:2px"></div></div>
          <button class="btn-sm" onclick="_closeLicUserEditor()">✕</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <button class="btn-sm" onclick="_setAllLicUserEditor(true)">✓ Select all</button>
          <button class="btn-sm" onclick="_setAllLicUserEditor(false)">Clear all</button>
        </div>
        <div id="lic-usr-editor-options" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button class="btn-ghost" onclick="_closeLicUserEditor()">Cancel</button>
          <button class="btn-primary" onclick="_saveLicUserEditor()">Save licenses</button>
        </div>
      </div>
    </div>`;

  // Part 8 (UX consistency pass) — Project/Software are multi-select filters.
  initMultiSelect('lic-usr-proj', 'ทุก project');
  initMultiSelect('lic-usr-lic', 'ทุก license');
  _renderLicUsersRows();
}

function _renderLicUsersRows() {
  const allUserRows = window._licUsrRows || [];
  const allLicCols  = window._licUsrCols || [];
  const search  = (document.getElementById('lic-usr-search')?.value || '').toLowerCase();
  const projF   = msValues('lic-usr-proj');
  const licF    = msValues('lic-usr-lic');
  const tbody   = document.getElementById('lic-usr-body');
  if (!tbody) return;

  let rows = allUserRows;
  if (projF.length) rows = rows.filter(r => projF.includes(r.project));
  if (licF.length)  rows = rows.filter(r => licF.some(lic => r.licenses[lic] === true));
  if (search) rows = rows.filter(r => r.email.toLowerCase().includes(search));

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-3)">ไม่พบข้อมูล</td></tr>`;
    return;
  }

  // Merge into one entry per (email, project) — the same grouping/override key
  // shape _openLicUserEditor()/_saveLicUserEditor()/_toggleLicUserOverride()
  // already depend on, unchanged. Also tracks, per license, which memo(s)
  // actually granted it (licenseSources), so the expandable detail below can
  // show a real Source Memo instead of guessing.
  const emailProjMap = {};
  rows.forEach(r => {
    const key = `${r.email}|${r.project}`;
    if (!emailProjMap[key]) emailProjMap[key] = { email: r.email, project: r.project, memos: new Set(), licenses: {}, licenseSources: {} };
    const group = emailProjMap[key];
    group.memos.add(r.memoNo);
    Object.entries(r.licenses).forEach(([lic, val]) => {
      if (!val) return;
      group.licenses[lic] = true;
      if (!group.licenseSources[lic]) group.licenseSources[lic] = new Set();
      group.licenseSources[lic].add(r.memoNo);
    });
  });
  window._licUsrMerged = emailProjMap;

  // Part 6 (UX consistency pass) — user-centric view: one primary row per
  // email (User / Department / Software Count), expandable to reveal each
  // project's Program/Plan/Seat/Source Memo/Status detail. Presentation only:
  // the (email, project) groups, override keys, and Edit licenses editor are
  // exactly the ones the matrix already used. Department has no data source
  // yet (not tracked anywhere in memo account tables or user_profiles — that
  // is Settings/Master-Data scope, out of bounds for this pass) so it always
  // shows "—" rather than fabricating a value.
  const userMap = {};
  Object.values(emailProjMap).forEach(group => {
    if (!userMap[group.email]) userMap[group.email] = { email: group.email, projectGroups: [] };
    userMap[group.email].projectGroups.push(group);
  });

  const overrides = _getLicUserOverrides();
  const allLicenses = getAllLicenses();
  window._licUsrExpanded = window._licUsrExpanded || new Set();

  const activeLicensesForGroup = group => {
    const key = `${group.email}|${group.project}`;
    return allLicCols.filter(lic => {
      const fromMemo = group.licenses[lic] === true;
      const ov = overrides[`${key}|${lic}`];
      return ov !== undefined ? ov : fromMemo;
    });
  };

  const users = Object.values(userMap).sort((a, b) => a.email.localeCompare(b.email));

  tbody.innerHTML = users.map(u => {
    const initials = u.email.substring(0, 2).toUpperCase();
    const uKey = encodeURIComponent(u.email);
    const softwareCount = u.projectGroups.reduce((sum, g) => sum + activeLicensesForGroup(g).length, 0);
    const expanded = window._licUsrExpanded.has(u.email);

    const detailHtml = u.projectGroups.map(group => {
      const key = `${group.email}|${group.project}`;
      const active = activeLicensesForGroup(group);
      const detailRows = active.length
        ? active.map(lic => {
            const sources = [...(group.licenseSources[lic] || [])];
            const match = allLicenses.find(l => l.name === lic && l.project === group.project && sources.includes(l.memoNo));
            const plan = match?.plan || '—';
            const seat = match?.seats ?? '—';
            const status = match ? getLicenseStatus(match) : null;
            const sourceHtml = sources.length
              ? sources.map(m => `<span style="color:var(--blue);cursor:pointer" onclick="event.stopPropagation();typeof openMemoReadOnly==='function'&&openMemoReadOnly('${esc(m)}')">${esc(m)}</span>`).join(', ')
              : '<span style="font-style:italic;color:var(--text-3)">Manual override</span>';
            return `<tr>
              <td style="padding:6px 10px;font-size:12px">${esc(lic)}</td>
              <td style="padding:6px 10px;font-size:12px">${esc(plan)}</td>
              <td style="padding:6px 10px;font-size:12px;text-align:center">${esc(String(seat))}</td>
              <td style="padding:6px 10px;font-size:12px">${sourceHtml}</td>
              <td style="padding:6px 10px;font-size:12px">${status ? `<span class="badge ${status.badge}" style="font-size:10px">${esc(status.label)}</span>` : '<span style="color:var(--text-3)">—</span>'}</td>
            </tr>`;
          }).join('')
        : `<tr><td colspan="5" style="padding:8px 10px;text-align:center;color:var(--text-3);font-size:12px">ไม่มี license ที่ active ใน project นี้</td></tr>`;
      return `<div style="border:1px solid var(--border);border-radius:var(--r-sm);margin-bottom:8px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--bg-2,#F8F8F6);font-size:12px">
          <span><strong>Project:</strong> ${esc(group.project || '—')}</span>
          <button class="btn-sm" onclick="event.stopPropagation();_openLicUserEditor(decodeURIComponent('${encodeURIComponent(key)}'))">Edit licenses</button>
        </div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="text-align:left;font-size:10px;color:var(--text-3);text-transform:uppercase">
            <th style="padding:6px 10px">Program</th><th style="padding:6px 10px">Plan</th>
            <th style="padding:6px 10px;text-align:center">Seat</th><th style="padding:6px 10px">Source Memo</th><th style="padding:6px 10px">Status</th>
          </tr></thead>
          <tbody>${detailRows}</tbody>
        </table>
      </div>`;
    }).join('');

    return `<tr style="cursor:pointer" onclick="_toggleLicUserRow('${uKey}')">
        <td style="padding-left:14px">
          <span style="width:26px;height:26px;border-radius:50%;background:var(--blue-50,#E6F1FB);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--blue);margin-right:6px;vertical-align:middle">${initials}</span>
          ${esc(u.email)}
        </td>
        <td style="font-size:12px;color:var(--text-3)">—</td>
        <td style="text-align:center;font-size:12px">${softwareCount}</td>
        <td style="text-align:center;font-size:11px;color:var(--text-3)">${expanded ? '▾' : '▸'}</td>
      </tr>${expanded ? `<tr><td colspan="4" style="padding:10px 14px;background:var(--bg)">${detailHtml}</td></tr>` : ''}`;
  }).join('');
}

function _toggleLicUserRow(encodedEmail) {
  const email = decodeURIComponent(encodedEmail);
  window._licUsrExpanded = window._licUsrExpanded || new Set();
  if (window._licUsrExpanded.has(email)) window._licUsrExpanded.delete(email);
  else window._licUsrExpanded.add(email);
  _renderLicUsersRows();
}


// ── License Users — manual override helpers ─────────────
const _LIC_USR_OV_KEY = 'orbit-lic-user-overrides-v1';

async function _loadLicUserOverridesAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('settings', 'GET', null, '?id=eq.lic-user-overrides');
      if (rows && rows[0]?.data) {
        const d = rows[0].data;
        try { localStorage.setItem(_LIC_USR_OV_KEY, JSON.stringify(d)); } catch(e) {}
        return d;
      }
    } catch(e) { console.warn('_loadLicUserOverridesAsync failed', e.message); }
  }
  return _getLicUserOverrides();
}

async function _saveLicUserOverridesAsync(data) {
  try { localStorage.setItem(_LIC_USR_OV_KEY, JSON.stringify(data)); } catch(e) {}
  if (await checkSupa()) {
    try {
      await supaFetch('settings', 'POST', { id: 'lic-user-overrides', data }, '?on_conflict=id');
    } catch(e) { console.warn('_saveLicUserOverridesAsync failed', e.message); }
  }
}

function _getLicUserOverrides() {
  try { return JSON.parse(localStorage.getItem(_LIC_USR_OV_KEY) || '{}'); } catch(e) { return {}; }
}
function _saveLicUserOverrides(data) {
  try { localStorage.setItem(_LIC_USR_OV_KEY, JSON.stringify(data)); } catch(e) {}
  // Async sync to Supabase in background
  _saveLicUserOverridesAsync(data).catch(e => console.warn('License override sync failed', e));
}
function _toggleLicUserOverride(ovKey, currentActive) {
  const overrides = _getLicUserOverrides();
  if (overrides[ovKey] !== undefined) {
    // Reset to memo value
    delete overrides[ovKey];
  } else {
    // Override: flip current value
    overrides[ovKey] = !currentActive;
  }
  _saveLicUserOverrides(overrides);
  _renderLicUsersRows();
}

function _openLicUserEditor(key) {
  const row = window._licUsrMerged?.[key];
  const modal = document.getElementById('lic-usr-editor');
  if(!row || !modal) return;
  window._licUsrEditKey = key;
  const overrides = _getLicUserOverrides();
  document.getElementById('lic-usr-editor-name').textContent = `${row.email} · ${row.project || '—'}`;
  document.getElementById('lic-usr-editor-options').innerHTML = (window._licUsrCols || []).map((license, index) => {
    const ovKey = `${key}|${license}`;
    const active = overrides[ovKey] !== undefined ? overrides[ovKey] : row.licenses[license] === true;
    return `<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer">
      <input type="checkbox" class="lic-usr-edit-check" data-license-index="${index}"${active ? ' checked' : ''} style="width:17px;height:17px;accent-color:var(--blue)">
      <span style="font-size:12px">${esc(license)}</span>
    </label>`;
  }).join('');
  modal.style.display = 'flex';
}

function _setAllLicUserEditor(checked) {
  document.querySelectorAll('#lic-usr-editor-options .lic-usr-edit-check').forEach(input => { input.checked = checked; });
}

function _closeLicUserEditor() {
  const modal = document.getElementById('lic-usr-editor');
  if(modal) modal.style.display = 'none';
  window._licUsrEditKey = null;
}

function _saveLicUserEditor() {
  const key = window._licUsrEditKey;
  const row = window._licUsrMerged?.[key];
  if(!key || !row) return;
  const licenses = window._licUsrCols || [];
  const overrides = _getLicUserOverrides();
  document.querySelectorAll('#lic-usr-editor-options .lic-usr-edit-check').forEach(input => {
    const license = licenses[Number(input.dataset.licenseIndex)];
    const ovKey = `${key}|${license}`;
    const fromMemo = row.licenses[license] === true;
    if(input.checked === fromMemo) delete overrides[ovKey];
    else overrides[ovKey] = input.checked;
  });
  _saveLicUserOverrides(overrides);
  _closeLicUserEditor();
  _renderLicUsersRows();
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
    <div class="filter-row" style="margin-bottom:12px;justify-content:space-between">
      <div class="filter-row" style="margin-bottom:0">
        <select id="lic-ot-type" onchange="_renderLicOtherRows()">
          ${licTypes.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('')}
        </select>
        <select id="lic-ot-proj" onchange="_renderLicOtherRows()">
          ${projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
        </select>
        <select id="lic-ot-status" onchange="_renderLicOtherRows()">
          <option value="active">Active</option>
          <option value="expiring">Expiring</option>
          <option value="expired">Expired</option>
        </select>
      </div>
      <button class="btn-primary" style="font-size:12px;padding:6px 14px" onclick="openLicenseModal()">
        + Add License
      </button>
    </div>
    <div class="card" style="padding:0;overflow:hidden;overflow-x:auto;-webkit-overflow-scrolling:touch">
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
  // Part 8 (UX consistency pass) — Type/Project/Status are multi-select filters.
  initMultiSelect('lic-ot-type', 'ทุกประเภท');
  initMultiSelect('lic-ot-proj', 'ทุก project');
  initMultiSelect('lic-ot-status', 'ทุกสถานะ');
  _renderLicOtherRows();
}

function _renderLicOtherRows() {
  const typeF   = msValues('lic-ot-type');
  const projF   = msValues('lic-ot-proj');
  const statF   = msValues('lic-ot-status');
  const fxRate  = window._licOtherFxRate || _getLicFxRate();
  const tbody   = document.getElementById('lic-ot-body');
  if (!tbody) return;

  let rows = window._licOtherManual || [];
  if (typeF.length) rows = rows.filter(r => typeF.includes(r.licenseType||'subscription'));
  if (projF.length) rows = rows.filter(r => projF.includes(r.project));
  if (statF.length) rows = rows.filter(r => {
    const k = getLicenseStatus(r).key;
    return statF.some(statFVal =>
      statFVal === 'active'   ? k === 'active' :
      statFVal === 'expiring' ? k.startsWith('expiring') :
      statFVal === 'expired'  ? k === 'expired' : false);
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
        <button class="btn-sm" data-action="edit" data-idx="${idx}" style="padding:3px 7px;font-size:11px" title="แก้ไข">✎</button>
        <button class="btn-sm" data-action="delete" data-idx="${idx}" style="padding:3px 7px;font-size:11px;color:var(--red)" title="ลบ">✕</button>
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

// ── FX rate persistence — Supabase + localStorage ────────
const _LIC_SETTINGS_KEY = 'orbit-lic-settings-v1';

async function _loadLicSettingsAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('settings', 'GET', null, '?id=eq.lic-settings');
      if (rows && rows[0]?.data) {
        const d = rows[0].data;
        try { localStorage.setItem(_LIC_SETTINGS_KEY, JSON.stringify(d)); } catch(e) {}
        return d;
      }
    } catch(e) { console.warn('_loadLicSettingsAsync failed', e.message); }
  }
  try { return JSON.parse(localStorage.getItem(_LIC_SETTINGS_KEY) || '{}'); } catch(e) { return {}; }
}

async function _saveLicSettingAsync(key, val) {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(_LIC_SETTINGS_KEY) || '{}'); } catch(e) {}
  d[key] = val;
  try { localStorage.setItem(_LIC_SETTINGS_KEY, JSON.stringify(d)); } catch(e) {}
  if (await checkSupa()) {
    try {
      await supaFetch('settings', 'POST', { id: 'lic-settings', data: d }, '?on_conflict=id');
    } catch(e) { console.warn('_saveLicSettingAsync failed', e.message); }
  }
}

function _getLicFxRate() {
  try {
    const d = JSON.parse(localStorage.getItem(_LIC_SETTINGS_KEY) || '{}');
    return Number(d.fxRate || localStorage.getItem('orbit-lic-fx-rate')) || 35;
  } catch(e) { return 35; }
}
function _saveLicFxRate(val) {
  const n = Number(val) || 35;
  // Legacy key for backward compat
  try { localStorage.setItem('orbit-lic-fx-rate', String(n)); } catch(e) {}
  // Async sync to Supabase
  _saveLicSettingAsync('fxRate', n).catch(e => console.warn('FX rate sync failed', e));
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
    document.getElementById('lic-plan').value        = lic.plan || '';
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
    ['lic-name','lic-plan','lic-vendor','lic-seats','lic-price','lic-purchase-date','lic-expiry-date','lic-billing','lic-memo-ref'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) { el.disabled = fromMemo; el.style.opacity = fromMemo ? '0.5' : '1'; }
    });
    const hint = document.getElementById('lic-memo-hint');
    if (hint) hint.style.display = fromMemo ? '' : 'none';
  } else {
    document.getElementById('lic-modal-title').textContent = 'Add License';
    document.getElementById('lic-edit-id').value = '';
    ['lic-name','lic-plan','lic-vendor','lic-owner','lic-dept','lic-note','lic-memo-ref'].forEach(fid => { const el = document.getElementById(fid); if (el) el.value = ''; });
    document.getElementById('lic-seats').value = 1;
    document.getElementById('lic-price').value = 0;
    document.getElementById('lic-purchase-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('lic-expiry-date').value = '';
    document.getElementById('lic-project').value = '';
    document.getElementById('lic-type-field').value = 'subscription';
    document.getElementById('lic-billing').value = 'monthly';
    document.getElementById('lic-status-field').value = 'active';
    ['lic-name','lic-plan','lic-vendor','lic-seats','lic-price','lic-purchase-date','lic-expiry-date','lic-billing','lic-memo-ref'].forEach(fid => {
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
    name,
    plan: document.getElementById('lic-plan').value.trim(),
    vendor: document.getElementById('lic-vendor').value.trim(),
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

// ── License Load More ──
function loadMoreLicense() {
  window._licVisible = (window._licVisible || 20) + 20;
  _renderLicMemoIndexRows();
}
function resetLicensePagination() {
  window._licVisible = 20;
}
