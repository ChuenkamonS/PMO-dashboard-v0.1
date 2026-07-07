// ─────────────────────────────────────────
// views/device.js — Device Registry + Purchase Orders
// ─────────────────────────────────────────

const DEVICE_KEY = 'orbit-pmo-devices-v1';
const DEV_PAGE_SIZE = 20;
let _devVisibleCount = DEV_PAGE_SIZE;
let _devCache = null;

// Device Management D2 — cross-tab deep-link context. Never persisted; purely
// in-memory display state, mirroring views/license.js's _licUsrDeepLinkFilter
// pattern. _devDeepLinkFilter narrows Device Registry (by PO id, via
// viewDevicesForPO(), or by memoNo, via viewDevicesForMemo()).
// _poDeepLinkFilter narrows Purchase Orders by memoNo (viewPurchaseOrdersForMemo()).
let _devDeepLinkFilter = null; // { poId?, memoNo, itemName?, source: 'po'|'memo' } | null
let _poDeepLinkFilter = null;  // { memoNo } | null

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
    pbx_number:    d.pbxNumber || null,
    owner:         d.owner || null,
    position:      d.position || null,
    assigned_date: d.assignedDate || null,
    project:       d.project || null,
    company:       d.company || null,
    return_date:   d.returnDate || null,
    warranty:      d.warranty || null,
    qa_owner:      d.qaOwner || null,
    os_version:    d.osVersion || null,
    photo_url:     d.photoUrl || null,
    status:        d.status || 'not_identified',
    memo_ref:      d.memoNo || null,    // use memoNo as single field name
    note:          d.note || null,
    source:        d.source || 'manual',
    created_at:    d.createdAt || new Date().toISOString(),
    updated_at:    d.updatedAt || new Date().toISOString(),
    // Milestone 2 Task 2.3 — Created By / Updated By metadata.
    created_by:    d.createdBy || null,
    updated_by:    d.updatedBy || null,
    // Milestone 3B — Device Registry soft delete + audit log.
    deleted:       d.deleted || false,
    deleted_at:    d.deletedAt || null,
    deleted_by:    d.deletedBy || null,
    audit_log:     d.auditLog || [],
  };
  return row;
}

function dbToDevice(r) {
  return {
    id:           r.id,
    _supaId:      r.id,
    name:         r.name,
    brand:        r.brand || '',
    platform:     r.platform || 'other',
    type:         r.type || 'other',
    serial:       r.serial || '',
    assetTag:     r.asset_tag || '',
    pbxNumber:    r.pbx_number || '',
    owner:        r.owner || '',
    position:     r.position || '',
    assignedDate: r.assigned_date || '',
    project:      r.project || '',
    company:      r.company || '',
    returnDate:   r.return_date || '',
    warranty:     r.warranty || '',
    qaOwner:      r.qa_owner || '',
    osVersion:    r.os_version || '',
    photoUrl:     r.photo_url || '',
    status:       r.status || 'not_identified',
    memoNo:       r.memo_ref || '',   // canonical field name
    note:         r.note || '',
    source:       r.source || 'manual',
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
    // Milestone 2 Task 2.3 — Created By / Updated By metadata.
    createdBy:    r.created_by || null,
    updatedBy:    r.updated_by || null,
    // Milestone 3B — Device Registry soft delete + audit log.
    deleted:      r.deleted || false,
    deletedAt:    r.deleted_at || null,
    deletedBy:    r.deleted_by || null,
    auditLog:     r.audit_log || [],
  };
}

// Milestone 3B — schema-cache-lag fallback for the new `audit_log` column on
// `devices`/`purchase_orders`, mirroring views/budget.js's
// isMissingAuditLogColumnError() for budget_manual_expenses. Scoped locally
// to this file (not shared with budget.js) so views/device.js stays
// self-contained — the detection logic itself is identical.
function isMissingDeviceAuditColumnError(error) {
  const detail = `${error?.code || ''} ${error?.message || error || ''}`.toLowerCase();
  return detail.includes('pgrst204')
    && detail.includes('audit_log')
    && (detail.includes('column') || detail.includes('schema cache'));
}

// Milestone 3B — Device/PO audit log. Mirrors app.js's appendAuditLog() shape
// (actor/action/comment/timestamp, optional statusBefore/statusAfter) but
// operates on a single device/PO record in place, since neither table has a
// status-transition helper like updateMemoStatusAsync().
function appendDeviceAuditLog(record, action, extra = {}) {
  if (!record.auditLog) record.auditLog = [];
  record.auditLog.push({
    action,
    actor: currentUser(),
    timestamp: new Date().toISOString(),
    comment: extra.comment || '',
    statusBefore: extra.statusBefore || null,
    statusAfter: extra.statusAfter || null,
  });
  return record;
}

// Milestone 3B — Device Registry soft delete. loadDevices()/loadDevicesAsync()
// filter out `deleted:true` rows (the single shared read path, mirroring
// app.js's _excludeDeletedMemos()). Internal read-modify-write paths that
// persist the *entire* local cache/localStorage array (saveDeviceAsync,
// deleteDeviceAsync, markArrived, importDeviceBulk) must read the raw,
// unfiltered list first — otherwise storeDevices() would overwrite the whole
// array and silently drop any already soft-deleted row, the same risk shape
// documented for memos in docs/TECHNICAL_DEBT.md TD-M1-03 item 2.
function _excludeDeletedDevices(devices) {
  return (devices || []).filter(d => !d.deleted);
}
function _loadDevicesRaw() {
  if (_devCache !== null && _devCache.length > 0) return _devCache;
  try {
    const d = JSON.parse(localStorage.getItem(DEVICE_KEY) || '[]');
    if (Array.isArray(d)) {
      d.forEach(dev => { if (dev.memoRef && !dev.memoNo) { dev.memoNo = dev.memoRef; delete dev.memoRef; } });
    }
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}

async function loadDevicesAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('devices', 'GET', null, '?order=created_at.desc&limit=500');
      _devCache = (rows || []).map(dbToDevice);
      return _excludeDeletedDevices(_devCache);
    } catch(e) {
      console.warn('Supabase devices read failed', e.message);
      if (_devCache) return _excludeDeletedDevices(_devCache);
    }
  }
  // Offline fallback
  try { const d = JSON.parse(localStorage.getItem(DEVICE_KEY)||'[]'); return _excludeDeletedDevices(Array.isArray(d)?d:[]); } catch(e) { return []; }
}

async function saveDeviceAsync(data) {
  const all = _loadDevicesRaw();
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
        let result;
        try {
          result = await supaFetch('devices', 'POST', row, '?select=id');
        } catch(e) {
          if (!isMissingDeviceAuditColumnError(e)) throw e;
          const compatibleRow = { ...row };
          delete compatibleRow.audit_log;
          result = await supaFetch('devices', 'POST', compatibleRow, '?select=id');
        }
        // Store the Supabase-generated id back in cache
        if (result?.[0]?.id) {
          data._supaId = result[0].id;
          if (_devCache) {
            const i2 = _devCache.findIndex(d => String(d.id) === String(data.id));
            if (i2 >= 0) _devCache[i2]._supaId = result[0].id;
          }
          storeDevices(_devCache || all);
        }
      } else {
        const patch = deviceToDb(data);
        try {
          await supaFetch('devices', 'PATCH', patch, `?id=eq.${data._supaId}`);
        } catch(e) {
          if (!isMissingDeviceAuditColumnError(e)) throw e;
          const compatiblePatch = { ...patch };
          delete compatiblePatch.audit_log;
          await supaFetch('devices', 'PATCH', compatiblePatch, `?id=eq.${data._supaId}`);
        }
      }
      // do NOT null cache here — cache is already up to date from storeDevices above
    } catch(e) { console.warn('Supabase device save failed', e.message); }
  }
}

