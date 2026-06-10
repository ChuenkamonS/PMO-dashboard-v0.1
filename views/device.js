// ─────────────────────────────────────────
// views/device.js — Device Registry + Purchase Orders
// ─────────────────────────────────────────

const DEVICE_KEY = 'orbit-pmo-devices-v1';
const DEV_PAGE_SIZE = 20;
let _devVisibleCount = DEV_PAGE_SIZE;
let _devCache = null;

// ══════════════════════════════════════════
// SUPABASE SYNC — Devices
// ══════════════════════════════════════════

function deviceToDb(d, isNew=false) {
  const row = {
    name:          d.name,
    brand:         d.brand || null,
    platform:      d.platform || 'other',
    type:          d.type || 'other',
    serial:        d.serial || null,
    asset_tag:     d.assetTag || null,
    owner:         d.owner || null,
    assigned_date: d.assignedDate || null,
    project:       d.project || null,
    company:       d.company || null,
    return_date:   d.returnDate || null,
    warranty:      d.warranty || null,
    condition:     d.condition || 'good',
    status:        d.status || 'available',
    memo_ref:      d.memoNo || null,    // use memoNo as single field name
    note:          d.note || null,
    source:        d.source || 'manual',
    updated_at:    d.updatedAt || new Date().toISOString(),
  };
  return row;
}

function dbToDevice(r) {
  return {
    id:           r.id,
    name:         r.name,
    brand:        r.brand || '',
    platform:     r.platform || 'other',
    type:         r.type || 'other',
    serial:       r.serial || '',
    assetTag:     r.asset_tag || '',
    owner:        r.owner || '',
    assignedDate: r.assigned_date || '',
    project:      r.project || '',
    company:      r.company || '',
    returnDate:   r.return_date || '',
    warranty:     r.warranty || '',
    condition:    r.condition || 'good',
    status:       r.status || 'available',
    memoNo:       r.memo_ref || '',   // canonical field name
    note:         r.note || '',
    source:       r.source || 'manual',
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
  };
}

async function loadDevicesAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('devices', 'GET', null, '?order=created_at.desc&limit=500');
      _devCache = (rows || []).map(dbToDevice);
      try { localStorage.setItem(DEVICE_KEY, JSON.stringify(_devCache)); } catch(e) {}
      return _devCache;
    } catch(e) { console.warn('Supabase devices read failed', e.message); }
  }
  return loadDevices();
}

async function saveDeviceAsync(data) {
  const all = loadDevices();
  const idx = all.findIndex(d => String(d.id) === String(data.id));
  if (idx >= 0) all[idx] = data; else all.push(data);
  storeDevices(all);
  _devCache = all;
  if (await checkSupa()) {
    try {
      const isNew = !data._supaId; // _supaId set after first insert
      if (isNew) {
        // Don't send id — devices table uses BIGINT GENERATED ALWAYS AS IDENTITY
        const row = deviceToDb(data);
        delete row.id;
        const result = await supaFetch('devices', 'POST', row, '?select=id');
        // Store the Supabase-generated id back
        if (result?.[0]?.id) {
          const allDevs = loadDevices();
          const i2 = allDevs.findIndex(d => String(d.id) === String(data.id));
          if (i2 >= 0) { allDevs[i2]._supaId = result[0].id; storeDevices(allDevs); }
        }
      } else {
        await supaFetch('devices', 'PATCH', deviceToDb(data), `?id=eq.${data._supaId}`);
      }
      _devCache = null;
    } catch(e) { console.warn('Supabase device save failed', e.message); }
  }
}

async function deleteDeviceAsync(id) {
  const device = loadDevices().find(d => String(d.id) === String(id));
  storeDevices(loadDevices().filter(d => String(d.id) !== String(id)));
  _devCache = null;
  if (await checkSupa()) {
    try {
      // devices table uses BIGINT id — use _supaId stored after INSERT
      const supaId = device?._supaId;
      if (supaId) await supaFetch('devices', 'DELETE', null, `?id=eq.${supaId}`);
    } catch(e) { console.warn('Supabase device delete failed', e.message); }
  }
}

function loadDevices() {
  if (_devCache !== null) return _devCache;
  try {
    const d = JSON.parse(localStorage.getItem(DEVICE_KEY) || '[]');
    if (Array.isArray(d)) {
      // Migrate: memoRef → memoNo
      d.forEach(dev => { if (dev.memoRef && !dev.memoNo) { dev.memoNo = dev.memoRef; delete dev.memoRef; } });
      // Remove auto-imported devices (source=memo, no serial, no _supaId)
      // These should only exist after markArrived — filter them out so registry is clean
      const cleaned = d.filter(dev => !(dev.source === 'memo' && !dev.serial && !dev._supaId && dev.note?.includes('Auto-imported')));
      if (cleaned.length !== d.length) {
        try { localStorage.setItem(DEVICE_KEY, JSON.stringify(cleaned)); } catch(e) {}
        return cleaned;
      }
    }
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
function storeDevices(devices) {
  _devCache = Array.isArray(devices) ? devices : [];
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(_devCache)); } catch(e) {}
}
function nextDeviceId() {
  return `dev_${Date.now()}`;
}

