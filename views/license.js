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

// ── Export User Licenses CSV — Users tab's own dataset, matrix format ───────
// Reflects exactly what the Users tab currently shows: the same visible-user
// list _renderLicUsersRows() computed (respecting Search/Project/Software
// filters), reused as-is here so export can never drift from the UI
// (MASTER_SPEC export rule). Columns are Software (+ "— Plan" when set),
// deduplicated by Software+Plan, one column per unique combo — never one
// column per memo.
function exportUserLicensesCSV() {
  const overrides = _getLicUserOverrides();
  const allLicenses = getAllLicenses();

  let users = window._licUsrVisibleUsers;
  let allLicCols = window._licUsrCols;
  if (!users) {
    // Users tab hasn't rendered in this session yet — fall back to the full,
    // unfiltered dataset via the same pipeline the render path uses,
    // including Part 1's widened (inventory-based) assignable list.
    const { allUserRows, allLicCols: legacyCols } = computeLicUserMappingData(loadMemos(), _getLicReviewState(), undefined, _getLicUserManualRows());
    allLicCols = _licAssignableIdentities(allLicenses, legacyCols);
    const groups = _buildLicUserGroups(allUserRows);
    const userMap = {};
    Object.values(groups).forEach(group => {
      if (!userMap[group.email]) userMap[group.email] = { email: group.email, projectGroups: [] };
      userMap[group.email].projectGroups.push(group);
    });
    users = Object.values(userMap).sort((a, b) => a.email.localeCompare(b.email));
  }
  allLicCols = allLicCols || [];

  if (!users.length) { alert('ไม่มีข้อมูล User License'); return; }

  const colLabel = new Map();  // key `${software}|${plan}` -> display label
  const userCols = new Map();  // email -> Set(key)
  users.forEach(u => {
    const active = new Set();
    u.projectGroups.forEach(group => {
      _licActiveForGroup(group, allLicCols, overrides).forEach(lic => {
        const ovKey = `${group.email}|${group.project}|${lic}`;
        const parsed = _parseLicIdentity(lic);
        const detail = _licUserAssignmentDetail(group, lic, allLicenses, overrides[ovKey]);
        const plan = detail.plan || parsed.plan;
        const key = `${parsed.name}|${plan}`;
        if (!colLabel.has(key)) colLabel.set(key, plan ? `${parsed.name} — ${plan}` : parsed.name);
        active.add(key);
      });
    });
    userCols.set(u.email, active);
  });

  const colKeys = [...colLabel.keys()].sort((a, b) => colLabel.get(a).localeCompare(colLabel.get(b)));
  if (!colKeys.length) { alert('ไม่มีข้อมูล User License'); return; }

  const headers = ['User Email', ...colKeys.map(k => colLabel.get(k))];
  const rows = users.map(u => {
    const active = userCols.get(u.email) || new Set();
    return [u.email, ...colKeys.map(k => active.has(k) ? '✓' : '')];
  });

  _downloadCSV('User_Licenses_Matrix', headers, rows);
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
    _loadLicUserManualRowsAsync().catch(() => {}),
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

    <div class="filter-toolbar">
      <input type="text" id="lic-search" class="filter-search" placeholder="Search..."
        oninput="_renderLicMemoIndexRows()">
      <select id="lic-filter-status" onchange="_renderLicMemoIndexRows()">
        <option value="active">Active</option>
        <option value="expiring">Expiring (≤30d)</option>
        <option value="expiring-7">≤ 7 วัน</option>
        <option value="expiring-15">≤ 15 วัน</option>
        <option value="expiring-30">≤ 30 วัน</option>
        <option value="expired">Expired</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select id="lic-filter-project" onchange="_renderLicMemoIndexRows()">
      </select>
      <span class="filter-control"><span class="filter-label">Sort</span><select id="lic-sort" onchange="_renderLicMemoIndexRows()">
        <option value="expiry-asc">หมดอายุใกล้สุด</option>
        <option value="cost-desc">ราคา มาก→น้อย</option>
        <option value="seats-desc">Seats มาก→น้อย</option>
        <option value="purchase-desc">ซื้อล่าสุด</option>
      </select></span>
      <div class="filter-actions">
        <button class="btn-sm" onclick="exportLicenseCSV()" title="Export License Inventory">⬇ Export License Inventory</button>
        <button class="btn-sm" onclick="downloadTemplate('license')" title="Download Template">⬇ Template</button>
        <button class="btn-sm" onclick="importBulk('license')" title="Import from Excel">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Import Excel
        </button>
        <button class="btn-primary" onclick="openLicenseModal()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add License
        </button>
      </div>
    </div>

    <div id="lic-count-display" class="result-count">
      แสดง — รายการ
    </div>
    <div class="card" style="padding:0;overflow:hidden;overflow-x:auto;-webkit-overflow-scrolling:touch">
      <table class="hist-table">
        <thead><tr>
          <th style="width:12%;padding-left:16px">Software</th>
          <th style="width:8%">Plan</th>
          <th style="width:7%;text-align:right">Seats</th>
          <th style="width:9%;text-align:right">฿/เดือน</th>
          <th style="width:8%">โครงการ</th>
          <th style="width:8%">หมดอายุ</th>
          <th style="width:9%;text-align:center">สถานะ</th>
          <th style="width:8%;text-align:center">Actions</th>
        </tr></thead>
        <tbody id="lic-table-body"></tbody>
      </table>
    </div>
    <div id="license-load-more" class="load-more-bar" style="display:none">
      <button onclick="loadMoreLicense()">Load more</button>
    </div>`;

  // Part 8 (UX consistency pass) — Status/Project are multi-select filters.
  initMultiSelect('lic-filter-status', 'ทุกสถานะ', 'Status');
  initMultiSelect('lic-filter-project', 'ทุกโครงการ', 'Project');
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
    tbody.innerHTML = `<tr><td colspan="8" class="hist-empty">${search ? 'No licenses found. Try changing filters.' : 'No licenses found — approve an SL memo or click Add License.'}</td></tr>`;
    return;
  }

  window._licAllFiltered = filtered;
  if (typeof window._licVisible === 'undefined') window._licVisible = 20;
  const visible = filtered.slice(0, window._licVisible);
  window._licFiltered = visible;
  tbody.innerHTML = visible.map((lic, _idx) => {
    const s = getLicenseStatus(lic);
    const monthlyCostLic = (lic.pricePerMonthTHB ?? lic.pricePerMonth ?? 0) * (lic.seats || 1);
    return `<tr>
      <td style="padding-left:16px;font-weight:600">
        ${esc(lic.name)}
        ${lic.vendor ? `<div style="font-size:10px;color:var(--text-3);font-weight:400">${esc(lic.vendor)}</div>` : ''}
        ${lic.memoNo ? `<div style="font-size:10px;color:var(--blue);font-weight:400;cursor:pointer" onclick="typeof openMemoReadOnly==='function'&&openMemoReadOnly('${esc(lic.memoNo)}')">${esc(lic.memoNo)}</div>` : ''}
      </td>
      <td style="font-size:12px">${esc(lic.plan || '—')}</td>
      <td style="text-align:right">${esc(lic.seats || 1)}</td>
      <td class="mono" style="text-align:right">${esc(money(monthlyCostLic))}</td>
      <td style="font-size:12px">${esc(lic.project || '—')}</td>
      <td style="font-size:11px">${esc(shortDate(lic.expiry))}</td>
      <td style="text-align:center"><span class="badge ${s.badge}">${esc(s.label)}</span></td>
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
// Part 3 (Phase 2A) — Summary and Reconciliation are separate sub-tabs (only
// one panel in the DOM at a time) so viewing either never requires scrolling
// past the other's table.
let _bpSubTab = 'summary';

// Phase 2D — reporting filters shared by both sub-tabs. Plain module
// variables (same pattern as _bpYear) so selections survive the full
// lic-content rebuild that happens on every sub-tab switch; setter functions
// below are what onchange handlers (and tests) call, since a `let` at module
// scope isn't reachable as a property from outside the running script.
let _bpFilterProjects = [];   // [] = all projects
let _bpFilterSoftware = [];   // Phase 2D-1 — exact-match multi-select, OR across selections; [] = all
let _bpFilterPlan = 'all';
let _bpFilterStatus = [];     // Summary only — [] = all statuses
let _bpReconOverOnly = false;
let _bpReconRemainingOnly = false;

function _bpApplyFilters() { _bpRenderMatrix(); _renderLicReconciliation(); }
function _bpSetFilterProjects(vals) { _bpFilterProjects = vals || []; _bpApplyFilters(); }
function _bpSetFilterSoftware(vals) { _bpFilterSoftware = vals || []; _bpApplyFilters(); }
function _bpSetFilterPlan(v) { _bpFilterPlan = v || 'all'; _bpApplyFilters(); }
function _bpSetFilterStatus(vals) { _bpFilterStatus = vals || []; _bpRenderMatrix(); }
function _bpSetReconOverOnly(v) { _bpReconOverOnly = !!v; _renderLicReconciliation(); }
function _bpSetReconRemainingOnly(v) { _bpReconRemainingOnly = !!v; _renderLicReconciliation(); }

function _switchLicSummarySubTab(tab) {
  _bpSubTab = tab;
  _renderLicByProject();
}

function _renderLicByProject() {
  const el = document.getElementById('lic-content');
  if (!el) return;

  const allLics  = getAllLicenses().filter(l => getLicenseStatus(l).key !== 'cancelled');
  const years    = [...new Set(allLics.map(l => l.memoYear).filter(Boolean))].sort((a,b)=>b-a);
  const projects = [...new Set(allLics.map(l => l.project || '(ไม่ระบุ)'))].sort();
  const software = [...new Set(allLics.map(l => l.name).filter(Boolean))].sort();
  const plans    = [...new Set(allLics.map(l => l.plan).filter(Boolean))].sort();
  const statusOptions = [
    ['active', 'Active'], ['expiring', 'Expiring (≤30d)'],
    ['expiring-7', '≤ 7 วัน'], ['expiring-15', '≤ 15 วัน'], ['expiring-30', '≤ 30 วัน'],
    ['expired', 'Expired'],
  ];

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="btn-sm${_bpSubTab === 'summary' ? ' active' : ''}" data-subtab="summary" onclick="_switchLicSummarySubTab('summary')">Summary</button>
      <button class="btn-sm${_bpSubTab === 'reconciliation' ? ' active' : ''}" data-subtab="reconciliation" onclick="_switchLicSummarySubTab('reconciliation')">Reconciliation</button>
    </div>

    <div class="filter-toolbar">
      <select id="lic-bp-filter-project" multiple onchange="_bpSetFilterProjects(msValues('lic-bp-filter-project'))">
        ${projects.map(p=>`<option value="${esc(p)}" ${_bpFilterProjects.includes(p)?'selected':''}>${esc(p)}</option>`).join('')}
      </select>
      <select id="lic-bp-filter-software" multiple onchange="_bpSetFilterSoftware(msValues('lic-bp-filter-software'))">
        ${software.map(s=>`<option value="${esc(s)}" ${_bpFilterSoftware.includes(s)?'selected':''}>${esc(s)}</option>`).join('')}
      </select>
      <span class="filter-control"><span class="filter-label">Plan</span><select id="lic-bp-filter-plan" class="filter-input" onchange="_bpSetFilterPlan(this.value)">
        <option value="all">All plans</option>
        ${plans.map(p=>`<option value="${esc(p)}" ${_bpFilterPlan===p?'selected':''}>${esc(p)}</option>`).join('')}
      </select></span>
      <span class="filter-control"><span class="filter-label">Year</span><select class="filter-input" onchange="_bpYear=this.value;_bpRenderMatrix()">
        <option value="all">All years</option>
        ${years.map(y=>`<option value="${y}" ${String(y)===_bpYear?'selected':''}>${y}</option>`).join('')}
      </select></span>
      <select id="lic-bp-filter-status" multiple onchange="_bpSetFilterStatus(msValues('lic-bp-filter-status'))">
        ${statusOptions.map(([v,l])=>`<option value="${v}" ${_bpFilterStatus.includes(v)?'selected':''}>${esc(l)}</option>`).join('')}
      </select>
      <div class="filter-actions">
        <button class="btn-sm" onclick="exportLicSummaryCSV()">⬇ Export Summary</button>
      </div>
    </div>

    <div id="lic-summary-panel" style="${_bpSubTab === 'summary' ? '' : 'display:none'}">
      <div id="bp-table-wrap"></div>
    </div>
    <div id="lic-reconciliation-panel" style="${_bpSubTab === 'reconciliation' ? '' : 'display:none'}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700">License Reconciliation</div>
        <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="checkbox" id="lic-recon-filter-over" ${_bpReconOverOnly?'checked':''} onchange="_bpSetReconOverOnly(this.checked)"> Over Assigned only
          </label>
          <label style="font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="checkbox" id="lic-recon-filter-remaining" ${_bpReconRemainingOnly?'checked':''} onchange="_bpSetReconRemainingOnly(this.checked)"> Has Remaining only
          </label>
          <button class="btn-sm" style="font-size:12px;padding:6px 12px" onclick="exportLicReconciliationCSV()">⬇ Export Reconciliation</button>
        </div>
      </div>
      <div id="lic-recon-wrap"></div>
    </div>`;

  initMultiSelect('lic-bp-filter-project', 'ทุกโครงการ', 'Project');
  initMultiSelect('lic-bp-filter-software', 'All software', 'Software');
  initMultiSelect('lic-bp-filter-status', 'ทุกสถานะ', 'Status');

  _bpRenderMatrix();
  _renderLicReconciliation();
}

function _bpGetFiltered() {
  return getAllLicenses().filter(l => {
    const st = getLicenseStatus(l);
    if (st.key === 'cancelled') return false;
    if (_bpYear !== 'all' && String(l.memoYear) !== String(_bpYear)) return false;
    if (_bpFilterProjects.length && !_bpFilterProjects.includes(l.project || '(ไม่ระบุ)')) return false;
    if (_bpFilterSoftware.length && !_bpFilterSoftware.includes(l.name)) return false;
    if (_bpFilterPlan !== 'all' && (l.plan || '') !== _bpFilterPlan) return false;
    if (_bpFilterStatus.length && !_bpFilterStatus.some(f => f === 'expiring'
      ? ['expiring-7', 'expiring-15', 'expiring-30'].includes(st.key)
      : f === st.key)) return false;
    return true;
  });
}

// Purchased Seats aggregation shared by License Summary's existing project
// matrix and the new Reconciliation section (Phase 1 Part 3 — MASTER_SPEC:
// shared calculation functions only, no duplicated business logic in UI).
// Sums `seats` per (project, name, plan), excluding cancelled licenses —
// project-less (manual license with no project) buckets under the same
// '(ไม่ระบุ)' placeholder the existing matrix already uses.
function _licSeatsByProjectSoftwarePlan(allLicenses) {
  const map = new Map();
  allLicenses.forEach(l => {
    if (getLicenseStatus(l).key === 'cancelled') return;
    const project = l.project || '(ไม่ระบุ)';
    const plan = l.plan || '';
    const key = `${project}||${l.name}||${plan}`;
    if (!map.has(key)) map.set(key, { project, name: l.name, plan, seats: 0 });
    map.get(key).seats += (l.seats || 1);
  });
  return map;
}

// Pure aggregation, shared by the on-screen matrix render and its CSV export
// (Phase 2D) — extracted from the pre-existing calculation as-is, no math
// changed, so both consumers always agree on the same numbers.
function _bpComputeMatrix() {
  const filtered = _bpGetFiltered();
  const seatMap = _licSeatsByProjectSoftwarePlan(filtered);
  const projects = [...new Set([...seatMap.values()].map(r => r.project))].sort();

  const rowMap = {};
  seatMap.forEach(r => {
    const k = `${r.name}||${r.plan}`;
    if (!rowMap[k]) rowMap[k] = { name: r.name, plan: r.plan, byProj: {}, total: 0 };
    rowMap[k].byProj[r.project] = (rowMap[k].byProj[r.project]||0) + r.seats;
    rowMap[k].total += r.seats;
  });

  const matrixRows = Object.values(rowMap).sort((a,b) => a.name.localeCompare(b.name) || a.plan.localeCompare(b.plan));
  const grandTotal = matrixRows.reduce((s,r) => s+r.total, 0);
  return { projects, matrixRows, grandTotal };
}

// Fixed pixel widths for the frozen Software/Plan columns so their `left`
// sticky offsets can be computed without measuring the DOM (Phase 2D).
const _BP_NAME_COL_W = 150;
const _BP_PLAN_COL_W = 100;

function _bpRenderMatrix() {
  const wrap = document.getElementById('bp-table-wrap');
  if (!wrap) return;
  const { projects, matrixRows, grandTotal } = _bpComputeMatrix();

  if (!matrixRows.length) {
    wrap.innerHTML = `<div class="card hist-empty">No records found. Try changing filters.</div>`;
    return;
  }

  const head = `<thead><tr>
    <th class="lic-bp-freeze-name" style="left:0;width:${_BP_NAME_COL_W}px;min-width:${_BP_NAME_COL_W}px;padding-left:14px">License</th>
    <th class="lic-bp-freeze-plan" style="left:${_BP_NAME_COL_W}px;width:${_BP_PLAN_COL_W}px;min-width:${_BP_PLAN_COL_W}px">Plan</th>
    ${projects.map(p=>`<th style="text-align:right;white-space:nowrap;min-width:90px">${esc(p)}</th>`).join('')}
    <th class="lic-bp-freeze-total" style="text-align:right;min-width:90px">Total</th>
  </tr></thead>`;

  const bodyRows = matrixRows.map(r => `<tr onmouseover="this.style.background='var(--bg-2)'" onmouseout="this.style.background=''">
    <td class="lic-bp-freeze-name" style="left:0;width:${_BP_NAME_COL_W}px;min-width:${_BP_NAME_COL_W}px;padding-left:14px;font-weight:500">${esc(r.name)}</td>
    <td class="lic-bp-freeze-plan" style="left:${_BP_NAME_COL_W}px;width:${_BP_PLAN_COL_W}px;min-width:${_BP_PLAN_COL_W}px;font-size:12px;color:var(--text-2)">${esc(r.plan)||'<span style="color:var(--text-3)">—</span>'}</td>
    ${projects.map(p => r.byProj[p]
      ? `<td style="text-align:right">${r.byProj[p]}</td>`
      : `<td style="text-align:right;color:var(--text-3)">—</td>`
    ).join('')}
    <td class="lic-bp-freeze-total" style="text-align:right;font-weight:500">${r.total}</td>
  </tr>`).join('');

  const totalRow = `<tr style="font-weight:600;background:var(--bg-2,#F8F8F6);border-top:0.5px solid var(--border-md)">
    <td class="lic-bp-freeze-name" style="left:0;width:${_BP_NAME_COL_W}px;min-width:${_BP_NAME_COL_W}px;padding-left:14px;background:var(--bg-2,#F8F8F6)">Total</td>
    <td class="lic-bp-freeze-plan" style="left:${_BP_NAME_COL_W}px;width:${_BP_PLAN_COL_W}px;min-width:${_BP_PLAN_COL_W}px;background:var(--bg-2,#F8F8F6)"></td>
    ${projects.map(p => {
      const t = matrixRows.reduce((s,r) => s+(r.byProj[p]||0), 0);
      return `<td style="text-align:right">${t||'—'}</td>`;
    }).join('')}
    <td class="lic-bp-freeze-total" style="text-align:right;background:var(--bg-2,#F8F8F6)">${grandTotal}</td>
  </tr>`;

  wrap.innerHTML = `<div class="card lic-bp-table-wrap" style="padding:0">
    <table class="hist-table lic-bp-table" style="min-width:500px">
      ${head}<tbody>${bodyRows}${totalRow}</tbody>
    </table>
  </div>`;
}

// Phase 2D — Summary export mirrors the exact filtered matrix (same
// _bpComputeMatrix() the on-screen table renders), so it can never drift
// from what filters currently show.
function exportLicSummaryCSV() {
  const { projects, matrixRows, grandTotal } = _bpComputeMatrix();
  if (!matrixRows.length) { alert('ไม่มีข้อมูล License Summary'); return; }
  const headers = ['Software', 'Plan', ...projects, 'Total'];
  const rows = matrixRows.map(r => [r.name, r.plan, ...projects.map(p => r.byProj[p] || 0), r.total]);
  rows.push(['Total', '', ...projects.map(p => matrixRows.reduce((s,r) => s+(r.byProj[p]||0), 0)), grandTotal]);
  _downloadCSV('License_Summary', headers, rows);
}

// ── Phase 1 Part 3 — License Reconciliation ───────────────────────────────
// Joins Purchased Seats (effective License Inventory, via the shared
// _licSeatsByProjectSoftwarePlan()) against effective, post-Review-Queue,
// post-override user Assignments (the exact same
// computeLicUserMappingData()/_buildLicUserGroups()/_licActiveForGroup()
// pipeline the Users tab uses) — pure, no DOM, so the on-screen table, its
// export, and the Assigned Users drill-down all read one canonical result.
function computeLicReconciliation(memos, reviewState, overrides, manualRows) {
  const allLicenses = getAllLicenses();
  const seatMap = _licSeatsByProjectSoftwarePlan(allLicenses);

  const { allUserRows, allLicCols } = computeLicUserMappingData(memos, reviewState, undefined, manualRows || _getLicUserManualRows());
  const assignableCols = _licAssignableIdentities(allLicenses, allLicCols);
  const groups = _buildLicUserGroups(allUserRows);

  const rows = new Map(); // key `${project}||${name}||${plan}` -> row
  const ensureRow = (project, name, plan) => {
    const key = `${project}||${name}||${plan}`;
    if (!rows.has(key)) rows.set(key, { project, name, plan, purchased: 0, assigned: new Map() });
    return rows.get(key);
  };

  seatMap.forEach(r => { ensureRow(r.project, r.name, r.plan).purchased = r.seats; });

  Object.values(groups).forEach(group => {
    _licActiveForGroup(group, assignableCols, overrides).forEach(lic => {
      const ovKey = `${group.email}|${group.project}|${lic}`;
      const detail = _licUserAssignmentDetail(group, lic, allLicenses, overrides[ovKey]);
      const parsed = _parseLicIdentity(lic);
      const plan = detail.plan || parsed.plan;
      // Bucket under the matched license record's own project (so Assigned
      // lines up with the same bucket Purchased Seats used) — falling back
      // to the user's group project only when no inventory record resolved
      // at all (a genuine data gap, correctly surfaces as Over Assigned).
      const project = detail.match ? (detail.match.project || '(ไม่ระบุ)') : group.project;
      const row = ensureRow(project, parsed.name, plan);
      if (!row.assigned.has(group.email)) {
        row.assigned.set(group.email, {
          email: group.email,
          source: _licAssignmentSourceLabel(detail),
          project: group.project,
          sourceMemo: detail.sources.length ? detail.sources.join(', ') : '',
        });
      }
    });
  });

  return [...rows.values()].map(r => {
    const assignedCount = r.assigned.size;
    const remaining = r.purchased - assignedCount;
    return {
      project: r.project, name: r.name, plan: r.plan,
      purchased: r.purchased, assignedCount, remaining,
      overAssigned: remaining < 0,
      assignedUsers: [...r.assigned.values()].sort((a, b) => a.email.localeCompare(b.email)),
    };
  }).sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name) || a.plan.localeCompare(b.plan));
}

// Phase 2D — post-computation row filter shared by the on-screen table and
// its CSV export. Filters the already-computed canonical rows only; never
// touches computeLicReconciliation()'s Purchased/Assigned/Remaining math.
function _bpReconApplyFilters(rows) {
  return rows.filter(r => {
    if (_bpFilterProjects.length && !_bpFilterProjects.includes(r.project)) return false;
    if (_bpFilterSoftware.length && !_bpFilterSoftware.includes(r.name)) return false;
    if (_bpFilterPlan !== 'all' && (r.plan || '') !== _bpFilterPlan) return false;
    if (_bpReconOverOnly && !r.overAssigned) return false;
    if (_bpReconRemainingOnly && !(r.remaining > 0)) return false;
    return true;
  });
}

function _renderLicReconciliation() {
  const wrap = document.getElementById('lic-recon-wrap');
  if (!wrap) return;
  const allRows = computeLicReconciliation(loadMemos(), _getLicReviewState(), _getLicUserOverrides());
  const rows = _bpReconApplyFilters(allRows);
  window._licReconRows = rows;

  if (!rows.length) {
    wrap.innerHTML = `<div class="hist-empty">${allRows.length ? 'No records found. Try changing filters.' : 'No licenses found.'}</div>`;
    return;
  }

  const bodyRows = rows.map((r, idx) => `<tr>
      <td style="padding-left:14px;font-size:12px">${esc(r.project)}</td>
      <td style="font-weight:500">${esc(r.name)}</td>
      <td style="font-size:12px;color:var(--text-2)">${esc(r.plan) || '<span style="color:var(--text-3)">—</span>'}</td>
      <td style="text-align:right">${r.purchased}</td>
      <td style="text-align:right"><span style="color:var(--blue);cursor:pointer;text-decoration:underline" onclick="_openLicReconDetail(${idx})">${r.assignedCount}</span></td>
      <td style="text-align:right;font-weight:600;${r.overAssigned ? 'color:var(--red)' : ''}">
        ${r.remaining}${r.overAssigned ? ' <span class="badge badge-red" style="margin-left:4px">Over Assigned</span>' : ''}
      </td>
    </tr>`).join('');

  wrap.innerHTML = `
    <div class="card" style="padding:0;overflow:hidden;overflow-x:auto">
      <table class="hist-table" style="min-width:600px">
        <thead><tr>
          <th style="padding-left:14px">Project</th>
          <th>Software</th>
          <th>Plan</th>
          <th style="text-align:right">Purchased Seats</th>
          <th style="text-align:right">Assigned Users</th>
          <th style="text-align:right">Remaining Seats</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    <div id="lic-recon-detail" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:300;align-items:center;justify-content:center">
      <div class="card" style="width:440px;max-width:94vw;max-height:80vh;overflow-y:auto;padding:20px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px">
          <div><div style="font-size:15px;font-weight:700">Assigned Users</div><div id="lic-recon-detail-name" style="font-size:11px;color:var(--text-2);margin-top:2px"></div></div>
          <button class="btn-sm" onclick="_closeLicReconDetail()">✕</button>
        </div>
        <div style="display:flex;gap:18px;margin-bottom:12px">
          <div><div style="font-size:10px;color:var(--text-3);text-transform:uppercase">Purchased</div><div id="lic-recon-detail-purchased" style="font-weight:700;font-size:16px"></div></div>
          <div><div style="font-size:10px;color:var(--text-3);text-transform:uppercase">Assigned</div><div id="lic-recon-detail-assigned" style="font-weight:700;font-size:16px"></div></div>
          <div><div style="font-size:10px;color:var(--text-3);text-transform:uppercase">Remaining</div><div id="lic-recon-detail-remaining" style="font-weight:700;font-size:16px"></div></div>
        </div>
        <div id="lic-recon-detail-body"></div>
        <div style="margin-top:14px;display:flex;justify-content:flex-end">
          <button id="lic-recon-view-in-users" class="btn-sm" style="display:none">View in Users tab</button>
        </div>
      </div>
    </div>`;
}

// Read-only drill-down (Phase 1 Part 4) — no editing here, just reads the
// row computeLicReconciliation() already built (no re-derivation).
function _openLicReconDetail(idx) {
  const row = (window._licReconRows || [])[idx];
  const modal = document.getElementById('lic-recon-detail');
  if (!row || !modal) return;
  const nameEl = document.getElementById('lic-recon-detail-name');
  if (nameEl) nameEl.textContent = `${row.name}${row.plan ? ' — ' + row.plan : ''} · ${row.project}`;
  const setText = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setText('lic-recon-detail-purchased', row.purchased);
  setText('lic-recon-detail-assigned', row.assignedCount);
  setText('lic-recon-detail-remaining', row.remaining);
  const body = document.getElementById('lic-recon-detail-body');
  if (body) {
    body.innerHTML = row.assignedUsers.length
      ? row.assignedUsers.map(u => `<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
          <div style="font-weight:600">${esc(u.email)}</div>
          <div style="color:var(--text-2)">Source: ${esc(u.source)} · Project: ${esc(u.project || '—')}${u.sourceMemo ? ` · Source Memo: ${esc(u.sourceMemo)}` : ''}</div>
        </div>`).join('')
      : `<div style="text-align:center;padding:16px;color:var(--text-3)">No assigned users</div>`;
  }
  // Phase 2D.2 — deep link into Users tab, only offered when there is
  // actually someone to jump to.
  const viewBtn = document.getElementById('lic-recon-view-in-users');
  if (viewBtn) {
    if (row.assignedCount > 0) {
      viewBtn.style.display = '';
      viewBtn.onclick = () => _viewReconRowInUsers(idx);
    } else {
      viewBtn.style.display = 'none';
      viewBtn.onclick = null;
    }
  }
  modal.style.display = 'flex';
}

function _closeLicReconDetail() {
  const modal = document.getElementById('lic-recon-detail');
  if (modal) modal.style.display = 'none';
}

// Phase 2D.2 — navigation + a temporary display filter only. Never writes to
// overrides/settings/licenses/memos; _licUsrDeepLinkFilter is read by
// _renderLicUsersRows() to narrow the visible list and by the Users tab's
// context banner, and is cleared by _clearLicUsrDeepLinkFilter().
let _licUsrDeepLinkFilter = null; // { project, name, plan, emails } | null

function _viewReconRowInUsers(idx) {
  const row = (window._licReconRows || [])[idx];
  if (!row) return;
  _licUsrDeepLinkFilter = {
    project: row.project,
    name: row.name,
    plan: row.plan,
    emails: row.assignedUsers.map(u => u.email),
  };
  _closeLicReconDetail();
  switchLicTab('users');
}

function _clearLicUsrDeepLinkFilter() {
  _licUsrDeepLinkFilter = null;
  _renderLicUsrContextBanner();
  _renderLicUsersRows();
}

// Phase 2D.2.1 — returns to License Summary > Reconciliation. The deep-link
// filter is cleared on the way out (not preserved) so a later, ordinary
// visit to the Users tab never shows a stale, unexplained narrowing; any
// Reconciliation-side filters (Project/Software/Plan/Over Assigned/Has
// Remaining) are untouched module state, so that context comes back as-is.
function _backToReconciliationFromUsers() {
  _licUsrDeepLinkFilter = null;
  _bpSubTab = 'reconciliation';
  switchLicTab('by-project');
}

// Phase 1 Part 7 — separate from the existing User Matrix export
// (exportUserLicensesCSV), reads the exact same canonical reconciliation
// rows the on-screen table renders.
function exportLicReconciliationCSV() {
  const allRows = computeLicReconciliation(loadMemos(), _getLicReviewState(), _getLicUserOverrides());
  const rows = _bpReconApplyFilters(allRows);
  if (!rows.length) { alert('ไม่มีข้อมูล Reconciliation'); return; }
  const headers = ['Project', 'Software', 'Plan', 'Purchased Seats', 'Assigned Users', 'Remaining Seats'];
  const csvRows = rows.map(r => [r.project, r.name, r.plan, r.purchased, r.assignedCount, r.remaining]);
  _downloadCSV('License_Reconciliation', headers, csvRows);
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
// `manualRows` (Phase 2B) — manual/imported (email, project) rows from
// _getLicUserManualRows(), appended as-is. They carry no license grants of
// their own (always `licenses: {}`) and are entirely independent of Review
// Queue status — an imported assignment must not depend on Review Queue
// approval, only on the license inventory match already validated at import
// time. Optional and defaulted so every existing call site/test is unaffected.
function computeLicUserMappingData(memos, reviewState, parseAcctFn, manualRows) {
  parseAcctFn = parseAcctFn || parseAccountTableFromMemo;
  reviewState = reviewState || {};
  manualRows = manualRows || [];
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

  manualRows.forEach(r => allUserRows.push({
    email: r.email,
    project: r.project || '',
    memoNo: r.memoNo || 'Manual Import',
    licenses: {},
  }));

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

// ── Phase 1 (Inventory ↔ Assignment Alignment) — shared helpers ──────────
// Part 2: an override value may be the legacy plain boolean (untouched,
// still the only shape ever written for account-table-derived identities)
// or the new `{ active, licenseId }` object (only written for inventory-only
// identities). Every override read in this file goes through this one
// normalizer so both shapes are handled identically, with no migration.
function _ovIsActive(ov, fallback) {
  if (ov === undefined) return fallback;
  return typeof ov === 'object' ? !!ov.active : !!ov;
}

// Inverse of the "Name — Plan" display convention (already used by
// exportUserLicensesCSV's matrix columns): splits an assignable identity
// string back into its name/plan parts. A bare name (no " — ") has plan ''.
function _parseLicIdentity(identity) {
  const idx = identity.indexOf(' — ');
  return idx === -1 ? { name: identity, plan: '' } : { name: identity.slice(0, idx), plan: identity.slice(idx + 3) };
}

// Part 1 — Full License Inventory. Widens the assignable-software universe
// beyond account-table columns (`legacyCols`) to the complete effective
// License Inventory (`getAllLicenses()`: approved memo + manual + imported —
// imported licenses already land in the same manual store, no separate flag
// exists or is needed). "Name — Plan" is used only when the same name has
// more than one distinct plan in inventory; a single-plan name stays bare,
// matching the existing chip-label convention. Cancelled licenses are not
// assignable. Legacy columns are never duplicated into the widened set —
// their existing bare-name behavior (and any boolean overrides already
// written against them) is completely unaffected.
function _licAssignableIdentities(allLicenses, legacyCols) {
  const legacy = new Set(legacyCols || []);
  const plansByName = new Map();
  allLicenses.forEach(l => {
    if (getLicenseStatus(l).key === 'cancelled') return;
    if (!plansByName.has(l.name)) plansByName.set(l.name, new Set());
    if (l.plan) plansByName.get(l.name).add(l.plan);
  });
  const identities = new Set(legacy);
  plansByName.forEach((plans, name) => {
    if (plans.size > 1) {
      plans.forEach(plan => { const id = `${name} — ${plan}`; if (!legacy.has(id)) identities.add(id); });
    } else if (!legacy.has(name)) {
      identities.add(name);
    }
  });
  return [...identities].sort();
}

// Resolves an assignable identity ("Name" or "Name — Plan") to a specific
// inventory record when no memo directly backs it — i.e. a manual/imported
// inventory assignment (Part 1/2). Prefers an explicit licenseId pin (the
// new override shape) for an unambiguous match; otherwise matches by parsed
// name(+plan), preferring the group's own project, then a project-less
// (any-project) manual record ("manual license with no project" edge case),
// then any remaining match. Cancelled records are never resolved.
function _resolveInventoryIdentity(identity, allLicenses, project, ovValue) {
  const pinnedId = ovValue && typeof ovValue === 'object' ? ovValue.licenseId : null;
  if (pinnedId) {
    const pinned = allLicenses.find(l => String(l.id) === String(pinnedId));
    if (pinned) return pinned;
  }
  const { name, plan } = _parseLicIdentity(identity);
  const candidates = allLicenses.filter(l => l.name === name && (!plan || l.plan === plan) && getLicenseStatus(l).key !== 'cancelled');
  if (!candidates.length) return null;
  return candidates.find(l => l.project === project) || candidates.find(l => !l.project) || candidates[0];
}

// ── Phase 2B — Assignment Import (Excel/CSV) ──────────────────────────────
// This is NOT License Inventory import (that's importBulk('license') /
// importLicenses() in views/bulk_import.js, untouched). This import assigns
// users to *existing* License Inventory records — same override mechanism as
// Manage Licenses, never creates inventory, projects, or memos.
//
// CSV only for now — Excel (.xlsx) support is deferred, see docs/TECHNICAL_DEBT.md.
// A dedicated, dependency-free parser (not the XLSX-based views/bulk_import.js
// pipeline) keeps this self-contained and independently testable in Node.

// Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes ("")
// and commas/newlines inside quotes. Blank lines are dropped.
function _parseCSVText(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

// Maps the parsed CSV table's header row to the Assignment Import template
// columns (case-insensitive). Required: User Email, Software, Project.
// Optional: Plan, Note.
function _parseAssignmentImportFile(text) {
  const table = _parseCSVText(text);
  if (!table.length) return [];
  const headers = table[0].map(h => String(h || '').trim());
  const colIdx = label => headers.findIndex(h => h.toLowerCase() === label.toLowerCase());
  const emailIdx = colIdx('User Email'), softIdx = colIdx('Software'),
        planIdx  = colIdx('Plan'),       projIdx = colIdx('Project'), noteIdx = colIdx('Note');
  return table.slice(1).map(cols => ({
    email:    (cols[emailIdx] ?? '').trim(),
    software: (cols[softIdx]  ?? '').trim(),
    plan:     planIdx >= 0 ? (cols[planIdx] ?? '').trim() : '',
    project:  (cols[projIdx] ?? '').trim(),
    note:     noteIdx >= 0 ? (cols[noteIdx] ?? '').trim() : '',
  }));
}

const _ASSIGNMENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pure validation + matching — no DOM, no storage writes. Given parsed rows
// and the effective License Inventory (getAllLicenses()), classifies every
// row as valid / duplicate / ambiguous / rejected per the locked matching
// rules (Project + Software, Plan only to disambiguate):
//   - Plan provided  -> exact Software + Plan + Project match required.
//   - Plan blank + exactly one distinct plan among Software+Project matches
//     -> allowed (single-plan match).
//   - Plan blank + more than one distinct plan -> rejected as ambiguous.
//   - No inventory match at all -> rejected, "inventory not found".
// Cancelled inventory records are excluded from matching (consistent with
// every other assignable-identity computation in this file); expired
// records are NOT excluded — the app already treats expired licenses as
// assignable everywhere else (_licAssignableIdentities/_resolveInventoryIdentity
// only exclude 'cancelled'), so import does not invent a stricter rule.
function computeAssignmentImportPreview(rows, allLicenses) {
  const norm = v => String(v || '').trim().toLowerCase();
  const seen = new Set();
  const assignable = allLicenses.filter(l => getLicenseStatus(l).key !== 'cancelled');

  const out = (rows || []).map((r, i) => {
    const base = { rowIndex: i + 1, email: r.email || '', software: r.software || '', plan: r.plan || '', project: r.project || '', note: r.note || '' };
    if (!base.email)    return { ...base, status: 'rejected', reason: 'missing email' };
    if (!_ASSIGNMENT_EMAIL_RE.test(base.email)) return { ...base, status: 'rejected', reason: 'invalid email format' };
    if (!base.software) return { ...base, status: 'rejected', reason: 'missing software' };
    if (!base.project)  return { ...base, status: 'rejected', reason: 'missing project' };

    const dupKey = [norm(base.email), norm(base.software), norm(base.project), norm(base.plan)].join('|');
    if (seen.has(dupKey)) return { ...base, status: 'duplicate', reason: 'duplicate row in file' };
    seen.add(dupKey);

    let candidates = assignable.filter(l => norm(l.project) === norm(base.project) && norm(l.name) === norm(base.software));
    if (base.plan) {
      candidates = candidates.filter(l => norm(l.plan) === norm(base.plan));
      if (!candidates.length) return { ...base, status: 'rejected', reason: 'inventory not found' };
    } else {
      if (!candidates.length) return { ...base, status: 'rejected', reason: 'inventory not found' };
      const plans = new Set(candidates.map(l => norm(l.plan)));
      if (plans.size > 1) return { ...base, status: 'ambiguous', reason: 'ambiguous plan — multiple plans exist for this software in this project' };
    }
    const matched = candidates[0];
    return { ...base, status: 'valid', reason: '', matchedLicenseId: String(matched.id), matchedPlan: matched.plan || '' };
  });

  const countOf = st => out.filter(r => r.status === st).length;
  return {
    total: out.length,
    validCount: countOf('valid'),
    rejectedCount: countOf('rejected'),
    duplicateCount: countOf('duplicate'),
    ambiguousCount: countOf('ambiguous'),
    rows: out,
  };
}

// Resolves the exact assignable identity string ("Name" or "Name — Plan")
// for a matched inventory record, reusing _licAssignableIdentities() (Part 1)
// so the override key this import writes is byte-identical to what Manage
// Licenses would compute for the same record — no separate identity logic.
function _licIdentityForLicense(lic, allLicenses) {
  const identities = _licAssignableIdentities(allLicenses, []);
  if (lic.plan) {
    const withPlan = `${lic.name} — ${lic.plan}`;
    if (identities.includes(withPlan)) return withPlan;
  }
  return lic.name;
}

// Applies every 'valid' row from a computeAssignmentImportPreview() result:
// writes an override using the exact same shape Manage Licenses writes for
// an inventory-only assignment ({ active: true, licenseId }), tagged with
// `source: 'import'` (additive — _ovIsActive()/_resolveInventoryIdentity()
// only ever read `.active`/`.licenseId`, so plain boolean overrides written
// elsewhere are completely unaffected), and ensures the (email, project)
// pair has a manual row so it's visible in the Users tab/Reconciliation
// even when no memo ever granted that user anything. Duplicate/ambiguous/
// rejected rows are never written — already excluded from `valid`. Returns
// the number of rows actually applied.
function applyAssignmentImport(preview, allLicenses) {
  const overrides = _getLicUserOverrides();
  const manualRows = _getLicUserManualRows();
  const manualKeySet = new Set(manualRows.map(r => `${String(r.email).toLowerCase()}|${String(r.project || '').toLowerCase()}`));
  const now = new Date().toISOString();
  let applied = 0;

  (preview?.rows || []).filter(r => r.status === 'valid').forEach(r => {
    const matched = allLicenses.find(l => String(l.id) === r.matchedLicenseId);
    if (!matched) return;
    const identity = _licIdentityForLicense(matched, allLicenses);
    const ovKey = `${r.email}|${r.project}|${identity}`;
    overrides[ovKey] = { active: true, licenseId: String(matched.id), source: 'import', importedAt: now };

    const mk = `${r.email.toLowerCase()}|${r.project.toLowerCase()}`;
    if (!manualKeySet.has(mk)) {
      manualRows.push({ email: r.email, project: r.project, memoNo: 'Manual Import', licenses: {}, source: 'import', importedAt: now });
      manualKeySet.add(mk);
    }
    applied++;
  });

  _saveLicUserOverrides(overrides);
  _saveLicUserManualRows(manualRows);
  return applied;
}

function downloadAssignmentTemplate() {
  const headers = ['User Email', 'Software', 'Plan', 'Project', 'Note'];
  const example = [
    ['designer1@orbit.co.th', 'Figma', 'Professional', 'Geo9', 'Historical assignment'],
    ['dev1@orbit.co.th', 'GitHub Copilot', 'Business', 'AOA-MP', 'Manual migration'],
  ];
  _downloadCSV('Assignment_Import_Template', headers, example);
}

function _triggerAssignmentImport() {
  const input = document.getElementById('lic-assignment-import-input');
  if (!input) return;
  input.value = '';
  input.click();
}

function _handleAssignmentImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rows = _parseAssignmentImportFile(String(e.target.result || ''));
      if (!rows.length) { alert('ไม่พบข้อมูลในไฟล์ (No rows found)'); return; }
      const preview = computeAssignmentImportPreview(rows, getAllLicenses());
      window._licAssignmentImportPreview = preview;
      _renderAssignmentImportPreview(preview);
    } catch(err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message);
    }
  };
  reader.readAsText(file);
}

function _renderAssignmentImportPreview(preview) {
  const modal = document.getElementById('lic-assignment-import-modal');
  if (!modal) return;
  const stat = (label, val, color) => `<div><div style="font-size:10px;color:var(--text-3);text-transform:uppercase">${label}</div><div style="font-weight:700;font-size:16px;${color ? `color:${color}` : ''}">${val}</div></div>`;
  const summary = document.getElementById('lic-assignment-import-summary');
  if (summary) {
    summary.innerHTML = stat('Total', preview.total)
      + stat('Valid', preview.validCount, 'var(--green,#27500A)')
      + stat('Duplicate', preview.duplicateCount, 'var(--text-2)')
      + stat('Ambiguous', preview.ambiguousCount, 'var(--amber,#C9821A)')
      + stat('Rejected', preview.rejectedCount, 'var(--red)');
  }
  const badgeCls = { valid: 'badge-green', duplicate: 'badge-gray', ambiguous: 'badge-orange', rejected: 'badge-red' };
  const rowsWrap = document.getElementById('lic-assignment-import-rows');
  if (rowsWrap) {
    rowsWrap.innerHTML = `<table class="hist-table"><thead><tr>
        <th style="padding-left:10px">#</th><th>Email</th><th>Software</th><th>Plan</th><th>Project</th>
        <th style="text-align:center">Status</th><th>Reason</th>
      </tr></thead><tbody>${preview.rows.map(r => `<tr>
        <td style="padding-left:10px;font-size:11px">${r.rowIndex}</td>
        <td style="font-size:11px">${esc(r.email)}</td>
        <td style="font-size:11px">${esc(r.software)}</td>
        <td style="font-size:11px">${esc(r.plan || '—')}</td>
        <td style="font-size:11px">${esc(r.project)}</td>
        <td style="text-align:center"><span class="badge ${badgeCls[r.status] || 'badge-gray'}">${esc(r.status)}</span></td>
        <td style="font-size:11px;color:var(--text-2)">${esc(r.reason || '')}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  const confirmBtn = document.getElementById('lic-assignment-import-confirm');
  if (confirmBtn) confirmBtn.disabled = preview.validCount === 0;
  modal.style.display = 'flex';
}

function _closeAssignmentImportModal() {
  const modal = document.getElementById('lic-assignment-import-modal');
  if (modal) modal.style.display = 'none';
  window._licAssignmentImportPreview = null;
}

function _confirmAssignmentImport() {
  const preview = window._licAssignmentImportPreview;
  if (!preview || !preview.validCount) return;
  const applied = applyAssignmentImport(preview, getAllLicenses());
  const summary = `✓ Import สำเร็จ\nAssigned ${applied}` +
    (preview.duplicateCount ? ` · Duplicate ${preview.duplicateCount}` : '') +
    (preview.ambiguousCount ? ` · Ambiguous ${preview.ambiguousCount}` : '') +
    (preview.rejectedCount  ? ` · Rejected ${preview.rejectedCount}`   : '');
  _closeAssignmentImportModal();
  _renderLicUsers();
  alert(summary);
}

// ── TAB 3: USERS ─────────────────────────────────────────
// Users tab answers one question — "which software does this user currently
// have?" — so the primary table is User / Licenses (chips) / Action only.
// Department, Project, Seat, Source Memo and Status are implementation detail
// and live in the Export and inside the Edit Licenses dialog, not the table.
function _renderLicUsers() {
  const memos = loadMemos();
  const reviewState = _getLicReviewState();
  const { allUserRows, allLicCols, queueItems } = computeLicUserMappingData(memos, reviewState, undefined, _getLicUserManualRows());

  const projects = [...new Set(allUserRows.map(r=>r.project).filter(Boolean))].sort();

  const el = document.getElementById('lic-content');
  if (!el) return;

  window._licReviewQueue = queueItems;

  if (!allUserRows.length && !queueItems.length) {
    el.innerHTML = `<div class="hist-empty">
      No users found — fill in the "Account table" on an SL memo for data to appear here.
    </div>`;
    return;
  }

  // Store data in window so handlers can access without embedding JSON in HTML.
  // Part 1: the assignable universe (`_licUsrCols`) is widened to the full
  // effective License Inventory, not just this memo's account-table columns;
  // `_licUsrAcctCols` keeps the narrow legacy list so the save path can still
  // tell a legacy (boolean-only) identity apart from a new inventory-only one.
  const allLicenses = getAllLicenses();
  window._licUsrRows = allUserRows;
  window._licUsrAcctCols = allLicCols;
  window._licUsrCols = _licAssignableIdentities(allLicenses, allLicCols);

  el.innerHTML = `
    ${_renderLicReviewQueueHtml(queueItems)}
    <div id="lic-usr-context-banner" style="margin-bottom:12px;display:none"></div>
    <div class="filter-toolbar">
      <input id="lic-usr-search" type="text" class="filter-search" placeholder="Search..."
        oninput="_renderLicUsersRows()">
      <select id="lic-usr-proj" onchange="_renderLicUsersRows()">
        ${projects.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
      <select id="lic-usr-lic" onchange="_renderLicUsersRows()">
        ${window._licUsrCols.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
      <div class="filter-actions">
        <button class="btn-sm" onclick="exportUserLicensesCSV()">⬇ Export User Licenses</button>
        <button class="btn-sm" onclick="downloadAssignmentTemplate()" title="Download Assignment Template">⬇ Download Assignment Template</button>
        <button class="btn-sm" onclick="_triggerAssignmentImport()" title="Import User Assignments from CSV">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Import Assignments
        </button>
      </div>
    </div>
    <input type="file" id="lic-assignment-import-input" accept=".csv,text/csv" style="display:none" onchange="_handleAssignmentImportFile(event)">
    <div class="card" style="padding:0;overflow:hidden">
      <table class="hist-table" id="lic-usr-table">
        <thead><tr>
          <th style="padding-left:14px">User</th>
          <th>Licenses</th>
          <th style="text-align:center;white-space:nowrap">Action</th>
        </tr></thead>
        <tbody id="lic-usr-body"></tbody>
      </table>
    </div>
    <div id="lic-usr-editor" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:300;align-items:center;justify-content:center">
      <div class="card" style="width:560px;max-width:94vw;max-height:85vh;padding:0;margin:0;display:flex;flex-direction:column;overflow:hidden">
        <div style="flex-shrink:0;padding:20px 20px 0 20px">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px">
            <div><div style="font-size:15px;font-weight:700">Manage Licenses</div><div id="lic-usr-editor-name" style="font-size:11px;color:var(--text-2);margin-top:2px"></div></div>
            <button class="btn-sm" onclick="_closeLicUserEditor()">✕</button>
          </div>
          <div style="font-size:11px;color:var(--text-2);margin-bottom:10px">Current Licenses shows what this user has today. + Add Manual License is grouped by Project. Check an item to assign it; uncheck any Current License to remove it. Purchased/Assigned/Remaining seat counts are shown in License Summary &gt; Reconciliation, not here.</div>
          <div style="position:relative;margin-bottom:10px">
            <span aria-hidden="true" style="position:absolute;left:9px;top:50%;transform:translateY(-50%);font-size:11px;line-height:1;pointer-events:none">🔍</span>
            <input type="text" id="lic-usr-editor-search" placeholder="Search software, plan, or project..." oninput="_filterLicUserEditorOptions()"
              style="width:100%;box-sizing:border-box;font-family:inherit;font-size:12px;padding:6px 10px 6px 28px;border:1px solid var(--border-md);border-radius:var(--r-sm);background:var(--surface);outline:none">
          </div>
          <div style="display:flex;gap:6px;margin-bottom:12px">
            <button class="btn-sm" onclick="_setAllLicUserEditor(true)">✓ Select all</button>
            <button class="btn-sm" onclick="_setAllLicUserEditor(false)">Clear all</button>
          </div>
        </div>
        <div id="lic-usr-editor-options" style="flex:1;min-height:0;overflow-y:auto;padding:4px 20px 16px"></div>
        <div style="flex-shrink:0;display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;border-top:1px solid var(--border)">
          <button class="btn-ghost" onclick="_closeLicUserEditor()">Cancel</button>
          <button class="btn-primary" onclick="_saveLicUserEditor()">Save licenses</button>
        </div>
      </div>
    </div>
    <div id="lic-assignment-import-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:310;align-items:center;justify-content:center">
      <div class="card" style="width:680px;max-width:96vw;max-height:85vh;padding:20px;display:flex;flex-direction:column;overflow:hidden">
        <div style="flex-shrink:0;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px">
          <div>
            <div style="font-size:15px;font-weight:700">Import Assignments — Preview</div>
            <div style="font-size:11px;color:var(--text-2);margin-top:2px">Only valid rows will be assigned. Review duplicate/ambiguous/rejected rows below before confirming.</div>
          </div>
          <button class="btn-sm" onclick="_closeAssignmentImportModal()">✕</button>
        </div>
        <div id="lic-assignment-import-summary" style="flex-shrink:0;display:flex;gap:20px;margin-bottom:14px;flex-wrap:wrap"></div>
        <div id="lic-assignment-import-rows" style="flex:1;min-height:0;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r-sm)"></div>
        <div style="flex-shrink:0;display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
          <button class="btn-ghost" onclick="_closeAssignmentImportModal()">Cancel</button>
          <button class="btn-primary" id="lic-assignment-import-confirm" onclick="_confirmAssignmentImport()">Confirm Import</button>
        </div>
      </div>
    </div>`;

  // Part 8 (UX consistency pass) — Project/Software are multi-select filters.
  initMultiSelect('lic-usr-proj', 'ทุก project', 'Project');
  initMultiSelect('lic-usr-lic', 'ทุก license', 'Software');
  _renderLicUsrContextBanner();
  _renderLicUsersRows();
}

// Phase 2D.2 — shows which Reconciliation row (Project/Software/Plan) the
// current Users list is scoped to, and lets PMO drop back to the full list.
function _renderLicUsrContextBanner() {
  const el = document.getElementById('lic-usr-context-banner');
  if (!el) return;
  const f = _licUsrDeepLinkFilter;
  if (!f) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--blue-50,#E6F1FB);border:1px solid var(--border-md);border-radius:var(--r-sm);padding:8px 12px">
      <div style="font-size:12px;color:var(--text-1)">
        Showing assigned users for:
        <strong>Project: ${esc(f.project)}</strong> · <strong>Software: ${esc(f.name)}</strong>${f.plan ? ` · <strong>Plan: ${esc(f.plan)}</strong>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn-sm" onclick="_backToReconciliationFromUsers()">← Back to Reconciliation</button>
        <button class="btn-sm" onclick="_clearLicUsrDeepLinkFilter()">Clear filter</button>
      </div>
    </div>`;
}

// Merge account-list rows into one entry per (email, project) — the same
// grouping/override key shape _openLicUserEditor()/_saveLicUserEditor()
// already depend on, unchanged. Also tracks, per license, which memo(s)
// actually granted it (licenseSources), so exports/detail can show a real
// Source Memo instead of guessing. Shared by both the table render and the
// export so the two never drift (MASTER_SPEC: exports must match the UI).
function _buildLicUserGroups(rows) {
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
  return emailProjMap;
}

// Which licenses are active for a group, after applying manual overrides —
// same precedence rule the editor and export already use (override wins,
// else fall back to what the memo's account table granted). Part 2: reads
// either override shape (legacy boolean or the new {active, licenseId}
// object) via the shared normalizer.
function _licActiveForGroup(group, allLicCols, overrides) {
  const key = `${group.email}|${group.project}`;
  return allLicCols.filter(lic => {
    const fromMemo = group.licenses[lic] === true;
    return _ovIsActive(overrides[`${key}|${lic}`], fromMemo);
  });
}

// Resolve which real license record (plan/seats/expiry) backs a given
// (group, software) assignment. Tries the original memo-grant match first
// (name + project + granting memo — unchanged, 100% legacy behavior), then
// falls back to resolving `lic` as a Part 1 inventory-only identity (manual/
// imported license, optionally pinned via the override's licenseId) when no
// memo backs it.
function _licUserAssignmentDetail(group, lic, allLicenses, ovValue) {
  const sources = [...(group.licenseSources[lic] || [])];
  let match = allLicenses.find(l => l.name === lic && l.project === group.project && sources.includes(l.memoNo));
  if (!match) match = _resolveInventoryIdentity(lic, allLicenses, group.project, ovValue);
  // Phase 2B — an override written by Assignment Import carries `source:
  // 'import'`, backward compatible with plain boolean overrides (undefined
  // here) and the pre-existing `{active, licenseId}` shape (also undefined
  // unless explicitly set). Lets callers label an imported assignment
  // distinctly from a memo grant or a PMO manual edit.
  const overrideSource = (ovValue && typeof ovValue === 'object' && ovValue.source) ? ovValue.source : null;
  return {
    plan: match?.plan || '', seat: match?.seats ?? null,
    status: match ? getLicenseStatus(match) : null,
    updatedAt: match?.updatedAt || null,
    sources, match: match || null, overrideSource,
  };
}

// Shared "Source" label — Memo / Multiple memos / Manual / Import — used by
// both the Manage Licenses dialog and Reconciliation's Assigned Users
// drill-down so the two never disagree on how an assignment is labeled.
function _licAssignmentSourceLabel(detail) {
  if (detail.overrideSource === 'import') return 'Import';
  if (detail.sources.length > 1) return 'Multiple memos';
  if (detail.sources.length === 1) return 'Memo';
  return 'Manual';
}

// Software names (not software+plan) a user currently, effectively (i.e.
// after manual overrides) has — used by the software filter so "who has
// Figma" reflects reality, not just what the memo originally granted.
function _licUserHasAnySoftware(user, softwareNames, allLicCols, overrides) {
  return user.projectGroups.some(group =>
    _licActiveForGroup(group, allLicCols, overrides).some(lic => softwareNames.includes(lic)));
}

// One chip per unique Software + Plan combo across all of a user's project
// groups (not per memo, not per project) — duplicates collapse visually only.
// `lic` may be a legacy bare name (plan resolved via matching) or a Part 1
// composite "Name — Plan" inventory identity; both normalize to the same
// {name, plan} shape so the resulting label/dedup key is consistent either way.
function _licChipsForUser(user, allLicCols, overrides, allLicenses) {
  const seen = new Map();
  user.projectGroups.forEach(group => {
    _licActiveForGroup(group, allLicCols, overrides).forEach(lic => {
      const ovKey = `${group.email}|${group.project}|${lic}`;
      const parsed = _parseLicIdentity(lic);
      const detail = _licUserAssignmentDetail(group, lic, allLicenses, overrides[ovKey]);
      const plan = detail.plan || parsed.plan;
      const key = `${parsed.name}|${plan}`;
      if (!seen.has(key)) seen.set(key, plan ? `${parsed.name} ${plan}` : parsed.name);
    });
  });
  return [...seen.values()];
}

function _renderLicUsersRows() {
  const allUserRows = window._licUsrRows || [];
  const allLicCols  = window._licUsrCols || [];
  const search  = (document.getElementById('lic-usr-search')?.value || '').toLowerCase();
  const projF   = msValues('lic-usr-proj');
  const licF    = msValues('lic-usr-lic');
  const tbody   = document.getElementById('lic-usr-body');
  if (!tbody) return;

  // Project/search narrow which (email, project) rows exist at all. The
  // software filter is applied later, at the user level (after merging), so
  // a matching user still shows their full license count/detail — not just
  // the one software that matched the filter.
  let rows = allUserRows;
  if (projF.length) rows = rows.filter(r => projF.includes(r.project));
  if (search) rows = rows.filter(r => r.email.toLowerCase().includes(search));
  // Phase 2D.2 — Reconciliation "View in Users tab" deep link: a temporary
  // display-only narrowing to the assigned emails from that row, combined
  // (AND) with whatever Search/Project/Software filters are also set. Never
  // written to overrides/settings — cleared via _clearLicUsrDeepLinkFilter().
  if (_licUsrDeepLinkFilter) {
    const emailSet = new Set(_licUsrDeepLinkFilter.emails.map(e => e.toLowerCase()));
    rows = rows.filter(r => emailSet.has(r.email.toLowerCase()));
  }

  const emailProjMap = _buildLicUserGroups(rows);
  window._licUsrMerged = emailProjMap;

  // User-centric view: one row per email (User / Licenses / Action). Project,
  // Department, Seat, Source Memo and Status are not shown here — they live
  // in View Details, the Edit Licenses dialog, and the Export.
  const userMap = {};
  Object.values(emailProjMap).forEach(group => {
    if (!userMap[group.email]) userMap[group.email] = { email: group.email, projectGroups: [] };
    userMap[group.email].projectGroups.push(group);
  });

  const overrides = _getLicUserOverrides();
  const allLicenses = getAllLicenses();

  let users = Object.values(userMap).sort((a, b) => a.email.localeCompare(b.email));
  // Software filter is OR across selections and reflects effective (post
  // manual-override) assignment, so "who has Figma" answers with reality.
  if (licF.length) users = users.filter(u => _licUserHasAnySoftware(u, licF, allLicCols, overrides));
  window._licUsrVisibleUsers = users;

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="padding:0">
      <div style="text-align:center;padding:48px 24px">
        <div style="font-size:32px;margin-bottom:12px">🔍</div>
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">No users found.</div>
        <div style="font-size:12px;color:var(--text-3)">Try changing your filters.</div>
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => {
    const initials = u.email.substring(0, 2).toUpperCase();
    const chips = _licChipsForUser(u, allLicCols, overrides, allLicenses);
    const visibleChips = chips.slice(0, 3);
    const hiddenChips = chips.slice(3);
    const chipsHtml = chips.length
      ? visibleChips.map(c => `<span class="badge badge-blue" style="margin:2px 4px 2px 0;display:inline-block">${esc(c)}</span>`).join('')
        + (hiddenChips.length ? `<span style="font-size:11px;color:var(--text-3);margin-left:2px" title="${esc(hiddenChips.join(', '))}">+${hiddenChips.length} more</span>` : '')
      : '<span style="color:var(--text-3)">—</span>';
    return `<tr>
        <td style="padding-left:14px">
          <span style="width:26px;height:26px;border-radius:50%;background:var(--blue-50,#E6F1FB);display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:var(--blue);margin-right:6px;vertical-align:middle">${initials}</span>
          ${esc(u.email)}
        </td>
        <td>${chipsHtml}</td>
        <td style="text-align:center;white-space:nowrap">
          <button class="btn-sm" onclick="_openLicUserEditorForEmail('${esc(u.email)}')">Manage Licenses</button>
        </td>
      </tr>`;
  }).join('');
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

// ── Phase 2B — manual/imported (email, project) user rows ────────────────
// Assignment Import (and any future "add a user with no memo account-table
// row" action) needs a place for that (email, project) pair to exist so the
// existing group/override machinery below has something to attach to — the
// Users tab, Reconciliation, and both exports only ever look at
// computeLicUserMappingData()'s `allUserRows`, which was previously sourced
// solely from approved SL memos' "ตาราง Account". This store is the manual
// counterpart to `manual` licenses in getAllLicenses() — same merge pattern,
// no new database table, no separate calculation path. A manual row's
// `licenses` object is always empty; the actual assignment lives entirely in
// the pre-existing overrides store (_LIC_USR_OV_KEY) — this store only makes
// the (email, project) pair visible.
const _LIC_USR_MANUAL_KEY = 'orbit-lic-user-manual-rows-v1';

async function _loadLicUserManualRowsAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('settings', 'GET', null, '?id=eq.lic-user-manual-rows');
      if (rows && rows[0]?.data) {
        const d = rows[0].data;
        try { localStorage.setItem(_LIC_USR_MANUAL_KEY, JSON.stringify(d)); } catch(e) {}
        return d;
      }
    } catch(e) { console.warn('_loadLicUserManualRowsAsync failed', e.message); }
  }
  return _getLicUserManualRows();
}
async function _saveLicUserManualRowsAsync(data) {
  try { localStorage.setItem(_LIC_USR_MANUAL_KEY, JSON.stringify(data)); } catch(e) {}
  if (await checkSupa()) {
    try {
      await supaFetch('settings', 'POST', { id: 'lic-user-manual-rows', data }, '?on_conflict=id');
    } catch(e) { console.warn('_saveLicUserManualRowsAsync failed', e.message); }
  }
}
function _getLicUserManualRows() {
  try { const d = JSON.parse(localStorage.getItem(_LIC_USR_MANUAL_KEY) || '[]'); return Array.isArray(d) ? d : []; }
  catch(e) { return []; }
}
function _saveLicUserManualRows(data) {
  try { localStorage.setItem(_LIC_USR_MANUAL_KEY, JSON.stringify(data)); } catch(e) {}
  _saveLicUserManualRowsAsync(data).catch(e => console.warn('Manual user rows sync failed', e));
}
// Idempotent: adds an (email, project) row only if one doesn't already exist.
function _ensureLicUserManualRow(email, project) {
  const rows = _getLicUserManualRows();
  const key = `${String(email).toLowerCase()}|${String(project || '').toLowerCase()}`;
  const exists = rows.some(r => `${String(r.email).toLowerCase()}|${String(r.project || '').toLowerCase()}` === key);
  if (!exists) {
    rows.push({ email, project: project || '', memoNo: 'Manual Import', licenses: {}, source: 'import', importedAt: new Date().toISOString() });
    _saveLicUserManualRows(rows);
  }
  return rows;
}

// Users tab shows one row per user (no Project column), but assignments are
// still tracked per (email, project) under the hood — unchanged business
// logic. Open the editor for the user's first project group; if they have
// more than one, a small switcher inside the dialog lets PMO pick which
// project's assignment they're editing (Project stays "inside Edit Licenses
// only", never in the main table).
function _openLicUserEditorForEmail(email) {
  const groups = Object.values(window._licUsrMerged || {})
    .filter(g => g.email === email)
    .sort((a, b) => (a.project || '').localeCompare(b.project || ''));
  if (!groups.length) return;
  window._licUsrEditGroups = groups;
  _openLicUserEditor(`${groups[0].email}|${groups[0].project}`);
}

// Manage Licenses combines what used to be two separate actions (View
// Details + Edit Licenses) into one. Project selection lives only inside
// this dialog; the Users table and its rows keep showing software names
// only, never Project.
//
// Simplify hotfix (2026-07-06): earlier passes' card-styled, multi-line rows
// and collapsible "▼ Project" sections were reported as still visually
// broken/overly complex. Per explicit new instruction, seat context
// (Purchased/Assigned/Remaining) is REMOVED from this modal entirely — it
// now belongs only to License Summary > Reconciliation, never here. Rows
// are a single flat, borderless, always-expanded list: [checkbox] [name +
// at most one small detail line]. Current Licenses shows Plan/Source only
// (Source Memo/Status dropped from this view — still available via License
// Summary > Reconciliation's Assigned Users drill-down). + Add Manual
// License shows Plan only, grouped under plain "Project: X" text headers
// (no seat data, no card, no toggle). Checking/unchecking is still the exact
// same override write _saveLicUserEditor() already performed — no override
// model, licenseId, save, search, or reconciliation logic changed, only what
// renders.
function _openLicUserEditor(key) {
  const row = window._licUsrMerged?.[key];
  const modal = document.getElementById('lic-usr-editor');
  if(!row || !modal) return;
  window._licUsrEditKey = key;
  const overrides = _getLicUserOverrides();
  const allLicenses = getAllLicenses();
  const groups = (window._licUsrEditGroups || [row]).filter(g => g.email === row.email);
  window._licUsrEditorGroups = groups;

  const nameEl = document.getElementById('lic-usr-editor-name');
  if (nameEl) nameEl.textContent = row.email;

  // Which Project a not-yet-assigned identity's inventory record belongs to
  // — used only to group + Add Manual License by Project. No seat counts
  // are read/computed here at all (Simplify hotfix — Purchased/Assigned/
  // Remaining live only in License Summary > Reconciliation).
  const licensesByName = new Map();
  allLicenses.forEach(l => {
    if (getLicenseStatus(l).key === 'cancelled') return;
    if (!licensesByName.has(l.name)) licensesByName.set(l.name, []);
    licensesByName.get(l.name).push(l);
  });
  const findProjectMatches = (name, plan) => (licensesByName.get(name) || []).filter(l => !plan || l.plan === plan);

  // Simple, flat row shell: [checkbox] [name + at most one small detail
  // line]. No card border/background/padding beyond a thin vertical rhythm
  // — nothing to overlap. `lic-simple-row` is the new structural class hook;
  // `lic-usr-edit-row`/`lic-usr-edit-check`/`data-*` attributes are kept
  // unchanged alongside it so _filterLicUserEditorOptions()/
  // _saveLicUserEditor() need no changes.
  const simpleRow = (e, checked, detail) => `<label class="lic-usr-edit-row lic-simple-row" data-license-name="${esc(e.license.toLowerCase())}" data-plan="${esc((e.rowPlan||'').toLowerCase())}" data-project="${esc((e.rowProject||'').toLowerCase())}" style="display:flex;align-items:flex-start;gap:8px;padding:6px 2px;cursor:pointer">
      <input type="checkbox" class="lic-usr-edit-check" data-group-key="${esc(e.groupKey)}" data-license-index="${e.index}"${checked ? ' checked' : ''} style="flex:0 0 auto;width:16px;height:16px;margin:2px 0 0;accent-color:var(--blue)">
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:600;line-height:1.4;white-space:normal;word-break:break-word;overflow-wrap:anywhere">${esc(e.license)}</div>
        ${detail ? `<small style="display:block;font-size:11px;color:var(--text-2);line-height:1.5;margin-top:2px;white-space:normal;word-break:break-word;overflow-wrap:anywhere">${detail}</small>` : ''}
      </div>
    </label>`;

  // Current Licenses row: Plan (if known) + Source only.
  const currentRow = e => {
    // A composite "Name — Plan" identity already shows its plan in the label
    // itself — skip the redundant "Plan: X" text for those.
    const showPlanLine = e.detail?.plan && !e.license.includes(' — ');
    const parts = [];
    if (showPlanLine) parts.push(`Plan: ${esc(e.detail.plan)}`);
    parts.push(`Source: ${esc(_licAssignmentSourceLabel(e.detail))}`);
    e.rowPlan = e.detail?.plan || ''; e.rowProject = e.groupProject;
    return simpleRow(e, true, parts.join(' · '));
  };

  // Available (not-yet-assigned) row: Plan only (if known) — Project is
  // shown once as the enclosing group's header text, not repeated per row.
  const availableRow = e => {
    const detail = e.plan ? `Plan: ${esc(e.plan)}` : '';
    e.rowPlan = e.plan || ''; e.rowProject = e.project;
    return simpleRow(e, false, detail);
  };

  const sectionsHtml = groups.map(group => {
    const groupKey = `${group.email}|${group.project}`;
    const entries = (window._licUsrCols || []).map((license, index) => {
      const ovKey = `${groupKey}|${license}`;
      const ov = overrides[ovKey];
      const active = _ovIsActive(ov, group.licenses[license] === true);
      if (active) {
        const detail = _licUserAssignmentDetail(group, license, allLicenses, ov);
        return { license, index, active, detail, groupKey, groupProject: group.project };
      }
      const parsed = _parseLicIdentity(license);
      const matches = findProjectMatches(parsed.name, parsed.plan);
      const matched = matches.find(l => l.project === group.project) || matches[0] || null;
      const project = matched ? (matched.project || '(ไม่ระบุ)') : (group.project || '(ไม่ระบุ)');
      const plan = matched?.plan || parsed.plan;
      return { license, index, active, project, plan, groupKey };
    });
    const activeEntries = entries.filter(e => e.active);
    const inactiveEntries = entries.filter(e => !e.active);

    // Group Manual License options by the Project their inventory match
    // belongs to — a plain "Project: X" text header per group, no card, no
    // toggle (Fix 2, simplified — was a flat, project-less list).
    const byProject = new Map();
    inactiveEntries.forEach(e => {
      if (!byProject.has(e.project)) byProject.set(e.project, []);
      byProject.get(e.project).push(e);
    });
    const addManualHtml = [...byProject.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([proj, list]) => `<div class="lic-usr-add-group">
        <div class="project-group" style="font-size:11px;font-weight:700;color:var(--text-2);margin:8px 0 4px">Project: ${esc(proj)}</div>
        ${list.map(availableRow).join('')}
      </div>`).join('');

    // The project-group heading is only shown when a user belongs to more
    // than one project — the common single-project case stays a flat,
    // heading-free list per the simplified layout.
    const groupLabel = groups.length > 1
      ? `<div class="project-group" style="font-size:11px;font-weight:700;color:var(--text-2);margin-bottom:6px">Project: ${esc(group.project || '(ไม่ระบุ)')}</div>`
      : '';

    return `<div class="lic-usr-edit-group" style="margin-bottom:18px">
      ${groupLabel}
      <div style="font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.02em;margin-bottom:6px">Current Licenses (${activeEntries.length})</div>
      ${activeEntries.length ? activeEntries.map(currentRow).join('') : '<div style="font-size:12px;color:var(--text-3);padding:2px 2px 10px">No active licenses</div>'}
      <div style="font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.02em;margin:12px 0 6px">+ Add Manual License</div>
      ${inactiveEntries.length ? addManualHtml : '<div style="font-size:12px;color:var(--text-3);padding:2px">All available software already assigned</div>'}
    </div>`;
  }).join('');

  document.getElementById('lic-usr-editor-options').innerHTML = sectionsHtml;
  const searchEl = document.getElementById('lic-usr-editor-search');
  if (searchEl) searchEl.value = '';
  modal.style.display = 'flex';
}

// Part 2 — realtime search across every project section's software list.
// Matches software name, plan, or project (hotfix — previously name only),
// hide/show via CSS, no re-render. Collapses a Project sub-group (under
// + Add Manual License) or an outer project section entirely when none of
// its rows match.
function _filterLicUserEditorOptions() {
  const q = (document.getElementById('lic-usr-editor-search')?.value || '').trim().toLowerCase();
  document.querySelectorAll('#lic-usr-editor-options .lic-usr-edit-row').forEach(row => {
    const match = !q
      || (row.dataset.licenseName || '').includes(q)
      || (row.dataset.plan || '').includes(q)
      || (row.dataset.project || '').includes(q);
    row.style.display = match ? '' : 'none';
  });
  document.querySelectorAll('#lic-usr-editor-options .lic-usr-add-group').forEach(sub => {
    if (!q) { sub.style.display = ''; return; }
    const rows = [...sub.querySelectorAll('.lic-usr-edit-row')];
    sub.style.display = rows.some(r => r.style.display !== 'none') ? '' : 'none';
  });
  document.querySelectorAll('#lic-usr-editor-options .lic-usr-edit-group').forEach(group => {
    if (!q) { group.style.display = ''; return; }
    const rows = [...group.querySelectorAll('.lic-usr-edit-row')];
    group.style.display = rows.some(r => r.style.display !== 'none') ? '' : 'none';
  });
}

function _setAllLicUserEditor(checked) {
  document.querySelectorAll('#lic-usr-editor-options .lic-usr-edit-check').forEach(input => { input.checked = checked; });
}

function _closeLicUserEditor() {
  const modal = document.getElementById('lic-usr-editor');
  if(modal) modal.style.display = 'none';
  window._licUsrEditKey = null;
  window._licUsrEditGroups = null;
  window._licUsrEditorGroups = null;
}

function _saveLicUserEditor() {
  const groups = window._licUsrEditorGroups || [];
  if (!groups.length) return;
  const groupByKey = new Map(groups.map(g => [`${g.email}|${g.project}`, g]));
  const licenses = window._licUsrCols || [];
  const legacyCols = new Set(window._licUsrAcctCols || []);
  const overrides = _getLicUserOverrides();
  const allLicenses = getAllLicenses();
  document.querySelectorAll('#lic-usr-editor-options .lic-usr-edit-check').forEach(input => {
    const row = groupByKey.get(input.dataset.groupKey);
    if (!row) return;
    const license = licenses[Number(input.dataset.licenseIndex)];
    const ovKey = `${input.dataset.groupKey}|${license}`;
    const fromMemo = row.licenses[license] === true;
    if (legacyCols.has(license)) {
      // Legacy account-table identity — unchanged boolean-only write path,
      // byte-for-byte the same as before Phase 1.
      if (input.checked === fromMemo) delete overrides[ovKey];
      else overrides[ovKey] = input.checked;
    } else if (!input.checked) {
      delete overrides[ovKey];
    } else {
      // Part 1/2: a manual/imported inventory-only identity. Pin the exact
      // backing record (licenseId) so reconciliation/plan resolution is
      // unambiguous even if the identity string alone isn't.
      const resolved = _resolveInventoryIdentity(license, allLicenses, row.project, null);
      overrides[ovKey] = resolved ? { active: true, licenseId: String(resolved.id) } : { active: true };
    }
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
    <div class="filter-toolbar">
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
      <div class="filter-actions">
        <button class="btn-primary" onclick="openLicenseModal()">
          + Add License
        </button>
      </div>
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
  initMultiSelect('lic-ot-type', 'ทุกประเภท', 'Type');
  initMultiSelect('lic-ot-proj', 'ทุก project', 'Project');
  initMultiSelect('lic-ot-status', 'ทุกสถานะ', 'Status');
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
    tbody.innerHTML = `<tr><td colspan="9" class="hist-empty">No licenses found — click Add License to add one.</td></tr>`;
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