// Milestone 3B — Device Registry soft delete (was a hard DELETE with zero
// trace). Marks the record deleted/deletedAt/deletedBy and appends an audit
// entry instead of removing the row, matching the pattern already used for
// memo Draft soft delete (app.js) and Manual Expense void (views/budget.js).
async function deleteDeviceAsync(id) {
  const devices = _loadDevicesRaw();
  const idx = devices.findIndex(d => String(d.id) === String(id));
  if (idx < 0) return;
  const now = new Date().toISOString();
  const updated = {
    ...devices[idx],
    deleted: true,
    deletedAt: now,
    deletedBy: currentUser(),
  };
  appendDeviceAuditLog(updated, 'Deleted');
  devices[idx] = updated;
  storeDevices(devices); // soft delete — row stays in cache/localStorage, just hidden from normal reads
  if (await checkSupa()) {
    try {
      // devices table uses BIGINT id — use _supaId stored after INSERT
      const supaId = updated._supaId;
      if (supaId) {
        const patch = { deleted: true, deleted_at: now, deleted_by: updated.deletedBy, audit_log: updated.auditLog };
        try {
          await supaFetch('devices', 'PATCH', patch, `?id=eq.${supaId}`);
        } catch(e) {
          if (!isMissingDeviceAuditColumnError(e)) throw e;
          const compatiblePatch = { ...patch };
          delete compatiblePatch.audit_log;
          await supaFetch('devices', 'PATCH', compatiblePatch, `?id=eq.${supaId}`);
        }
      }
    } catch(e) { console.warn('Supabase device delete failed', e.message); }
  }
}

function loadDevices() {
  return _excludeDeletedDevices(_loadDevicesRaw());
}
function storeDevices(devices) {
  _devCache = Array.isArray(devices) ? devices : [];
  // localStorage as offline backup only
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
    created_at:   po.createdAt || new Date().toISOString(),
    updated_at:   po.updatedAt || new Date().toISOString(),
    // Milestone 2 Task 2.3 — Created By / Updated By metadata.
    created_by:   po.createdBy || null,
    updated_by:   po.updatedBy || null,
    // Milestone 3B — PO audit log.
    audit_log:    po.auditLog || [],
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
    // Milestone 2 Task 2.3 — Created By / Updated By metadata.
    createdBy:   r.created_by || null,
    updatedBy:   r.updated_by || null,
    // Milestone 3B — PO audit log.
    auditLog:    r.audit_log || [],
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
      const row = poToDb(po);
      const isUpdate = existing && existing.length > 0;
      try {
        if (isUpdate) {
          await supaFetch('purchase_orders', 'PATCH', row, `?id=eq.${encodeURIComponent(po.id)}`);
        } else {
          await supaFetch('purchase_orders', 'POST', row, '');
        }
      } catch(e) {
        if (!isMissingDeviceAuditColumnError(e)) throw e;
        const compatibleRow = { ...row };
        delete compatibleRow.audit_log;
        if (isUpdate) {
          await supaFetch('purchase_orders', 'PATCH', compatibleRow, `?id=eq.${encodeURIComponent(po.id)}`);
        } else {
          await supaFetch('purchase_orders', 'POST', compatibleRow, '');
        }
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

// Milestone 3B — hardware line items for PO creation. Prefers the structured
// memo.hwItems array (populated by Create Memo's collectMemoData() since the
// "Memo Detail Restore" hotfix, persisted via memoToDb/dbToMemo's hw_items
// column) over scraping the printable HTML table — a cosmetic edit to Create
// Memo's Hardware table markup can no longer silently break PO creation
// (audit finding G-13). Falls back to the legacy HTML-scrape for Hardware
// memos approved before hwItems existed, so historical memos still produce
// POs correctly.
function _hwLineItemsFromMemo(memo) {
  const structured = (memo.hwItems || [])
    .map(it => ({ name: (it.name || '').trim(), qty: parseInt(it.qty) || 1 }))
    .filter(it => it.name && it.name !== '-');
  if (structured.length) return structured;

  // Legacy fallback — HTML table scrape (memos with no hwItems stored)
  const section = memo.sections?.find(s => s.title === 'รายการ Hardware');
  if (!section) return [];
  const doc = new DOMParser().parseFromString(section.html, 'text/html');
  const legacyItems = [];
  doc.querySelectorAll('tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 4) return;
    const name = cells[1]?.textContent?.trim();
    const qty  = parseInt(cells[3]?.textContent) || 1;
    if (!name || name === '-') return;
    legacyItems.push({ name, qty });
  });
  return legacyItems;
}

// Auto-create purchase orders when HW memo is approved
// Called from updateMemoStatus in app.js when status = completed
function createPurchaseOrdersFromMemo(memo) {
  if (memo.type !== 'hw') return;
  if (memo.status !== 'completed') return; // only create POs for approved memos
  const items = _hwLineItemsFromMemo(memo);
  if (!items.length) return;
  const existing = loadPurchaseOrders();
  items.forEach(({ name, qty }, index) => {
    // id (and dup-check) is keyed by the line's position within this memo, not just item name —
    // two line items that legitimately share the same name (e.g. two separate "iPhone 13" rows)
    // must not collide into a single PO and silently drop the second line's quantity.
    const poId = `po_${memo.memoNo}_${index}_${name}`.replace(/[\s/\\]/g, '_');
    const isDup = existing.some(p => p.id === poId);
    if (isDup) return;
    const po = {
      id:          poId,
      memoNo:      memo.memoNo,
      project:     memo.project || '',
      itemName:    name,
      orderedQty:  qty,
      arrivedQty:  0,
      status:      'pending_order',
      note:        '',
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
      // Milestone 2 Task 2.3 — Created By / Updated By metadata: whoever's
      // action (approval) completed the memo and triggered this auto-creation.
      createdBy:   currentUser(),
      updatedBy:   currentUser(),
      auditLog:    [],
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
          try {
            await supaFetch('purchase_orders', 'POST', poToDb(po), '');
          } catch(e) {
            if (!isMissingDeviceAuditColumnError(e)) throw e;
            const compatibleRow = poToDb(po);
            delete compatibleRow.audit_log;
            await supaFetch('purchase_orders', 'POST', compatibleRow, '');
          }
        } catch(e) { console.warn('PO save failed:', e.message); }
      });
    }
  });
  storePurchaseOrders(existing);
}

// Mark devices as arrived — creates device records and updates PO
async function markArrived(poId, qty, serialNumbers = []) {
  // Always read fresh from localStorage
  const pos = loadPurchaseOrders();
  const po  = pos.find(p => p.id === poId);
  if (!po) return;
  // Functional audit fix: SYSTEM_STATE_MACHINE.md §6 requires Device
  // Management downstream impact to be blocked once the source memo is
  // Voided/Rejected/Cancelled. Nothing previously re-checked the memo's
  // status here, so a PO tied to an already-voided memo could keep advancing
  // and spawn brand-new Device Registry records with no warning.
  if (po.memoNo && typeof loadMemos === 'function') {
    const sourceMemo = loadMemos().find(m => m.memoNo === po.memoNo);
    if (sourceMemo && ['voided', 'rejected', 'cancelled'].includes(sourceMemo.status)) {
      alert(`Memo ${po.memoNo} ถูกเปลี่ยนสถานะเป็น "${sourceMemo.status}" แล้ว — ไม่สามารถสร้าง Device Registry ใหม่จาก PO นี้ได้ กรุณาแจ้ง PMO เพื่อดำเนินการแก้ไขด้วยตนเอง`);
      return;
    }
  }
  if (!['awaiting', 'partial_arrived'].includes(po.status)) {
    alert('กรุณาเปลี่ยนสถานะเป็น Awaiting ก่อน mark arrived');
    return;
  }
  const now        = new Date().toISOString();
  const actualQty  = Math.min(qty, po.orderedQty - po.arrivedQty); // can't exceed remaining
  const newArrived = po.arrivedQty + actualQty;
  const prevStatus = po.status;
  po.arrivedQty = newArrived;
  po.status     = newArrived >= po.orderedQty ? 'fulfilled' : 'partial_arrived';
  po.updatedAt  = now;
  po.updatedBy  = currentUser();
  appendDeviceAuditLog(po, 'Marked arrived', {
    comment: `+${actualQty} arrived (${newArrived}/${po.orderedQty})`,
    statusBefore: prevStatus,
    statusAfter: po.status,
  });
  storePurchaseOrders(pos); // sync save first
  savePurchaseOrderAsync(po).catch(e => console.warn('PO update failed', e));

  // Create device records — store to localStorage first, then sync to Supabase
  const batchTs  = Date.now();
  const devices  = _loadDevicesRaw(); // raw list — don't drop soft-deleted rows on write
  const newDevices = [];

  for (let i = 0; i < actualQty; i++) {
    const serial = serialNumbers[i] !== undefined ? serialNumbers[i] : '';
    const device = {
      id:              `dev_${batchTs}_${i}`,
      // Device Registry must show the hardware item/model (e.g. "iPhone 13"),
      // never the memo number, even in the edge case of a PO with no
      // itemName — a blank Asset/Serial at arrival is acceptable, a blank or
      // memo-number-shaped device name is not.
      name:            po.itemName    || 'Unnamed Hardware Item',
      brand:           '',
      platform:        'other',
      type:            'mobile',
      serial:          serial,
      assetTag:        '',
      owner:           '',
      assignedDate:    now.slice(0, 10),
      project:         po.project     || '',
      company:         '',
      returnDate:      '',
      warranty:        '',
      status:          'not_identified',
      memoNo:          po.memoNo      || '',
      purchaseOrderId: po.id,
      note:            `Arrived from ${po.memoNo} · ${po.itemName}`,
      source:          'memo',
      createdAt:       now,
      updatedAt:       now,
      // Milestone 2 Task 2.3 — Created By / Updated By metadata.
      createdBy:       currentUser(),
      updatedBy:       currentUser(),
      auditLog:        [],
    };
    appendDeviceAuditLog(device, 'Created from PO arrival', { comment: `PO ${po.id} · ${po.memoNo}` });
    devices.push(device);
    newDevices.push(device);
  }
  storeDevices(devices); // updates _devCache directly
  // Async push to Supabase in background
  newDevices.forEach(d => saveDeviceAsync(d).catch(e => console.warn('Device save failed', e)));

  // UAT smoke-test fix: markArrived() previously called renderDevice() here,
  // which fires a full loadDevicesAsync() Supabase GET that unconditionally
  // overwrites _devCache. That GET can race ahead of the saveDeviceAsync()
  // POSTs just fired above (or from a prior markArrived() call on the same
  // PO whose POSTs hadn't landed yet), silently discarding the just-created
  // device record(s) from the cache — reproduced deterministically doing a
  // partial arrival followed by the remaining-quantity arrival on one PO.
  // markArrived()'s only caller (submitMarkArrived(), views/device.js) already
  // re-renders safely straight from the just-updated local cache
  // (_renderPOTable()/_renderDeviceTable(), no redundant fetch), matching the
  // same race-avoidance pattern deleteDevice() already documents — so this
  // call was both redundant and the sole source of the data loss.
}