// ══════════════════════════════════════════
// SUPABASE SYNC — Purchase Orders
// ══════════════════════════════════════════
let _poCache = null;

function poToDb(po) {
  return {
    id:           po.id,
    memo_no:      po.memoNo,
    project:      po.project || null,
    item_name:    po.itemName,
    ordered_qty:  po.orderedQty || 1,
    arrived_qty:  po.arrivedQty || 0,
    status:       po.status || 'ordered',
    note:         po.note || null,
    updated_at:   po.updatedAt || new Date().toISOString(),
  };
}
function dbToPo(r) {
  return {
    id:          r.id,
    memoNo:      r.memo_no,
    project:     r.project || '',
    itemName:    r.item_name,
    orderedQty:  Number(r.ordered_qty) || 1,
    arrivedQty:  Number(r.arrived_qty) || 0,
    status:      r.status || 'ordered',
    note:        r.note || '',
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

async function loadPurchaseOrdersAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('purchase_orders', 'GET', null, '?order=created_at.desc');
      _poCache = (rows || []).map(dbToPo);
      return _poCache;
    } catch(e) { console.warn('Supabase PO read failed', e.message); }
  }
  return loadPurchaseOrders();
}

async function savePurchaseOrderAsync(po) {
  const all = loadPurchaseOrders();
  const idx = all.findIndex(p => p.id === po.id);
  if (idx >= 0) all[idx] = po; else all.push(po);
  storePurchaseOrders(all);
  _poCache = [...all]; // keep local cache updated
  if (await checkSupa()) {
    try {
      // Use PATCH to update existing PO, POST for new ones
      const existing = await supaFetch('purchase_orders', 'GET', null, `?id=eq.${encodeURIComponent(po.id)}&select=id`);
      if (existing && existing.length > 0) {
        await supaFetch('purchase_orders', 'PATCH', poToDb(po), `?id=eq.${encodeURIComponent(po.id)}`);
      } else {
        await supaFetch('purchase_orders', 'POST', poToDb(po), '');
      }
    } catch(e) { console.warn('Supabase PO save failed', e.message); }
  }
}

function loadPurchaseOrders() {
  if (_poCache !== null) return _poCache;
  try { return JSON.parse(localStorage.getItem('orbit-pmo-po-v1') || '[]'); } catch(e) { return []; }
}
function storePurchaseOrders(pos) {
  _poCache = pos;
  try { localStorage.setItem('orbit-pmo-po-v1', JSON.stringify(pos)); } catch(e) {}
}

// Auto-create purchase orders when HW memo is approved
// Called from updateMemoStatus in app.js when status = completed
function createPurchaseOrdersFromMemo(memo) {
  if (memo.type !== 'hw') return;
  const section = memo.sections?.find(s => s.title === 'รายการ Hardware');
  if (!section) return;
  const doc = new DOMParser().parseFromString(section.html, 'text/html');
  const existing = loadPurchaseOrders();
  doc.querySelectorAll('tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 4) return;
    const name = cells[1]?.textContent?.trim();
    const qty  = parseInt(cells[3]?.textContent) || 1;
    if (!name || name === '-') return;
    // Don't duplicate — check by both memoNo + itemName
    const isDup = existing.some(p => p.memoNo === memo.memoNo && p.itemName === name);
    if (isDup) return;
    const poId = `po_${memo.memoNo}_${name}`.replace(/[\s/\\]/g, '_');
    const po = {
      id:          poId,
      memoNo:      memo.memoNo,
      project:     memo.project || '',
      itemName:    name,
      orderedQty:  qty,
      arrivedQty:  0,
      status:      'ordered',
      note:        '',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };
    existing.push(po);
    // Save to Supabase only if not already there
    if (checkSupa) {
      checkSupa().then(async ok => {
        if (!ok) return;
        try {
          // Check if PO already exists in Supabase
          const existing_supa = await supaFetch('purchase_orders', 'GET', null, `?id=eq.${encodeURIComponent(poId)}&select=id`);
          if (existing_supa && existing_supa.length > 0) return; // already exists, skip
          await supaFetch('purchase_orders', 'POST', poToDb(po), '');
        } catch(e) { console.warn('PO save failed:', e.message); }
      });
    }
  });
  storePurchaseOrders(existing);
}

// Mark devices as arrived — creates device records and updates PO
async function markArrived(poId, qty, serialNumbers = []) {
  const pos = loadPurchaseOrders();
  const po = pos.find(p => p.id === poId);
  if (!po) return;
  const now = new Date().toISOString();
  const newArrived = Math.min(po.arrivedQty + qty, po.orderedQty);
  po.arrivedQty = newArrived;
  po.status = newArrived >= po.orderedQty ? 'fulfilled' : 'partial';
  po.updatedAt = now;
  storePurchaseOrders(pos);
  savePurchaseOrderAsync(po).catch(e => console.warn('PO update failed', e));

  // Create device record(s) — use timestamp + index to avoid id collision
  const batchTs = Date.now();
  for (let i = 0; i < qty; i++) {
    const serial = serialNumbers[i] || '';
    const device = {
      id:           `dev_${batchTs}_${i}`,
      name:         po.itemName,
      brand:        '',
      platform:     'other',
      type:         'mobile',
      serial,
      assetTag:     '',
      owner:        '',
      assignedDate: now.slice(0, 10),
      project:      po.project,
      company:      '',
      returnDate:   '',
      warranty:     '',
      condition:    'new',
      status:       'available',  // arrived but not yet assigned
      memoNo:       po.memoNo,
      note:         `Auto-created from ${po.memoNo} · ${po.itemName}`,
      source:       'memo',
      createdAt:    now,
      updatedAt:    now,
    };
    await saveDeviceAsync(device);
  }
  _devCache = null;
  renderDevice();
}