// ── Helpers ──
const PLATFORM_LABEL = { ios:'iOS', android:'Android', huawei:'Huawei', windows:'Windows', other:'Other' };
const TYPE_LABEL = { mobile:'Mobile', tablet:'Tablet', laptop:'Laptop', other:'Other' };

function deviceStatusBadge(status) {
  return { 'not_identified':{ label:'Not Identified', cls:'badge-gray' }, 'in-use':{ label:'In Use', cls:'badge-blue' }, 'available':{ label:'Available', cls:'badge-green' }, 'maintenance':{ label:'Maintenance', cls:'badge-amber' }, 'retired':{ label:'Retired', cls:'badge-gray' } }[status] || { label:status, cls:'badge-gray' };
}
function warrantyStatus(warrantyDate) {
  if(!warrantyDate) return null;
  const days = Math.floor((new Date(warrantyDate) - new Date()) / 86400000);
  if(days < 0)   return { label:'หมดอายุแล้ว', cls:'badge-red' };
  if(days <= 30) return { label:`อีก ${days}d`, cls:'badge-amber' };
  return { label: shortDate(warrantyDate), cls:'badge-green' };
}

// ── Auto-sync from HW Memos (legacy — for memos approved before PO system) ──
// syncFromHWMemos removed — devices only enter registry via markArrived()

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
// ── Device Bulk Import / Template ──────────────────────────────
function downloadDeviceTemplate() {
  const headers = ['name','brand','type','platform','serial','asset_tag',
    'owner','project','warranty','note'];
  const example = ['MacBook Pro 14"','Apple','laptop','mac',
    'C02XL0MCJG5M','ORB-2024-001',
    'สมชาย ใจดี','Geo9','2027-03-01','Status defaults to not_identified'];
  _downloadCSV('Device_Template', headers, [example]);
}

async function importDeviceBulk(file) {
  if (!file) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = e => importDeviceBulk(e.target.files[0]);
    input.click();
    return;
  }

  let rows = [];
  try {
    if (file.name.endsWith('.csv')) {
      const text = await file.text();
      const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g,'').trim());
      rows = lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i]||'').replace(/^"|"$/g,'').trim(); });
        return obj;
      });
    } else if (typeof XLSX !== 'undefined') {
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type:'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      rows      = XLSX.utils.sheet_to_json(ws, { defval:'' });
    } else {
      alert('กรุณาใช้ไฟล์ CSV (ไม่พบ SheetJS สำหรับ Excel)'); return;
    }
  } catch(e) { alert('อ่านไฟล์ไม่ได้: ' + e.message); return; }

  if (!rows.length) { alert('ไม่พบข้อมูลในไฟล์'); return; }

  const get = (row, ...keys) => {
    for (const k of keys) {
      const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[\s_]/g,'') === k.toLowerCase().replace(/[\s_]/g,''));
      if (found && row[found] !== '') return String(row[found]).trim();
    }
    return '';
  };

  const valid = [], errors = [];
  rows.forEach((row, i) => {
    const name = get(row,'name','devicename','brandmodel','model');
    if (!name) { errors.push('Row ' + (i+2) + ': ไม่มีชื่ออุปกรณ์'); return; }
    valid.push({
      id:           'dev_bulk_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      name,
      brand:        get(row,'brand','manufacturer'),
      type:         get(row,'type','devicetype') || 'other',
      platform:     get(row,'platform','os') || 'other',
      pbxNumber:    get(row,'pbxnumber','pbx_number'),
      serial:       get(row,'serial','serialnumber','sn'),
      assetTag:     get(row,'assetacc','asset_acc','asset_tag','assettag','assetno'),
      owner:        get(row,'owner','assignee','user'),
      position:     get(row,'position'),
      project:      get(row,'project'),
      qaOwner:      get(row,'qaowner','qa_owner'),
      osVersion:    get(row,'osversion','os_version'),
      status:       'not_identified',
      warranty:     get(row,'warranty'),
      note:         get(row,'note','remark'),
      source:       'bulk-import',
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    });
  });

  if (errors.length) {
    alert('พบข้อผิดพลาด ' + errors.length + ' รายการ:\n' + errors.slice(0,5).join('\n'));
    if (!valid.length) return;
    if (!confirm('มีข้อมูลที่ถูกต้อง ' + valid.length + ' รายการ — ต้องการ import ต่อไหม?')) return;
  } else {
    if (!confirm('พบข้อมูล ' + valid.length + ' อุปกรณ์ — ยืนยัน import?')) return;
  }

  // Raw (unfiltered) base for the write so a soft-deleted device isn't dropped
  // by this merge; dedupe check uses the active (non-deleted) list only, so a
  // soft-deleted serial is treated as available for reuse — same rule as the
  // manual Add/Edit modal's findExistingDevice().
  const existingRaw = _loadDevicesRaw();
  const activeExisting = _excludeDeletedDevices(existingRaw);
  const merged = [...existingRaw];
  valid.forEach(d => {
    if (d.serial && activeExisting.find(e => e.serial === d.serial)) return;
    merged.push(d);
  });
  storeDevices(merged);
  valid.forEach(d => {
    if (typeof saveDeviceAsync === 'function') saveDeviceAsync(d).catch(e => console.warn('Device bulk sync failed', e));
  });
  renderDevice();
  alert('✓ Import อุปกรณ์สำเร็จ — เพิ่ม ' + valid.length + ' รายการ (ซ้ำ serial: ข้ามแล้ว)');
}

function renderDevice() {
  // Part 8 (UX consistency pass) — Platform/Type/Status/Project/Company are
  // now multi-select filters; initMultiSelect() is idempotent (no-op past
  // the first call) so it's safe to call on every render.
  const _devFilterLabels = {
    'dev-filter-platform': 'Platform', 'dev-filter-type': 'Type', 'dev-filter-status': 'Status',
    'dev-filter-project': 'Project', 'dev-filter-company': 'Company',
  };
  Object.keys(_devFilterLabels).forEach(id => initMultiSelect(id, undefined, _devFilterLabels[id]));
  // Load fresh from Supabase then render
  loadDevicesAsync().then(() => _renderDeviceTable()).catch(() => _renderDeviceTable());
}

// Functional audit fix: single source of the Device Registry filter
// predicates (search + platform/type/status/project/company dropdowns) —
// previously only inlined inside _renderDeviceTable(), so Export CSV
// (exportDeviceCsv()) always read the full unfiltered list, disagreeing with
// what was on screen (MASTER_SPEC.md "Export Rules"). Reused by both.
// Part 8 (UX consistency pass): each dropdown is now multi-select — an empty
// selection means "no filter" (matches the old single-select "all"), a
// non-empty selection matches any of the checked values.
function _filteredDevices(allDevices) {
  const search     = (document.getElementById('dev-search')?.value||'').toLowerCase();
  const platFilter = msValues('dev-filter-platform');
  const typeFilter = msValues('dev-filter-type');
  const statFilter = msValues('dev-filter-status');
  const projFilter = msValues('dev-filter-project');
  const compFilter = msValues('dev-filter-company');

  let devices = allDevices;
  // Device Management D2 (Part 4) — deep-link filter (from PO drill-down or
  // Memo Detail) applies first; the existing search/filter controls above
  // still narrow further on top of it (AND, not OR).
  if(_devDeepLinkFilter) {
    devices = devices.filter(d => _devDeepLinkFilter.poId
      ? d.purchaseOrderId === _devDeepLinkFilter.poId
      : d.memoNo === _devDeepLinkFilter.memoNo);
  }
  if(platFilter.length) devices = devices.filter(d => platFilter.includes(d.platform||'other'));
  if(typeFilter.length) devices = devices.filter(d => typeFilter.includes(d.type||'other'));
  if(statFilter.length) devices = devices.filter(d => statFilter.includes(d.status));
  if(projFilter.length) devices = devices.filter(d => projFilter.includes(d.project));
  if(compFilter.length) devices = devices.filter(d => compFilter.includes(d.company));
  if(search) devices = devices.filter(d => [
    d.name, d.brand, d.serial, d.assetTag, d.pbxNumber,
    d.owner, d.position, d.project, d.company, d.osVersion,
    d.qaOwner, d.note, d.memoNo, d.type, d.platform,
    PLATFORM_LABEL[d.platform||'other'], TYPE_LABEL[d.type||'other']
  ].some(v => v && String(v).toLowerCase().includes(search)));
  return devices;
}