// ── Helpers ──
const PLATFORM_LABEL = { ios:'iOS', android:'Android', huawei:'Huawei', windows:'Windows', other:'Other' };
const TYPE_LABEL = { mobile:'Mobile', tablet:'Tablet', laptop:'Laptop', other:'Other' };

function deviceStatusBadge(status) {
  return { 'in-use':{ label:'In Use', cls:'badge-blue' }, 'available':{ label:'Available', cls:'badge-green' }, 'maintenance':{ label:'Maintenance', cls:'badge-amber' }, 'retired':{ label:'Retired', cls:'badge-gray' } }[status] || { label:status, cls:'badge-gray' };
}
function deviceConditionBadge(condition) {
  return { 'new':{ label:'New', cls:'badge-green' }, 'good':{ label:'Good', cls:'badge-blue' }, 'fair':{ label:'Fair', cls:'badge-amber' }, 'poor':{ label:'Poor', cls:'badge-red' } }[condition] || { label:condition, cls:'badge-gray' };
}
function warrantyStatus(warrantyDate) {
  if(!warrantyDate) return null;
  const days = Math.floor((new Date(warrantyDate) - new Date()) / 86400000);
  if(days < 0)   return { label:'หมดอายุแล้ว', cls:'badge-red' };
  if(days <= 30) return { label:`อีก ${days}d`, cls:'badge-amber' };
  return { label: shortDate(warrantyDate), cls:'badge-green' };
}

// ── Auto-sync from HW Memos (legacy — for memos approved before PO system) ──
function syncFromHWMemos() {
  const hwMemos = loadMemos().filter(m => m.type === 'hw' && m.status === 'completed');
  const devices = loadDevices();
  let added = 0;
  hwMemos.forEach(memo => {
    const section = memo.sections?.find(s => s.title === 'รายการ Hardware');
    if(!section) return;
    const doc = new DOMParser().parseFromString(section.html, 'text/html');
    doc.querySelectorAll('tbody tr').forEach(row => {
      const cells = row.querySelectorAll('td');
      if(cells.length < 2) return;
      const name = cells[1]?.textContent?.trim();
      if(!name || name === '-') return;
      // Check using memoNo (canonical field)
      if(devices.some(d => d.memoNo === memo.memoNo && d.name === name)) return;
      devices.push({
        id: nextDeviceId() + '_' + added,
        name,
        platform: 'other', type: 'other', brand: '', serial: '', assetTag: '',
        owner: '', assignedDate: memo.approvedAt?.slice(0,10) || '',
        project: memo.project || '', returnDate: '', warranty: '', condition: 'good',
        status: 'available',  // arrived but not yet assigned to anyone
        company: '',
        memoNo: memo.memoNo,  // use memoNo, not memoRef
        note: `Auto-imported from ${memo.memoNo}`,
        source: 'memo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      added++;
    });
  });
  if(added > 0) {
    storeDevices(devices);
    // Sync new devices to Supabase
    devices.slice(-added).forEach(d => saveDeviceAsync(d).catch(e => console.warn('sync failed', e)));
  }
}

// ── Summary tables ──
function renderDeviceSummaries(devices) {
  // Table 1: Platform × Type
  const platforms = ['ios','android','huawei','windows','other'];
  const types = ['mobile','tablet','other'];
  const platMap = {};
  devices.forEach(d => {
    const p = d.platform||'other';
    const t = d.type||'other';
    if(!platMap[p]) platMap[p] = { mobile:0, tablet:0, other:0, total:0 };
    const bucket = types.includes(t) ? t : 'other';
    platMap[p][bucket]++;
    platMap[p].total++;
  });

  const platBody = document.getElementById('dev-summary-platform-body');
  if(platBody) {
    const rows = Object.entries(platMap).sort((a,b) => b[1].total - a[1].total);
    const grandTotal = { mobile:0, tablet:0, other:0, total:0 };
    rows.forEach(([,d]) => { grandTotal.mobile+=d.mobile; grandTotal.tablet+=d.tablet; grandTotal.other+=d.other; grandTotal.total+=d.total; });
    platBody.innerHTML = rows.map(([p, d]) =>
      `<tr>
        <td style="padding-left:16px;font-weight:500">${esc(PLATFORM_LABEL[p]||p)}</td>
        <td>${d.mobile||'—'}</td>
        <td>${d.tablet||'—'}</td>
        <td>${d.other||'—'}</td>
        <td style="text-align:right;padding-right:16px;font-weight:600">${d.total}</td>
      </tr>`
    ).join('') + `<tr style="background:var(--blue-50);border-top:1.5px solid var(--blue-100);font-weight:600;font-size:12px">
        <td style="padding-left:16px;color:var(--blue-800)">Total</td>
        <td style="color:var(--blue-800)">${grandTotal.mobile}</td><td style="color:var(--blue-800)">${grandTotal.tablet}</td><td style="color:var(--blue-800)">${grandTotal.other}</td>
        <td style="text-align:right;padding-right:16px;color:var(--blue-800)">${grandTotal.total}</td>
      </tr>`;
  }

  // Table 2: By Project
  const projMap = {};
  devices.forEach(d => {
    const p = d.project||'ไม่ระบุ';
    if(!projMap[p]) projMap[p] = { 'in-use':0, available:0, other:0, total:0 };
    const s = d.status||'other';
    const bucket = s==='in-use' ? 'in-use' : s==='available' ? 'available' : 'other';
    projMap[p][bucket]++;
    projMap[p].total++;
  });

  const projBody = document.getElementById('dev-summary-project-body');
  if(projBody) {
    const rows = Object.entries(projMap).sort((a,b) => b[1].total - a[1].total);
    projBody.innerHTML = rows.map(([p, d]) =>
      `<tr>
        <td style="padding-left:16px;font-weight:500">${esc(p)}</td>
        <td>${d['in-use']||'—'}</td>
        <td>${d.available||'—'}</td>
        <td>${d.other||'—'}</td>
        <td style="text-align:right;padding-right:16px;font-weight:600">${d.total}</td>
      </tr>`
    ).join('');
  }
}

// ── Main render ──
function renderDevice() {
  // Load fresh from Supabase then render
  loadDevicesAsync().then(() => _renderDeviceTable()).catch(() => _renderDeviceTable());
}

function _renderDeviceTable() {
  // Note: syncFromHWMemos removed — devices only created via markArrived()

  const allDevices = loadDevices();

  // Metrics (unfiltered)
  const total    = allDevices.length;
  const inUse    = allDevices.filter(d => d.status==='in-use').length;
  const available= allDevices.filter(d => d.status==='available').length;
  const wExp     = allDevices.filter(d => d.warranty && new Date(d.warranty) < new Date()).length;
  document.getElementById('dev-total').textContent           = total;
  document.getElementById('dev-total-sub').textContent       = total ? `${inUse} in use` : '';
  document.getElementById('dev-inuse').textContent           = inUse;
  document.getElementById('dev-available').textContent       = available;
  document.getElementById('dev-warranty-expired').textContent= wExp;

  // Summary tables (unfiltered)
  renderDeviceSummaries(allDevices);

  // Filters
  const search     = (document.getElementById('dev-search')?.value||'').toLowerCase();
  const platFilter = val('#dev-filter-platform') || 'all';
  const typeFilter = val('#dev-filter-type')     || 'all';
  const statFilter = val('#dev-filter-status')   || 'all';
  const projFilter = val('#dev-filter-project')  || 'all';
  const compFilter = val('#dev-filter-company')  || 'all';

  let devices = allDevices;
  if(platFilter !== 'all') devices = devices.filter(d => (d.platform||'other') === platFilter);
  if(typeFilter !== 'all') devices = devices.filter(d => (d.type||'other') === typeFilter);
  if(statFilter !== 'all') devices = devices.filter(d => d.status === statFilter);
  if(projFilter !== 'all') devices = devices.filter(d => d.project === projFilter);
  if(compFilter !== 'all') devices = devices.filter(d => d.company === compFilter);
  if(search) devices = devices.filter(d => [
    d.name, d.brand, d.serial, d.assetTag, d.assetAcc, d.pbxNumber,
    d.owner, d.position, d.project, d.company, d.osVersion,
    d.qaOwner, d.note, d.memoRef, d.type, d.platform,
    PLATFORM_LABEL[d.platform||'other'], TYPE_LABEL[d.type||'other']
  ].some(v => v && String(v).toLowerCase().includes(search)));

  const tbody = document.getElementById('dev-table-body');
  if(!devices.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:34px 16px;color:var(--text-3)">ยังไม่มีอุปกรณ์${search?' ที่ตรงกับการค้นหา':''} — กด Add Device หรือ Import Excel</td></tr>`;
    return;
  }

  // Reset visible count when filters change
  const filterKey = JSON.stringify({search, platFilter, typeFilter, statFilter, projFilter, compFilter});
  if(typeof _devLastFilter !== 'undefined' && _devLastFilter !== filterKey) _devVisibleCount = DEV_PAGE_SIZE;
  window._devLastFilter = filterKey;

  const visibleDevices = devices.slice(0, _devVisibleCount);
  const remaining = devices.length - _devVisibleCount;

  tbody.innerHTML = visibleDevices.map(d => {
    const statusB = deviceStatusBadge(d.status);
    const platLbl = PLATFORM_LABEL[d.platform||'other'] || d.platform || '—';
    const typeLbl = TYPE_LABEL[d.type||'other'] || d.type || '—';
    const updDate = d.updatedAt ? shortDate(d.updatedAt) : (d.assignedDate ? shortDate(d.assignedDate) : '—');
    return `<tr style="cursor:pointer" onclick="openDeviceDetail(${d.id})">
      <td style="padding-left:16px;font-weight:500">
        ${esc(d.name)}
        ${d.brand?`<div style="font-size:10px;color:var(--text-3);font-weight:400">${esc(d.brand)}</div>`:''}
      </td>
      <td style="font-size:12px">${esc(platLbl)}</td>
      <td style="font-size:12px">${esc(typeLbl)}</td>
      <td style="font-family:monospace;font-size:11px">${esc(d.assetTag||'—')}</td>
      <td style="font-family:monospace;font-size:11px">${esc(d.serial||'—')}</td>
      <td style="font-size:12px">
        ${esc(d.owner||'—')}
        ${d.position?`<div style="font-size:10px;color:var(--text-3)">${esc(d.position)}</div>`:''}
      </td>
      <td style="font-size:12px">${esc(d.project||'—')}</td>
      <td style="text-align:center"><span class="badge ${statusB.cls}" style="font-size:10px">${esc(statusB.label)}</span></td>
      <td style="font-size:11px;color:var(--text-3)">${updDate}</td>
      <td style="text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
        <button class="btn-sm" onclick="event.stopPropagation();openDeviceModal(${d.id})" style="padding:3px 7px;font-size:11px">✎</button>
        <button class="btn-sm" onclick="event.stopPropagation();deleteDevice(${d.id})" style="padding:3px 7px;font-size:11px;color:var(--red)">✕</button>
      </td>
    </tr>`;
  }).join('');

  tbody.onclick = function(e) {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const id = Number(btn.dataset.id);
    if(btn.dataset.action==='edit')   openDeviceModal(id);
    if(btn.dataset.action==='delete') deleteDevice(id);
  };

  // Load more footer
  const footer = document.getElementById('dev-load-more-footer');
  if(footer) {
    if(remaining > 0) {
      footer.style.display = '';
      footer.innerHTML = `
        <div style="padding:12px 14px;border-top:1px solid var(--border);text-align:center;background:var(--bg)">
          <button class="btn-sm" onclick="devLoadMore()" style="font-size:12px;padding:6px 20px">
            + Load ${Math.min(remaining, DEV_PAGE_SIZE)} more
          </button>
          <div style="font-size:11px;color:var(--text-3);margin-top:5px">แสดงอยู่ ${visibleDevices.length} จาก ${devices.length} รายการ</div>
        </div>`;
    } else {
      footer.style.display = devices.length > DEV_PAGE_SIZE ? '' : 'none';
      if(devices.length > DEV_PAGE_SIZE) {
        footer.innerHTML = `<div style="padding:10px 14px;border-top:1px solid var(--border);text-align:center;background:var(--bg);font-size:11px;color:var(--text-3)">แสดงครบทั้งหมด ${devices.length} รายการ</div>`;
      }
    }
  }
}

function devLoadMore() {
  _devVisibleCount += DEV_PAGE_SIZE;
  renderDevice();
}

// ── Modal ──
function openDeviceModal(id) {
  document.getElementById('device-modal').style.display = 'flex';
  const setVal = (elId, v) => { const el=document.getElementById(elId); if(el) el.value=v||''; };

  if(id) {
    const d = loadDevices().find(dev => dev.id === id);
    if(!d) return;
    document.getElementById('dev-modal-title').textContent = 'Edit Device';
    document.getElementById('dev-edit-id').value = id;
    setVal('dev-name', d.name);        setVal('dev-brand', d.brand);
    setVal('dev-platform', d.platform||'other'); setVal('dev-type', d.type||'mobile');
    setVal('dev-asset', d.assetTag);   setVal('dev-serial', d.serial);
    setVal('dev-asset-acc', d.assetAcc); setVal('dev-qty', d.qty||1);
    setVal('dev-os-version', d.osVersion);
    setVal('dev-company', d.company);  setVal('dev-project', d.project);
    setVal('dev-owner', d.owner);      setVal('dev-position', d.position);
    setVal('dev-assigned-date', d.assignedDate);
    setVal('dev-return-date', d.returnDate); setVal('dev-memo-ref', d.memoRef);
    setVal('dev-warranty', d.warranty); setVal('dev-condition', d.condition||'good');
    setVal('dev-status', d.status||'in-use'); setVal('dev-note', d.note);
    setVal('dev-qa-owner', d.qaOwner);
    // Load photo preview
    const prevImg = document.getElementById('dev-photo-preview');
    if(prevImg) { prevImg.src = d.photo||''; prevImg.style.display = d.photo ? 'block' : 'none'; }
  } else {
    document.getElementById('dev-modal-title').textContent = 'Add Device';
    document.getElementById('dev-edit-id').value = '';
    ['dev-name','dev-brand','dev-asset','dev-serial','dev-owner','dev-return-date',
     'dev-warranty','dev-memo-ref','dev-note'].forEach(id => setVal(id,''));
    setVal('dev-platform','ios'); setVal('dev-type','mobile');
    setVal('dev-company',''); setVal('dev-project','');
    setVal('dev-condition','good'); setVal('dev-status','in-use');
    setVal('dev-assigned-date', new Date().toISOString().slice(0,10));
  }
}
function closeDeviceModal() { document.getElementById('device-modal').style.display='none'; }

function saveDevice() {
  const name = document.getElementById('dev-name').value.trim();
  if(!name) { alert('กรุณากรอก Device Name'); return; }
  const editId = document.getElementById('dev-edit-id').value;
  const devices = loadDevices();
  const now = new Date().toISOString();
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const photoInput = document.getElementById('dev-photo-input');
  let photoData = null;
  if(photoInput?.files?.length) {
    // Read photo as base64
    try {
      const file = photoInput.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        const editId2 = document.getElementById('dev-edit-id').value;
        const devices2 = loadDevices();
        const idx2 = editId2 ? devices2.findIndex(d => d.id === Number(editId2)) : -1;
        if(idx2 >= 0) { devices2[idx2].photo = ev.target.result; storeDevices(devices2); }
      };
      reader.readAsDataURL(file);
    } catch(e) {}
  }

  const data = {
    name,
    brand:        g('dev-brand'),
    platform:     g('dev-platform') || 'other',
    type:         g('dev-type') || 'mobile',
    assetTag:     g('dev-asset'),
    assetAcc:     g('dev-asset-acc'),
    serial:       g('dev-serial'),
    qty:          Number(g('dev-qty'))||1,
    osVersion:    g('dev-os-version'),
    company:      g('dev-company'),
    project:      g('dev-project'),
    owner:        g('dev-owner'),
    position:     g('dev-position'),
    assignedDate: g('dev-assigned-date'),
    returnDate:   g('dev-return-date'),
    memoNo:       g('dev-memo-ref'),
    warranty:     g('dev-warranty'),
    condition:    g('dev-condition') || 'good',
    status:       g('dev-status') || 'available',
    note:         g('dev-note'),
    updatedAt:    now,
    source:       'manual',
  };
  if(editId) {
    const allDevs = loadDevices();
    const idx = allDevs.findIndex(d => String(d.id) === String(editId));
    const orig = idx >= 0 ? allDevs[idx] : {};
    const updated = { ...orig, ...data, id: editId };
    saveDeviceAsync(updated).catch(e => console.warn('Device save failed', e));
  } else {
    const allDevs = loadDevices();
    const dupIdx = findExistingDevice(allDevs, data);
    if(dupIdx >= 0) {
      const dup = allDevs[dupIdx];
      const matchField = (data.assetTag && data.assetTag === dup.assetTag) ? `Asset: ${data.assetTag}` : `Serial: ${data.serial}`;
      if(!confirm(`พบอุปกรณ์ซ้ำ (${matchField})\nอัปเดตข้อมูลอันเดิมแทน?`)) return;
      saveDeviceAsync({ ...dup, ...data }).catch(e => console.warn('Device save failed', e));
    } else {
      saveDeviceAsync({ id: nextDeviceId(), ...data, createdAt: now }).catch(e => console.warn('Device save failed', e));
    }
  }
  closeDeviceModal();
  renderDevice();
}

function deleteDevice(id) {
  const d = loadDevices().find(dev => String(dev.id) === String(id));
  if(!d) return;
  if(!confirm(`ลบ "${d.name}" ออกจากระบบ?`)) return;
  deleteDeviceAsync(id).catch(e => console.warn('Delete failed', e));
  renderDevice();
}

// ── Export CSV ──
function exportDeviceCsv() {
  const devices = loadDevices();
  if(!devices.length) { alert('ไม่มีข้อมูลสำหรับ Export'); return; }
  const headers = ['PBX Number','OS','Type','Brand / Model','QTY','Asset IT','Asset ACC','Serial','Assignee','Position','Project','Received date','QA Owner','Updated Date','Remark','OS version','Status','Condition','Warranty','Memo Ref'];
  const rows = devices.map(d => [
    d.pbxNumber||'',
    PLATFORM_LABEL[d.platform||'other']||d.platform||'',
    TYPE_LABEL[d.type||'other']||d.type||'',
    d.name||'',
    d.qty||1,
    d.assetTag||'',
    d.assetAcc||'',
    d.serial||'',
    d.owner||'',
    d.position||'',
    d.project||'',
    d.assignedDate||'',
    d.qaOwner||'',
    d.updatedAt ? d.updatedAt.slice(0,10) : '',
    d.note||'',
    d.osVersion||'',
    d.status||'',
    d.condition||'',
    d.warranty||'',
    d.memoRef||''
  ]);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url;
  a.download = `devices-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

document.addEventListener('click', e => {
  if(e.target === document.getElementById('device-modal')) closeDeviceModal();
});

// ── Device Detail Panel ──
function openDeviceDetail(id) {
  const d = loadDevices().find(dev => dev.id === id);
  if(!d) return;
  const platLbl = PLATFORM_LABEL[d.platform||'other'] || d.platform || '—';
  const typeLbl = TYPE_LABEL[d.type||'other'] || d.type || '—';
  const statusB = deviceStatusBadge(d.status);
  const condB   = deviceConditionBadge(d.condition);
  const typeIcon = { mobile:'📱', tablet:'📟', laptop:'💻', other:'🖥' }[d.type||'other'] || '🖥';

  let panel = document.getElementById('dev-detail-modal');
  if(!panel) {
    panel = document.createElement('div');
    panel.id = 'dev-detail-modal';
    panel.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:200;align-items:center;justify-content:center';
    panel.onclick = e => { if(e.target === panel) panel.style.display='none'; };
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--r);width:min(680px,95vw);max-height:85vh;overflow-y:auto;padding:20px 22px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:42px;height:42px;border-radius:var(--r-sm);background:var(--blue-50);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${typeIcon}</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--text)">${esc(d.name)}</div>
          <div style="font-size:11px;color:var(--text-3)">${esc(d.brand||'')} · ${esc(platLbl)} · ${esc(typeLbl)}</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <span class="badge ${statusB.cls}" style="font-size:10px">${esc(statusB.label)}</span>
        <span class="badge ${condB.cls}" style="font-size:10px">${esc(condB.label)}</span>
        <button class="btn-sm" onclick="openDeviceModal(${id})" style="font-size:11px;padding:3px 8px">✎ Edit</button>
        <button class="btn-sm" onclick="document.getElementById('dev-detail-modal').style.display='none'" style="font-size:11px;padding:3px 8px">✕</button>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:14px">

      <div>
        <div style="font-size:9px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Device info</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${infoCell('OS', platLbl)}
          ${infoCell('OS version', d.osVersion||'—')}
          ${infoCell('Type', typeLbl)}
          ${infoCell('Serial no.', d.serial||'—')}
          ${infoCell('Asset IT', d.assetTag||'—')}
          ${infoCell('Asset ACC', d.assetAcc||'—')}
          ${infoCell('QTY', d.qty||1)}
          ${infoCell('Warranty', d.warranty ? shortDate(d.warranty) : '—')}
          ${infoCell('Condition', condB.label)}
        </div>
      </div>

      <div>
        <div style="font-size:9px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Assignment</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
          ${infoCell('Assignee', d.owner||'—')}
          ${infoCell('Position', d.position||'—')}
          ${infoCell('Project', d.project||'—')}
          ${infoCell('Received date', d.assignedDate ? shortDate(d.assignedDate) : '—')}
          ${infoCell('QA Owner', d.qaOwner||'—')}
          ${infoCell('Updated', d.updatedAt ? shortDate(d.updatedAt) : '—')}
        </div>
      </div>

      ${d.note ? `<div>
        <div style="font-size:9px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Remark</div>
        <div style="background:var(--bg);border-radius:var(--r-sm);padding:8px 12px;font-size:12px;color:var(--text-2)">${esc(d.note)}</div>
      </div>` : ''}

      <div>
        <div style="font-size:9px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Device photo</div>
        <div style="display:flex;gap:10px;align-items:flex-start">
          ${d.photo
            ? `<img src="${d.photo}" style="width:80px;height:80px;border-radius:var(--r-sm);object-fit:cover;border:1px solid var(--border);cursor:pointer" onclick="window.open('${d.photo}')" title="คลิกเพื่อดูขนาดเต็ม">`
            : `<div style="width:80px;height:80px;border-radius:var(--r-sm);border:1px dashed var(--border-md);background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:11px">No photo</div>`}
          <div>
            <label style="cursor:pointer">
              <input type="file" accept="image/*" style="display:none" onchange="uploadDevicePhoto(${id}, this)">
              <span class="btn-sm" style="font-size:11px;padding:4px 10px;display:inline-block">📷 Upload photo</span>
            </label>
            <div style="font-size:10px;color:var(--text-3);margin-top:4px">JPG, PNG · max 5MB<br>Photo replaces previous</div>
          </div>
        </div>
      </div>

    </div>
    </div>`;
  panel.style.display = 'flex';
}

function infoCell(label, value) {
  return `<div style="background:var(--bg);border-radius:var(--r-sm);padding:8px 10px">
    <div style="font-size:9px;color:var(--text-3);margin-bottom:2px">${esc(String(label))}</div>
    <div style="font-size:12px;color:var(--text);font-weight:500">${esc(String(value))}</div>
  </div>`;
}

function uploadDevicePhoto(id, input) {
  if(!input.files?.length) return;
  const file = input.files[0];
  if(file.size > 5 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 5MB'); return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const devices = loadDevices();
    const idx = devices.findIndex(d => d.id === id);
    if(idx >= 0) {
      devices[idx].photo = ev.target.result;
      devices[idx].updatedAt = new Date().toISOString();
      storeDevices(devices);
      openDeviceDetail(id);
      renderDevice();
    }
  };
  reader.readAsDataURL(file);
}

// ══════════════════════════════════════════
// PURCHASE ORDERS TAB
// ══════════════════════════════════════════

function switchDevTab(tab, btn) {
  document.querySelectorAll('.dev-tab-btn').forEach(b => {
    const on = b === btn;
    b.style.borderBottomColor = on ? '#185FA5' : 'transparent';
    b.style.color = on ? '#185FA5' : 'var(--text-2)';
    b.style.fontWeight = on ? '500' : '400';
  });
  document.getElementById('dev-panel-registry').style.display = tab === 'registry' ? '' : 'none';
  document.getElementById('dev-panel-orders').style.display   = tab === 'orders'   ? '' : 'none';
  if (tab === 'orders') renderPurchaseOrders();
}

function renderPurchaseOrders() {
  loadPurchaseOrdersAsync().then(() => _renderPOTable()).catch(() => _renderPOTable());
}

function _renderPOTable() {
  const pos = loadPurchaseOrders();

  // KPIs
  const active    = pos.filter(p => p.status !== 'fulfilled').length;
  const awaiting  = pos.filter(p => p.status === 'ordered').reduce((s, p) => s + p.orderedQty, 0);
  const partial   = pos.filter(p => p.status === 'partial').length;
  const fulfilled = pos.filter(p => p.status === 'fulfilled').length;
  const setText = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setText('po-kpi-active', active);
  setText('po-kpi-awaiting', awaiting);
  setText('po-kpi-partial', partial);
  setText('po-kpi-fulfilled', fulfilled);

  // Badge on tab
  const badge = document.getElementById('dev-po-badge');
  if (badge) { badge.textContent = active > 0 ? active : ''; badge.style.display = active > 0 ? '' : 'none'; }

  const tbody = document.getElementById('po-table-body');
  if (!tbody) return;

  if (!pos.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:34px;color:var(--text-3)">ยังไม่มี Purchase Order — Approve HW Memo เพื่อสร้างอัตโนมัติ</td></tr>`;
    return;
  }

  const statusBadge = s => ({
    ordered:   `<span style="font-size:10px;background:#E6F1FB;color:#0C447C;padding:2px 8px;border-radius:100px">Ordered</span>`,
    partial:   `<span style="font-size:10px;background:#FAEEDA;color:#633806;padding:2px 8px;border-radius:100px">Partially arrived</span>`,
    fulfilled: `<span style="font-size:10px;background:#EAF3DE;color:#27500A;padding:2px 8px;border-radius:100px">Fulfilled</span>`,
  }[s] || `<span style="font-size:10px;background:#F1EFE8;color:#444441;padding:2px 8px;border-radius:100px">${esc(s)}</span>`);

  tbody.innerHTML = pos.map(po => {
    const pct  = po.orderedQty > 0 ? Math.round(po.arrivedQty / po.orderedQty * 100) : 0;
    const canAct = po.status !== 'fulfilled';
    return `<tr>
      <td style="color:#185FA5;font-weight:500;cursor:pointer;padding:9px 12px" onclick="openHistoryDetail && openHistoryDetail('${esc(po.memoNo)}')">${esc(po.memoNo)}</td>
      <td style="padding:9px 12px;font-size:12px">${esc(po.itemName)}</td>
      <td style="padding:9px 12px;font-size:12px">${esc(po.project || '—')}</td>
      <td style="padding:9px 12px;text-align:center;font-size:12px">${po.orderedQty}</td>
      <td style="padding:9px 12px;text-align:center;font-size:12px;font-weight:500;color:${po.arrivedQty > 0 ? '#3B6D11' : 'var(--text-3)'}">${po.arrivedQty}</td>
      <td style="padding:9px 12px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${pct>=100?'#3B6D11':'#185FA5'};border-radius:3px"></div>
          </div>
          <span style="font-size:10px;color:var(--text-3)">${po.arrivedQty}/${po.orderedQty}</span>
        </div>
      </td>
      <td style="padding:9px 12px">${statusBadge(po.status)}</td>
      <td style="padding:9px 12px;white-space:nowrap">
        ${canAct ? `<button class="btn-sm" style="font-size:11px" onclick="openMarkArrivedModal('${esc(po.id)}')">+ Mark arrived</button>` : `<button class="btn-sm" style="font-size:11px" onclick="switchDevTab('registry',document.getElementById('dev-tbtn-registry'))">View devices</button>`}
      </td>
    </tr>`;
  }).join('');
}

// ── Mark Arrived Modal ──
function openMarkArrivedModal(poId) {
  const po = loadPurchaseOrders().find(p => p.id === poId);
  if (!po) return;
  document.getElementById('mark-arrived-po-id').value = poId;
  document.getElementById('mark-arrived-subtitle').textContent =
    `${po.itemName} · ${po.arrivedQty}/${po.orderedQty} มาถึงแล้ว · remaining: ${po.orderedQty - po.arrivedQty}`;
  document.getElementById('mark-arrived-qty').value = po.orderedQty - po.arrivedQty;
  document.getElementById('mark-arrived-qty').max   = po.orderedQty - po.arrivedQty;
  document.getElementById('mark-arrived-serials').value = '';
  document.getElementById('mark-arrived-modal').style.display = 'flex';
}
function closeMarkArrivedModal() { document.getElementById('mark-arrived-modal').style.display = 'none'; }

function submitMarkArrived() {
  const poId    = document.getElementById('mark-arrived-po-id').value;
  const qty     = parseInt(document.getElementById('mark-arrived-qty').value) || 0;
  const serialsRaw = document.getElementById('mark-arrived-serials').value;
  const serials = serialsRaw.split('\n').map(s => s.trim()).filter(Boolean);
  if (!qty || qty < 1) { alert('กรุณากรอกจำนวนที่มาถึง'); return; }
  closeMarkArrivedModal();
  markArrived(poId, qty, serials).then(() => {
    // Render from local cache immediately — don't re-fetch from Supabase
    // (async save is in-flight but local state is already updated)
    _poCache = null; // clear cache so loadPurchaseOrders reads fresh localStorage
    _devCache = null;
    _renderPOTable();
    _renderDeviceTable();
  });
}

document.addEventListener('click', e => {
  if (e.target === document.getElementById('mark-arrived-modal')) closeMarkArrivedModal();
});