// Device Management D2 (Parts 4 & 6) — Device Registry deep-link context
// banner. Populated by viewDevicesForPO() or viewDevicesForMemo(); mirrors
// views/license.js's _renderLicUsrContextBanner() pattern.
function _renderDevRegistryContextBanner() {
  const el = document.getElementById('dev-registry-context-banner');
  if(!el) return;
  const f = _devDeepLinkFilter;
  if(!f) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const parts = [];
  if(f.poId) parts.push(`PO <strong>${esc(f.poId)}</strong>`);
  if(f.memoNo) parts.push(`Memo <strong>${esc(f.memoNo)}</strong>`);
  if(f.itemName) parts.push(`Item <strong>${esc(f.itemName)}</strong>`);
  const backBtn = f.source === 'po'
    ? `<button class="btn-sm" onclick="_backToPOFromDeviceRegistry()">← Back to Purchase Orders</button>`
    : `<button class="btn-sm" onclick="_backToMemoFromDeviceRegistry()">← Back to Memo</button>`;
  el.style.display = '';
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--blue-50,#E6F1FB);border:1px solid var(--border-md);border-radius:var(--r-sm);padding:8px 12px">
      <div style="font-size:12px;color:var(--text-1)">Showing devices for: ${parts.join(' / ')}</div>
      <div style="display:flex;gap:8px;align-items:center">
        ${backBtn}
        <button class="btn-sm" onclick="_clearDevDeepLinkFilter()">Clear filter</button>
      </div>
    </div>`;
}
function _backToPOFromDeviceRegistry() {
  _devDeepLinkFilter = null;
  // switchDevTab('orders', ...) -> renderPurchaseOrders() re-fetches from
  // Supabase before rendering; force an immediate render off the already-
  // cached data too, so the cleared filter is reflected without waiting on
  // that round-trip (same reasoning as viewPurchaseOrdersForMemo() below).
  switchDevTab('orders', document.getElementById('dev-tbtn-orders'));
  _renderPOTable();
}
function _backToMemoFromDeviceRegistry() {
  const memoNo = _devDeepLinkFilter?.memoNo;
  _devDeepLinkFilter = null;
  _renderDeviceTable();
  if(memoNo && typeof openMemoReadOnly === 'function') openMemoReadOnly(memoNo);
}
function _clearDevDeepLinkFilter() {
  _devDeepLinkFilter = null;
  _renderDeviceTable();
}

function _renderDeviceTable() {
  _renderDevRegistryContextBanner();

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

  const search = (document.getElementById('dev-search')?.value||'').toLowerCase();
  const devices = _filteredDevices(allDevices);

  const tbody = document.getElementById('dev-table-body');
  if(!devices.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="hist-empty">${search ? 'No devices found. Try changing filters.' : 'No devices found — click Add Device or Import Excel.'}</td></tr>`;
    return;
  }

  // Reset visible count when filters change
  const filterKey = JSON.stringify({
    search,
    platFilter: msValues('dev-filter-platform'),
    typeFilter: msValues('dev-filter-type'),
    statFilter: msValues('dev-filter-status'),
    projFilter: msValues('dev-filter-project'),
    compFilter: msValues('dev-filter-company'),
  });
  if(typeof _devLastFilter !== 'undefined' && _devLastFilter !== filterKey) _devVisibleCount = DEV_PAGE_SIZE;
  window._devLastFilter = filterKey;

  const visibleDevices = devices.slice(0, _devVisibleCount);
  const remaining = devices.length - _devVisibleCount;

  tbody.innerHTML = visibleDevices.map(d => {
    const statusB = deviceStatusBadge(d.status);
    const platLbl = PLATFORM_LABEL[d.platform||'other'] || d.platform || '—';
    const typeLbl = TYPE_LABEL[d.type||'other'] || d.type || '—';
    const updDate = d.updatedAt ? shortDate(d.updatedAt) : (d.assignedDate ? shortDate(d.assignedDate) : '—');
    // Device ids are BIGINT (numeric) once synced from Supabase but stay as a
    // string placeholder (nextDeviceId()) until then — quoting here (and
    // comparing via String(...) in openDeviceModal/openDeviceDetail/
    // uploadDevicePhoto/removeDevicePhoto/deleteDevice) keeps a freshly
    // created or just-arrived device's row clickable in the same session,
    // instead of throwing a ReferenceError on an unquoted bare identifier.
    return `<tr style="cursor:pointer" onclick="openDeviceDetail('${esc(String(d.id))}')">
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
      <td style="text-align:center"><span class="badge ${statusB.cls}">${esc(statusB.label)}</span></td>
      <td style="font-size:11px;color:var(--text-3)">${updDate}</td>
      <td style="text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
        <button class="btn-sm" onclick="event.stopPropagation();openDeviceModal('${esc(String(d.id))}')" style="padding:3px 7px;font-size:11px" title="แก้ไข">✎</button>
        <button class="btn-sm" onclick="event.stopPropagation();deleteDevice('${esc(String(d.id))}')" style="padding:3px 7px;font-size:11px;color:var(--red)" title="ลบ">✕</button>
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
    const d = loadDevices().find(dev => String(dev.id) === String(id));
    if(!d) return;
    document.getElementById('dev-modal-title').textContent = 'Edit Device';
    document.getElementById('dev-edit-id').value = d.id;
    setVal('dev-name', d.name);        setVal('dev-brand', d.brand);
    setVal('dev-platform', d.platform||'other'); setVal('dev-type', d.type||'mobile');
    setVal('dev-asset', d.assetTag);   setVal('dev-serial', d.serial);
    setVal('dev-pbx-number', d.pbxNumber);
    setVal('dev-os-version', d.osVersion);
    setVal('dev-company', d.company);  setVal('dev-project', d.project);
    setVal('dev-owner', d.owner);      setVal('dev-position', d.position);
    setVal('dev-assigned-date', d.assignedDate);
    setVal('dev-return-date', d.returnDate); setVal('dev-memo-ref', d.memoNo);
    setVal('dev-warranty', d.warranty);
    setVal('dev-status', d.status||'not_identified'); setVal('dev-note', d.note);
    setVal('dev-qa-owner', d.qaOwner);
    // Audit follow-up: a device created from a PO/Hardware Memo arrival (source
    // === 'memo') keeps its memo link read-only; manual devices stay editable.
    _setDeviceMemoLinkUI(d.source === 'memo' && !!d.memoNo, d.memoNo);
  } else {
    document.getElementById('dev-modal-title').textContent = 'Add Device';
    document.getElementById('dev-edit-id').value = '';
    ['dev-name','dev-brand','dev-asset','dev-serial','dev-owner','dev-return-date',
     'dev-warranty','dev-memo-ref','dev-note'].forEach(id => setVal(id,''));
    setVal('dev-platform','ios'); setVal('dev-type','mobile');
    setVal('dev-company',''); setVal('dev-project','');
    setVal('dev-pbx-number',''); setVal('dev-os-version',''); setVal('dev-position',''); setVal('dev-qa-owner','');
    setVal('dev-status','not_identified');
    setVal('dev-assigned-date', new Date().toISOString().slice(0,10));
    _setDeviceMemoLinkUI(false, '');
  }
}

// Toggles the Link HW Memo field between read-only (PO/memo-sourced device) and
// editable (manual device), and shows/hides the View Source Memo action.
function _setDeviceMemoLinkUI(readOnly, memoNo) {
  const memoRefInput = document.getElementById('dev-memo-ref');
  const viewBtn = document.getElementById('dev-view-source-memo-btn');
  if (memoRefInput) memoRefInput.readOnly = !!readOnly;
  if (viewBtn) {
    viewBtn.style.display = readOnly ? '' : 'none';
    viewBtn.dataset.memoNo = memoNo || '';
  }
}
function closeDeviceModal() { document.getElementById('device-modal').style.display='none'; }

// ── Dedup check — find existing device by serial or assetTag ──
function findExistingDevice(devices, data) {
  if (!devices || !devices.length) return -1;
  return devices.findIndex(d => {
    if (data.serial    && data.serial    !== '' && d.serial    === data.serial)    return true;
    if (data.assetTag  && data.assetTag  !== '' && d.assetTag  === data.assetTag)  return true;
    return false;
  });
}

function saveDevice() {
  const name = document.getElementById('dev-name').value.trim();
  if(!name) { alert('กรุณากรอก Device Name'); return; }
  const editId = document.getElementById('dev-edit-id').value;
  const devices = loadDevices();
  const now = new Date().toISOString();
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const data = {
    name,
    brand:        g('dev-brand'),
    platform:     g('dev-platform') || 'other',
    type:         g('dev-type') || 'mobile',
    assetTag:     g('dev-asset'),
    pbxNumber:    g('dev-pbx-number'),
    serial:       g('dev-serial'),
    osVersion:    g('dev-os-version'),
    company:      g('dev-company'),
    project:      g('dev-project'),
    owner:        g('dev-owner'),
    position:     g('dev-position'),
    assignedDate: g('dev-assigned-date'),
    returnDate:   g('dev-return-date'),
    memoNo:       g('dev-memo-ref'),
    warranty:     g('dev-warranty'),
    qaOwner:      g('dev-qa-owner'),
    status:       g('dev-status') || 'not_identified',
    note:         g('dev-note'),
    updatedAt:    now,
    // Milestone 2 Task 2.3 — Created By / Updated By metadata.
    updatedBy:    currentUser(),
  };
  if(editId) {
    const allDevs = loadDevices();
    const idx = allDevs.findIndex(d => String(d.id) === String(editId));
    const orig = idx >= 0 ? allDevs[idx] : {};
    // Device source memo linkage: a PO/Hardware-Memo-sourced device's Link HW
    // Memo field is read-only in the UI; keep memoNo/source authoritative from
    // the original record here too, not from the (possibly stale) form field.
    const isMemoSourced = orig.source === 'memo';
    const updated = {
      ...orig, ...data, id: editId,
      memoNo: isMemoSourced ? orig.memoNo : data.memoNo,
      source: orig.source || 'manual',
      auditLog: [...(orig.auditLog||[])],
    };
    appendDeviceAuditLog(updated, 'Edited', { statusBefore: orig.status||null, statusAfter: updated.status||null });
    saveDeviceAsync(updated).catch(e => console.warn('Device save failed', e));
  } else {
    const allDevs = loadDevices();
    const dupIdx = findExistingDevice(allDevs, data);
    if(dupIdx >= 0) {
      const dup = allDevs[dupIdx];
      const matchField = (data.assetTag && data.assetTag === dup.assetTag) ? `Asset: ${data.assetTag}` : `Serial: ${data.serial}`;
      if(!confirm(`พบอุปกรณ์ซ้ำ (${matchField})\nอัปเดตข้อมูลอันเดิมแทน?`)) return;
      const isMemoSourced = dup.source === 'memo';
      const merged = {
        ...dup, ...data,
        memoNo: isMemoSourced ? dup.memoNo : data.memoNo,
        source: dup.source || 'manual',
        auditLog: [...(dup.auditLog||[])],
      };
      appendDeviceAuditLog(merged, 'Edited', { comment: `Merged duplicate (${matchField})`, statusBefore: dup.status||null, statusAfter: merged.status||null });
      saveDeviceAsync(merged).catch(e => console.warn('Device save failed', e));
    } else {
      const created = { id: nextDeviceId(), ...data, source: 'manual', createdAt: now, createdBy: currentUser(), auditLog: [] };
      appendDeviceAuditLog(created, 'Created');
      saveDeviceAsync(created).catch(e => console.warn('Device save failed', e));
    }
  }
  closeDeviceModal();
  // UAT smoke-test fix: saveDevice() previously called renderDevice() here,
  // the same race already fixed for markArrived() — a fresh loadDevicesAsync()
  // GET fired right after this save's own fire-and-forget saveDeviceAsync()
  // PATCH/POST can resolve first and overwrite _devCache with pre-save server
  // data, so an Edit Device save could appear to silently revert (fields show
  // their old values) until a later full reload. saveDeviceAsync() already
  // updates _devCache/localStorage synchronously before its own network call,
  // so re-rendering straight from the local cache (matching deleteDevice()'s
  // already-documented safe pattern) is enough and avoids the race.
  _renderDeviceTable();
}

function deleteDevice(id) {
  const d = loadDevices().find(dev => String(dev.id) === String(id));
  if(!d) return;
  if(!confirm(`ลบ "${d.name}" ออกจากระบบ?`)) return;
  // Milestone 3B fix: deleteDeviceAsync() already updates the local cache/
  // localStorage synchronously before its own Supabase PATCH goes out. Calling
  // renderDevice() here (instead of re-rendering directly) would fire a fresh
  // loadDevicesAsync() GET that can race ahead of that PATCH and overwrite the
  // just-applied soft delete with stale (not-yet-deleted) server data — the
  // deleted row would flash back into view until the next manual reload.
  // Awaiting the delete, then re-rendering from the already-updated local
  // cache directly (no redundant fetch), matches the pattern already used by
  // submitMarkArrived().
  deleteDeviceAsync(id).then(() => {
    _renderDeviceTable();
  }).catch(e => console.warn('Delete failed', e));
}

// ── Export CSV ──
function exportDeviceCsv() {
  // Functional audit fix: export the same filtered set _renderDeviceTable()
  // currently shows (search + platform/type/status/project/company), not the
  // full unfiltered registry — see MASTER_SPEC.md "Export Rules".
  const devices = _filteredDevices(loadDevices());
  if(!devices.length) { alert('ไม่มีข้อมูลสำหรับ Export'); return; }
  const headers = ['PBX Number','OS','Type','Brand / Model','Asset ACC',
    'Serial','Assignee','Position','Project','Received date','QA Owner',
    'Updated Date','Remark','OS version','Status','Warranty','Memo Ref'];
  const rows = devices.map(d => [
    d.pbxNumber||'', PLATFORM_LABEL[d.platform||'other']||d.platform||'',
    TYPE_LABEL[d.type||'other']||d.type||'', d.name||'',
    d.assetTag||'', d.serial||'', d.owner||'', d.position||'',
    d.project||'', d.assignedDate||'', d.qaOwner||'',
    d.updatedAt ? d.updatedAt.slice(0,10) : '', d.note||'', d.osVersion||'',
    d.status||'', d.warranty||'', d.memoNo||''
  ]);
  _downloadCSV('Device_Registry', headers, rows);
}

function exportPurchaseOrdersCSV() {
  // Device Management D2 (Part 2) — export exactly the filtered/visible rows,
  // not the full unfiltered list (MASTER_SPEC.md "Export Rules").
  const pos = _filteredPOs(loadPurchaseOrders());
  if(!pos.length) { alert('ไม่มีข้อมูล Purchase Orders'); return; }
  const headers = ['PO ID','Memo No','โครงการ','ชื่อรายการ','จำนวนที่สั่ง','จำนวนที่รับ',
    'คงเหลือ','สถานะ','หมายเหตุ','วันที่สร้าง','วันที่อัปเดต'];
  const rows = pos.map(p => [
    p.id, p.memoNo, p.project, p.itemName,
    p.orderedQty, p.arrivedQty, (p.orderedQty - p.arrivedQty),
    poEffectiveStatus(p), p.note||'',
    p.createdAt?.slice(0,10), p.updatedAt?.slice(0,10)
  ]);
  _downloadCSV('Purchase_Orders', headers, rows);
}

document.addEventListener('click', e => {
  if(e.target === document.getElementById('device-modal')) closeDeviceModal();
});

// ── Device Detail Panel ──
function openDeviceDetail(id) {
  const d = loadDevices().find(dev => String(dev.id) === String(id));
  if(!d) return;
  const idStr = esc(String(d.id));
  const platLbl = PLATFORM_LABEL[d.platform||'other'] || d.platform || '—';
  const typeLbl = TYPE_LABEL[d.type||'other'] || d.type || '—';
  const statusB = deviceStatusBadge(d.status);
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
        <span class="badge ${statusB.cls}">${esc(statusB.label)}</span>
        <button class="btn-sm" onclick="document.getElementById('dev-detail-modal').style.display='none';openDeviceModal('${idStr}')" style="font-size:11px;padding:3px 8px">✎ Edit</button>
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
          ${infoCell('Asset ACC', d.assetTag||'—')}
          ${infoCell('PBX Number', d.pbxNumber||'—')}
          ${infoCell('Warranty', d.warranty ? shortDate(d.warranty) : '—')}
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
          ${d.photoUrl
            ? `<a href="${esc(d.photoUrl)}" target="_blank" rel="noopener"><img src="${esc(d.photoUrl)}" style="width:80px;height:80px;border-radius:var(--r-sm);object-fit:cover;border:1px solid var(--border)" title="คลิกเพื่อดูขนาดเต็ม"></a>`
            : `<div style="width:80px;height:80px;border-radius:var(--r-sm);border:1px dashed var(--border-md);background:var(--bg);display:flex;align-items:center;justify-content:center;color:var(--text-3);font-size:11px">No photo</div>`}
          <div>
            <label style="cursor:pointer">
              <input type="file" accept="image/*" style="display:none" onchange="uploadDevicePhoto('${idStr}', this)">
              <span class="btn-sm" style="font-size:11px;padding:4px 10px;display:inline-block">📷 Upload photo</span>
            </label>
            ${d.photoUrl ? `<button class="btn-sm" style="font-size:11px;padding:4px 10px;color:var(--red);margin-left:4px" onclick="removeDevicePhoto('${idStr}')">✕ Remove</button>` : ''}
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

async function uploadDevicePhoto(id, input) {
  if(!input.files?.length) return;
  const file = input.files[0];
  if(file.size > 5 * 1024 * 1024) { alert('ไฟล์ใหญ่เกิน 5MB'); return; }
  const device = loadDevices().find(d => String(d.id) === String(id));
  if(!device) return;
  const ext = ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' })[file.type];
  if(!ext) { alert('รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP'); return; }
  const path = `devices/${device._supaId || device.id}-${Date.now()}.${ext}`;
  const objectPath = path.split('/').map(encodeURIComponent).join('/');
  try {
    const resp = await fetch(`${SUPA_URL}/storage/v1/object/device-photos/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': file.type,
      },
      body: file,
    });
    if(!resp.ok) throw new Error(await resp.text());
    const photoUrl = `${SUPA_URL}/storage/v1/object/public/device-photos/${objectPath}`;
    if(device.photoUrl) {
      const marker = '/storage/v1/object/public/device-photos/';
      const previousPath = device.photoUrl.includes(marker) ? device.photoUrl.split(marker)[1] : '';
      if(previousPath) {
        fetch(`${SUPA_URL}/storage/v1/object/device-photos/${previousPath}`, {
          method:'DELETE', headers:{ apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}` }
        }).catch(() => {});
      }
    }
    await saveDeviceAsync({ ...device, photoUrl, updatedAt:new Date().toISOString() });
    openDeviceDetail(id);
    renderDevice();
  } catch(e) {
    console.error('Device photo upload failed', e);
    alert('อัปโหลดรูปไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
}

async function removeDevicePhoto(id) {
  const device = loadDevices().find(d => String(d.id) === String(id));
  if(!device?.photoUrl || !confirm('ลบรูปอุปกรณ์นี้หรือไม่?')) return;
  const marker = '/storage/v1/object/public/device-photos/';
  const objectPath = device.photoUrl.includes(marker) ? device.photoUrl.split(marker)[1] : '';
  try {
    if(objectPath) {
      const resp = await fetch(`${SUPA_URL}/storage/v1/object/device-photos/${objectPath}`, {
        method: 'DELETE',
        headers: { apikey:SUPA_KEY, Authorization:`Bearer ${SUPA_KEY}` },
      });
      if(!resp.ok) throw new Error(await resp.text());
    }
    await saveDeviceAsync({ ...device, photoUrl:'', updatedAt:new Date().toISOString() });
    openDeviceDetail(id);
    renderDevice();
  } catch(e) {
    console.error('Device photo remove failed', e);
    alert('ลบรูปไม่สำเร็จ กรุณาลองอีกครั้ง');
  }
}

// ══════════════════════════════════════════
// PURCHASE ORDERS TAB
// ══════════════════════════════════════════

function switchDevTab(tab, btn) {
  document.querySelectorAll('.dev-tab-btn, #view-device .tab-btn').forEach(b => {
    const on = b === btn || b.dataset.tab === tab;
    b.classList.toggle('active', on);
    b.style.borderBottomColor = '';
    b.style.color = '';
    b.style.fontWeight = '';
  });
  document.getElementById('dev-panel-registry').style.display = tab === 'registry' ? '' : 'none';
  document.getElementById('dev-panel-orders').style.display   = tab === 'orders'   ? '' : 'none';
  if (tab === 'orders') renderPurchaseOrders();
}

function renderPurchaseOrders() {
  const _poFilterLabels = { 'po-filter-status': 'Status', 'po-filter-project': 'Project' };
  Object.keys(_poFilterLabels).forEach(id => initMultiSelect(id, undefined, _poFilterLabels[id]));
  loadPurchaseOrdersAsync().then(() => _renderPOTable()).catch(() => _renderPOTable());
}

// Device Management D2 (Parts 1 & 2) — single source of Purchase Orders filter
// predicates (search + status/project multi-select + remaining>0 toggle +
// memoNo deep-link), reused by both the visible table and
// exportPurchaseOrdersCSV() so export always matches what's on screen
// (MASTER_SPEC.md "Export Rules"). Remaining Qty is derived here only
// (orderedQty - arrivedQty) — never persisted onto the PO record.
function _filteredPOs(allPos) {
  const search        = (document.getElementById('po-search')?.value||'').toLowerCase();
  const statFilter     = msValues('po-filter-status');
  const projFilter     = msValues('po-filter-project');
  const remainingOnly  = !!document.getElementById('po-filter-remaining')?.checked;

  let pos = allPos;
  if(_poDeepLinkFilter) pos = pos.filter(p => p.memoNo === _poDeepLinkFilter.memoNo);
  if(statFilter.length) pos = pos.filter(p => statFilter.includes(poEffectiveStatus(p)));
  if(projFilter.length) pos = pos.filter(p => projFilter.includes(p.project));
  if(remainingOnly) pos = pos.filter(p => (p.orderedQty - p.arrivedQty) > 0);
  if(search) pos = pos.filter(p => [p.memoNo, p.itemName].some(v => v && String(v).toLowerCase().includes(search)));
  return pos;
}

// Device Management D2 (Part 3) — count of Device Registry rows created from
// a given PO (matched via device.purchaseOrderId, set by markArrived()).
function _devicesCountForPO(po) {
  return loadDevices().filter(d => d.purchaseOrderId === po.id).length;
}

// Device Management D2 (Part 3) — PO -> Device Registry drill-down. No-op
// when the PO has zero devices created yet (rendered as plain, non-clickable
// text in _renderPOTable(), never wired to this handler at all).
function viewDevicesForPO(poId) {
  const po = loadPurchaseOrders().find(p => p.id === poId);
  if(!po) return;
  if(!_devicesCountForPO(po)) return;
  _devDeepLinkFilter = { poId: po.id, memoNo: po.memoNo, itemName: po.itemName, source: 'po' };
  // switchDevTab('registry', ...) only toggles panel visibility — it does not
  // re-render (unlike the 'orders' branch, which calls renderPurchaseOrders())
  // — so the new filter must be applied explicitly here.
  switchDevTab('registry', document.getElementById('dev-tbtn-registry'));
  _renderDeviceTable();
}

// Device Management D2 (Parts 5 & 6) — Purchase Orders deep-link context
// banner, populated by viewPurchaseOrdersForMemo() (Memo Detail "View
// Purchase Orders").
function _renderPOContextBanner() {
  const el = document.getElementById('po-context-banner');
  if(!el) return;
  const f = _poDeepLinkFilter;
  if(!f) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:var(--blue-50,#E6F1FB);border:1px solid var(--border-md);border-radius:var(--r-sm);padding:8px 12px">
      <div style="font-size:12px;color:var(--text-1)">Showing purchase orders for Memo <strong>${esc(f.memoNo)}</strong></div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn-sm" onclick="_backToMemoFromPO()">← Back to Memo</button>
        <button class="btn-sm" onclick="_clearPODeepLinkFilter()">Clear filter</button>
      </div>
    </div>`;
}
function _backToMemoFromPO() {
  const memoNo = _poDeepLinkFilter?.memoNo;
  _poDeepLinkFilter = null;
  _renderPOTable();
  if(memoNo && typeof openMemoReadOnly === 'function') openMemoReadOnly(memoNo);
}
function _clearPODeepLinkFilter() {
  _poDeepLinkFilter = null;
  _renderPOTable();
}

// Device Management D2 (Part 5) — Memo Detail deep-links. Called from
// views/history.js's memo detail action buttons (only rendered there when a
// linked PO/device actually exists for the memo).
function viewPurchaseOrdersForMemo(memoNo) {
  _poDeepLinkFilter = { memoNo };
  if(typeof swView === 'function') swView('device', null, 'Device Management');
  // switchDevTab('orders', ...) only toggles panel visibility and kicks off
  // an async Supabase re-fetch via renderPurchaseOrders() — force a
  // synchronous render off already-cached data too, so the new filter is
  // visible immediately (mirrors viewDevicesForPO()/viewDevicesForMemo()).
  switchDevTab('orders', document.getElementById('dev-tbtn-orders'));
  _renderPOTable();
}
function viewDevicesForMemo(memoNo) {
  _devDeepLinkFilter = { memoNo, source: 'memo' };
  if(typeof swView === 'function') swView('device', null, 'Device Management');
  switchDevTab('registry', document.getElementById('dev-tbtn-registry'));
  _renderDeviceTable();
}

const PO_STATUS_BADGE = {
  pending_order:  `<span class="badge badge-gray">Pending Order</span>`,
  ordered:        `<span class="badge badge-blue">Ordered</span>`,
  awaiting:       `<span class="badge badge-amber">Awaiting</span>`,
  partial_arrived:`<span class="badge badge-amber">Partial arrived</span>`,
  fulfilled:      `<span class="badge badge-green">Fulfilled</span>`,
  // Voided Hardware Memo downstream PO handling: terminal status applied when
  // the PO's source memo is voided before any devices have arrived. Never
  // deleted — kept visible for audit, same as a Voided memo itself.
  voided_source:  `<span class="badge badge-red">Voided</span>`,
};

// Hotfix (source memo void/reject/cancel — non-actionable PO before cascade):
// rendering must not rely solely on po.status already having been cascaded to
// 'voided_source' by cancelPurchaseOrdersForVoidedMemo(). If the source memo
// was voided/rejected/cancelled but the cascade never ran against this PO
// (older record predating the cascade, or a cascade write that never landed),
// the PO would otherwise keep rendering as Ordered/Awaiting with live
// Mark Awaiting/Mark Arrived actions — only to be rejected by markArrived()'s
// own guard (a few lines up) after the user clicks. These helpers let
// rendering detect the live source memo status directly, so the safe,
// non-actionable state shows up before any click, not after.
function poSourceMemoStatus(po) {
  if (!po.memoNo || typeof loadMemos !== 'function') return null;
  const memo = loadMemos().find(m => m.memoNo === po.memoNo);
  return memo ? memo.status : null;
}
function poIsVoidedSource(po) {
  if (po.status === 'voided_source') return true;
  if (po.status === 'fulfilled') return false; // already-arrived devices are never retroactively hidden
  return ['voided', 'rejected', 'cancelled'].includes(poSourceMemoStatus(po));
}
// Status used for every rendering decision (badge, action button, row
// styling, sort order) — po.status itself is never mutated here (read-only
// render path); only cancelPurchaseOrdersForVoidedMemo() writes it.
function poEffectiveStatus(po) {
  return poIsVoidedSource(po) ? 'voided_source' : po.status;
}

const VOIDED_SOURCE_BADGE_LABEL = { voided: 'Voided Source', rejected: 'Rejected Source', cancelled: 'Cancelled Source' };
// Badge HTML for a PO row. Once cancelPurchaseOrdersForVoidedMemo() has
// cascaded (po.status === 'voided_source'), keep the existing plain "Voided"
// label. For a live-detected-but-not-yet-cascaded PO, label it with the
// specific source memo status so it's clear at a glance why it's terminal.
function poStatusBadgeHtml(po) {
  if (po.status === 'voided_source') return PO_STATUS_BADGE.voided_source;
  if (poIsVoidedSource(po)) {
    const label = VOIDED_SOURCE_BADGE_LABEL[poSourceMemoStatus(po)] || 'Voided Source';
    return `<span class="badge badge-red">${label}</span>`;
  }
  return PO_STATUS_BADGE[po.status] || `<span class="badge badge-gray">${esc(po.status)}</span>`;
}

// Reason + timestamp recorded on a PO's own audit trail when its source memo
// was voided — read back to build the "Voided" badge tooltip without needing
// a dedicated column.
function poVoidAuditEntry(po) {
  if (po.status !== 'voided_source' || !Array.isArray(po.auditLog)) return null;
  return [...po.auditLog].reverse().find(e => e.action === 'Voided (source memo voided)') || null;
}
function poVoidReason(po) {
  return poVoidAuditEntry(po)?.comment || '';
}
// Full tooltip text for a voided-source PO's status badge (Part 2, UX
// consistency pass): explains why every action is hidden and cannot be
// resumed, without needing a dedicated detail view.
function poVoidTooltip(po) {
  const entry = poVoidAuditEntry(po);
  if (entry) {
    const lines = ['Source memo was voided', ''];
    lines.push('Reason:', entry.comment || '—', '');
    lines.push('Date:', entry.timestamp ? shortDate(entry.timestamp) : '—');
    return lines.join('\n');
  }
  // Fallback: no PO-side audit entry (the cascade hasn't run against this
  // record yet) — build the tooltip straight from the source memo's own
  // reason/date fields instead.
  if (!poIsVoidedSource(po)) return '';
  const memo = po.memoNo && typeof loadMemos === 'function' ? loadMemos().find(m => m.memoNo === po.memoNo) : null;
  if (!memo) return '';
  const byStatus = {
    voided:    { label: 'Source memo was voided',    reason: memo.voidReason,         at: memo.voidedAt },
    rejected:  { label: 'Source memo was rejected',  reason: memo.rejectionReason,    at: memo.rejectedAt },
    cancelled: { label: 'Source memo was cancelled', reason: memo.cancellationReason, at: memo.cancelledAt },
  }[memo.status];
  if (!byStatus) return '';
  const lines = [byStatus.label, ''];
  lines.push('Reason:', byStatus.reason || '—', '');
  lines.push('Date:', byStatus.at ? shortDate(byStatus.at) : '—');
  return lines.join('\n');
}

// Voided Hardware Memo downstream PO handling: mark every PO tied to the
// just-voided memo as a terminal 'voided_source' status. Never deletes a PO —
// only reachable POs have zero arrived devices (any arrived device already
// blocks the memo Void itself via memoHasIrreversibleDownstreamRecords()), so
// this only affects pending_order/ordered/awaiting POs in practice.
function cancelPurchaseOrdersForVoidedMemo(memoNo, reason) {
  const pos = loadPurchaseOrders();
  const affected = pos.filter(po => po.memoNo === memoNo && !['fulfilled', 'voided_source'].includes(po.status));
  affected.forEach(po => {
    const prevStatus = po.status;
    po.status = 'voided_source';
    po.updatedAt = new Date().toISOString();
    appendDeviceAuditLog(po, 'Voided (source memo voided)', {
      comment: reason || '',
      statusBefore: prevStatus,
      statusAfter: 'voided_source',
    });
    savePurchaseOrderAsync(po).catch(e => console.warn('PO void-cascade update failed', e));
  });
  if (affected.length) storePurchaseOrders(pos);
  return affected;
}

function poActionBtn(po) {
  const s = poEffectiveStatus(po);
  if (s === 'pending_order')
    return `<button class="btn-sm" style="font-size:11px;background:#185FA5;color:#fff;border-color:transparent" onclick="advancePOStatus('${esc(po.id)}','ordered')">Mark ordered</button>`;
  if (s === 'ordered')
    return `<button class="btn-sm" style="font-size:11px" onclick="advancePOStatus('${esc(po.id)}','awaiting')">Mark awaiting</button>`;
  if (s === 'awaiting' || s === 'partial_arrived')
    return `<button class="btn-sm" style="font-size:11px;background:#185FA5;color:#fff;border-color:transparent" onclick="openMarkArrivedModal('${esc(po.id)}')">+ Mark arrived</button>`;
  if (s === 'fulfilled')
    // Device Management D2 (Part 3) — scoped to this PO's own devices, same
    // as the Devices column's drill-down link, instead of jumping to an
    // unfiltered Device Registry.
    return `<button class="btn-sm" style="font-size:11px;color:var(--text-3)" onclick="viewDevicesForPO('${esc(po.id)}')">View devices</button>`;
  return '';
}

function advancePOStatus(poId, newStatus) {
  const pos = loadPurchaseOrders();
  const po = pos.find(p => p.id === poId);
  if (!po) return;
  const prevStatus = po.status;
  po.status = newStatus;
  po.updatedAt = new Date().toISOString();
  appendDeviceAuditLog(po, 'Status changed', { statusBefore: prevStatus, statusAfter: newStatus });
  storePurchaseOrders(pos);
  savePurchaseOrderAsync(po).catch(e => console.warn('PO advance failed', e));
  _poCache = null;
  _renderPOTable();
}

function _renderPOTable() {
  _renderPOContextBanner();
  const pos = loadPurchaseOrders();

  // KPIs — always computed on the unfiltered set (matches Device Registry's
  // metric cards, which also stay unfiltered).
  const active    = pos.filter(p => p.status !== 'fulfilled' && !poIsVoidedSource(p)).length;
  const awaitingUnits = pos.filter(p => ['ordered','awaiting'].includes(p.status) && !poIsVoidedSource(p)).reduce((s,p) => s+p.orderedQty,0);
  const partial   = pos.filter(p => p.status === 'partial_arrived').length;
  const fulfilled = pos.filter(p => p.status === 'fulfilled').length;
  const setText = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  setText('po-kpi-active',    active);
  setText('po-kpi-awaiting',  awaitingUnits);
  setText('po-kpi-partial',   partial);
  setText('po-kpi-fulfilled', fulfilled);

  const badge = document.getElementById('dev-po-badge');
  if (badge) { badge.textContent = active > 0 ? active : ''; badge.style.display = active > 0 ? '' : 'none'; }

  const tbody = document.getElementById('po-table-body');
  if (!tbody) return;

  if (!pos.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="hist-empty">No purchase orders found — approve a Hardware memo to create one automatically.</td></tr>`;
    const countEl = document.getElementById('po-visible-count');
    if(countEl) countEl.textContent = '';
    return;
  }

  const visible = _filteredPOs(pos);
  const countEl = document.getElementById('po-visible-count');
  if(countEl) countEl.textContent = visible.length === pos.length ? `${pos.length} orders` : `Showing ${visible.length} of ${pos.length} orders`;

  if (!visible.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="hist-empty">No purchase orders found. Try changing filters.</td></tr>`;
    return;
  }

  // Sort: active first (by status order), then fulfilled, then voided source
  const statusOrder = { pending_order:0, ordered:1, awaiting:2, partial_arrived:3, fulfilled:4, voided_source:5 };
  const sorted = [...visible].sort((a,b) => (statusOrder[poEffectiveStatus(a)]||99) - (statusOrder[poEffectiveStatus(b)]||99));

  tbody.innerHTML = sorted.map(po => {
    const pct = po.orderedQty > 0 ? Math.round(po.arrivedQty / po.orderedQty * 100) : 0;
    const barColor = pct >= 100 ? '#3B6D11' : '#185FA5';
    const voidTooltip = poVoidTooltip(po);
    const remaining = po.orderedQty - po.arrivedQty; // derived only, never persisted
    const devCount = _devicesCountForPO(po);
    return `<tr style="${po.status==='fulfilled'||poIsVoidedSource(po)?'opacity:0.7':''}">
      <td style="color:#185FA5;font-weight:500;cursor:pointer;padding:9px 12px" onclick="typeof openMemoReadOnly==='function'&&openMemoReadOnly('${esc(po.memoNo)}')">${esc(po.memoNo)}</td>
      <td style="padding:9px 12px;font-size:12px">${esc(po.itemName)}</td>
      <td style="padding:9px 12px;font-size:12px">${esc(po.project||'—')}</td>
      <td style="padding:9px 12px;text-align:center;font-size:12px">${po.orderedQty}</td>
      <td style="padding:9px 12px;text-align:center;font-size:12px;font-weight:500;color:${po.arrivedQty>0?'#3B6D11':'var(--text-3)'}">${po.arrivedQty||'—'}</td>
      <td style="padding:9px 12px;text-align:center;font-size:12px">${remaining}</td>
      <td style="padding:9px 12px">
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${barColor};border-radius:3px"></div>
          </div>
          <span style="font-size:10px;color:var(--text-3)">${po.arrivedQty}/${po.orderedQty}</span>
        </div>
      </td>
      <td style="padding:9px 12px"${voidTooltip ? ` title="${esc(voidTooltip)}"` : ''}>${poStatusBadgeHtml(po)}</td>
      <td style="padding:9px 12px;text-align:center">${devCount > 0
        ? `<span style="color:#185FA5;font-weight:500;cursor:pointer;text-decoration:underline" onclick="viewDevicesForPO('${esc(po.id)}')">${devCount} device${devCount>1?'s':''}</span>`
        : `<span style="color:var(--text-3)">0</span>`}</td>
      <td style="padding:9px 12px;white-space:nowrap">${poActionBtn(po)}</td>
    </tr>`;
  }).join('');
}

// ── Mark Arrived Modal ──
function openMarkArrivedModal(poId) {
  const po = loadPurchaseOrders().find(p => p.id === poId);
  if (!po) return;
  if (!['awaiting', 'partial_arrived'].includes(po.status)) {
    alert('กรุณา Mark awaiting ก่อน แล้วจึงกด Mark arrived');
    return;
  }
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
    _poCache = null; // clear PO cache so loadPurchaseOrders reads fresh
    // _devCache stays intact — storeDevices keeps it updated
    _renderPOTable();
    _renderDeviceTable();
  });
}

document.addEventListener('click', e => {
  if (e.target === document.getElementById('mark-arrived-modal')) closeMarkArrivedModal();
});
