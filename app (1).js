// ─────────────────────────────────────────
// Supabase client + storage layer
// Replaces localStorage for memos, licenses, devices
// ─────────────────────────────────────────
const SUPA_URL = 'https://wokqtivoytzgfuelgeho.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indva3F0aXZveXR6Z2Z1ZWxnZWhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNTU1NjIsImV4cCI6MjA5NDgzMTU2Mn0.oGoGLusBPA-P3dIDANOrqdgV9aqiAdPhVE9dGcE0H-Q';

// ── Supabase REST helper ──
async function supaFetch(table, method='GET', body=null, query='') {
  const url = SUPA_URL + '/rest/v1/' + table + query;
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': (method === 'POST' && query.includes('on_conflict')) ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
  };
  if(method === 'GET') headers['Accept'] = 'application/json';
  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  if(!resp.ok) {
    const err = await resp.text();
    throw new Error('Supabase ' + method + ' ' + table + ': ' + err);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

// ── Memo field mapping: JS camelCase ↔ DB snake_case ──
function memoToDb(m) {
  return {
    id: m.id || m.memoNo,
    memo_no: m.memoNo,
    type: m.type, type_label: m.typeLabel,
    status: m.status || 'pending',
    project: m.project, subject: m.subject, reason: m.reason,
    to: m.to, date: m.date, total: Number(m.total)||0,
    amount_words: m.amountWords,
    requester_name: m.requesterName, requester_title: m.requesterTitle,
    reviewer_name: m.reviewerName, reviewer_title: m.reviewerTitle, reviewer_date: m.reviewerDate,
    approver_name: m.approverName, approver_title: m.approverTitle, approver_date: m.approverDate,
    approvers: m.approvers || [],
    approved_by: m.approvedBy, rejected_by: m.rejectedBy,
    approval_note: m.approvalNote, rejection_reason: m.rejectionReason,
    pmo_override_note: m.pmoOverrideNote || null,
    pmo_override_by: m.pmoOverrideBy || null,
    fx_rate: m.fxRate || null,
    sections: m.sections || [], sl_items: m.slItems || [], audit_log: m.auditLog || [],
    budget_source:  m.budgetSource  || null,
    budget_pool_id: m.budgetPoolId  || null,
    // INT fields
    int_activity:  m.intActivity  || null,
    int_date:      m.intDate      || null,
    int_headcount: m.intHeadcount || null,
    int_pp:        m.intPP        || null,
    // ENT fields
    ent_client: m.entClient || null,
    ent_date:   m.entDate   || null,
    ent_place:  m.entPlace  || null,
    ent_people: m.entPeople || null,
    // DEP fields
    dep_location:  m.depLocation  || null,
    dep_start:     m.depStart     || null,
    dep_end:       m.depEnd       || null,
    dep_emp_count: m.depEmpCount  || null,
    pmo_evidence_url:      m.pmoEvidenceUrl      || null,
    approval_evidence_url: m.approvalEvidenceUrl || null,
    submitted_at: m.submittedAt || null,
    approved_at: m.approvedAt || null, rejected_at: m.rejectedAt || null,
    created_at: m.createdAt || new Date().toISOString(),
    updated_at: m.updatedAt || new Date().toISOString(),
  };
}
function dbToMemo(r) {
  return {
    id: r.memo_no, memoNo: r.memo_no,
    type: r.type, typeLabel: r.type_label,
    status: r.status, project: r.project, subject: r.subject, reason: r.reason,
    to: r.to, date: r.date, total: Number(r.total)||0, amountWords: r.amount_words,
    requesterName: r.requester_name, requesterTitle: r.requester_title,
    reviewerName: r.reviewer_name, reviewerTitle: r.reviewer_title, reviewerDate: r.reviewer_date,
    approverName: r.approver_name, approverTitle: r.approver_title, approverDate: r.approver_date,
    approvers: r.approvers || [],
    approvedBy: r.approved_by, rejectedBy: r.rejected_by,
    approvalNote: r.approval_note, rejectionReason: r.rejection_reason,
    pmoOverrideNote: r.pmo_override_note || null, pmoOverrideBy: r.pmo_override_by || null,
    entClient: r.ent_client || null, entDate: r.ent_date || null,
    entTime: r.ent_time || null, entPlace: r.ent_place || null, entPeople: r.ent_people || null,
    intActivity:  r.int_activity  || null,
    intDate:      r.int_date      || null,
    intHeadcount: r.int_headcount || null,
    intPP:        r.int_pp        || null,
    depLocation:  r.dep_location  || null,
    depStart:     r.dep_start     || null,
    depEnd:       r.dep_end       || null,
    depEmpCount:  r.dep_emp_count || null,
    fxRate: r.fx_rate, sections: r.sections || [], slItems: r.sl_items || [], auditLog: r.audit_log || [],
    budgetSource:  r.budget_source   || null,
    budgetPoolId:  r.budget_pool_id  || null,
    pmoEvidenceUrl:      r.pmo_evidence_url      || null,   // available after ALTER TABLE
    approvalEvidenceUrl: r.approval_evidence_url || null,   // available after ALTER TABLE
    submittedAt: r.submitted_at, approvedAt: r.approved_at, rejectedAt: r.rejected_at,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ── Memo storage (async, with localStorage fallback) ──
const MEMO_KEY = 'orbit-pmo-memos-v1';
let _memCache = null;
let _supaAvailable = null;

async function checkSupa() {
  if(_supaAvailable !== null) return _supaAvailable;
  try {
    await supaFetch('memos', 'GET', null, '?limit=1');
    _supaAvailable = true;
  } catch(e) {
    console.warn('Supabase unavailable, using localStorage', e.message);
    _supaAvailable = false;
  }
  return _supaAvailable;
}

async function loadMemosAsync() {
  if(await checkSupa()) {
    try {
      const rows = await supaFetch('memos', 'GET', null, '?order=created_at.desc&limit=500');
      _memCache = (rows||[]).map(dbToMemo);
      return _memCache;
    } catch(e) {
      console.warn('Supabase read failed, using cache');
      if (_memCache) return _memCache;
    }
  }
  // Offline fallback: localStorage
  try { const p = JSON.parse(localStorage.getItem(MEMO_KEY)||'[]'); return Array.isArray(p)?p:[]; }
  catch(e) { return []; }
}

async function saveMemoAsync(data) {
  const now = new Date().toISOString();
  const existing = loadMemos().find(m => m.memoNo === data.memoNo);
  const saved = { ...data, id:data.memoNo, status:data.status||'pending',
    createdAt: existing ? existing.createdAt : now, updatedAt: now };

  if(await checkSupa()) {
    try {
      const db = memoToDb(saved);
      await supaFetch('memos', 'POST', db, '?on_conflict=memo_no');
      // update cache directly — no need to re-fetch
      if (_memCache) {
        const ci = _memCache.findIndex(m => m.memoNo === saved.memoNo);
        if (ci >= 0) _memCache[ci] = saved; else _memCache.unshift(saved);
      } else {
        _memCache = [saved];
      }
      return saved;
    } catch(e) { console.warn('Supabase save failed', e.message); }
  }
  // Offline fallback: localStorage
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === data.memoNo);
  if(idx>=0) memos[idx]=saved; else memos.push(saved);
  storeMemos(memos);
  return saved;
}

async function updateMemoStatusAsync(memoNo, status, extra={}) {
  // Read from cache first (fastest), fall back to Supabase if not found
  let memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) {
    const freshMemos = await loadMemosAsync();
    memo = freshMemos.find(m => m.memoNo === memoNo);
  }
  if (!memo) return null;

  // ── Terminal state guard ──
  // completed and rejected memos cannot be changed except by PMO override
  const isPmoOverride = extra.pmoOverrideNote || extra.pmoOverrideBy;
  const isTerminal    = memo.status === 'completed' || memo.status === 'rejected' || memo.status === 'cancelled';
  if (isTerminal && !isPmoOverride) return memo; // silently return current state

  // ── Approver order enforcement ──
  // Prevent A2 from approving if A1 hasn't approved yet
  if (status === 'approved_a2' && memo.status !== 'pending_a2') return memo;
  if (status === 'approved_a3' && memo.status !== 'pending_a3') return memo;

  const now     = new Date().toISOString();
  const updated = { ...memo, ...extra, status, updatedAt: now };

  // ── Multi-approver flow logic ──
  const approvers = memo.approvers || [];
  const currentPendingIdx = approvers.findIndex(a => !a.status || a.status === 'pending');

  if (status === 'approved_a1' || status === 'approved_a2' || status === 'approved_a3') {
    // Find which approver is approving
    const approvingIdx = status === 'approved_a1' ? 0 : status === 'approved_a2' ? 1 : 2;
    const nextIdx = approvingIdx + 1;

    updated.approvers = approvers.map((a, i) =>
      i === approvingIdx
        ? { ...a, status: 'approved', approvedAt: now, approvedBy: extra.approvedBy || currentUser() }
        : a
    );

    if (nextIdx < approvers.length && approvers[nextIdx]) {
      // Still more approvers
      updated.status = nextIdx === 1 ? 'pending_a2' : 'pending_a3';
    } else {
      // All done
      updated.status    = 'completed';
      updated.approvedAt = now;
    }
    updated.approvedAt = now;
  } else if (status === 'cancelled') {
    updated.cancelledAt = extra.cancelledAt || now;
  } else if (status === 'rejected') {
    updated.rejectedAt = now;
    // Mark current pending approver as rejected
    const pendingIdx = approvers.findIndex(a => !a.status || a.status === 'pending');
    if (pendingIdx >= 0) {
      updated.approvers = approvers.map((a, i) =>
        i === pendingIdx ? { ...a, status: 'rejected', rejectedAt: now, rejectedBy: extra.rejectedBy || currentUser() } : a
      );
    }
  }

  // Sync to Supabase
  if (await checkSupa()) {
    try {
      const toSnake = s => s.replace(/([A-Z])/g, '_$1').toLowerCase();
      // Only exclude auditLog (handled separately above) and evidence URLs (now in DB)
      const PENDING_COLUMNS = new Set(['auditLog']);
      const patch = {
        status: updated.status,
        updated_at: now,
        approvers: updated.approvers,
        audit_log: extra.auditLog || updated.auditLog || memo.auditLog || [],
        ...Object.fromEntries(
          Object.entries(extra)
            .filter(([k]) => !PENDING_COLUMNS.has(k))
            .map(([k,v]) => [toSnake(k), v])
        )
      };
      if (updated.approvedAt)  patch.approved_at  = updated.approvedAt;
      if (updated.rejectedAt)  patch.rejected_at  = updated.rejectedAt;
      if (updated.cancelledAt) patch.cancelled_at = updated.cancelledAt;
      await supaFetch('memos', 'PATCH', patch, '?memo_no=eq.' + encodeURIComponent(memoNo));
    } catch(e) { console.warn('Supabase patch failed', e.message); }
  }

  // Update in-memory cache (always — whether Supabase succeeded or not)
  if (!_memCache) _memCache = [];
  const cacheIdx = _memCache.findIndex(m => m.memoNo === memoNo);
  if (cacheIdx >= 0) _memCache[cacheIdx] = updated;
  else _memCache.unshift(updated);

  // Side effects on completion
  if (updated.status === 'completed') {
    if (typeof createPurchaseOrdersFromMemo === 'function') {
      createPurchaseOrdersFromMemo(updated);
    }
  }

  // Safe render — only if DOM is ready
  try { if (typeof renderPendingMemos === 'function') renderPendingMemos(); } catch(e) {}
  try { if (typeof renderHistoryMemos === 'function') renderHistoryMemos(); } catch(e) {}

  return updated;
}

// ── Sync: push all localStorage memos to Supabase ──
async function syncLocalToSupabase() {
  if(!(await checkSupa())) return { ok:false, msg:'Supabase unavailable' };
  const local = loadMemos();
  if(!local.length) return { ok:true, pushed:0 };
  let pushed = 0;
  for(const m of local) {
    try {
      await supaFetch('memos', 'POST', memoToDb(m), '?on_conflict=memo_no');
      pushed++;
    } catch(e) { console.warn('Sync failed for', m.memoNo, e.message); }
  }
  _memCache = null;
  return { ok:true, pushed };
}

// ─────────────────────────────────────────
// app.js — shared utils, storage, nav, PDF
// ─────────────────────────────────────────

// ── Date helpers ──
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function thaiDate(d) { return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} พ.ศ. ${d.getFullYear()+543}`; }
const TODAY = thaiDate(new Date());
const todayISO = new Date().toISOString().slice(0,10);

// ── Shared utils ──
function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function val(sel, root=document) { return root.querySelector(sel)?.value?.trim() || ''; }
function money(n) { return '฿' + (Number(n)||0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
function shortDate(iso) {
  if(!iso) return '-';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()+543).slice(-2)}`;
}
function dateInput(v) {
  if(!v) return '-';
  const d = new Date(v + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? v : thaiDate(d);
}
function badgeClass(type) {
  return { sl:'badge-blue', hw:'badge-gray', int:'badge-green', ent:'badge-amber', dep:'badge-purple' }[type] || 'badge-gray';
}
function table(headers, rows, numericIndexes=[], centerIndexes=[]) {
  const thStyle = 'background:#e8e8e8;color:#111;font-weight:600;padding:7px 10px;text-align:center;border:1px solid #ccc;font-size:12px';
  const tdBase  = 'padding:7px 10px;border:1px solid #ccc;font-size:12px';
  // Last row = total row if numericIndexes provided
  const bodyRows = rows.map((row, ri) => {
    const isLast = ri === rows.length - 1 && numericIndexes.length > 0;
    return '<tr>' + row.map((c,i) => {
      const align = numericIndexes.includes(i) ? 'center' : centerIndexes.includes(i) ? 'center' : 'left';
      const weight = numericIndexes.includes(i) ? 'font-weight:700;' : '';
      const bg = isLast ? 'background:#f0f0f0;' : '';
      return '<td style="' + tdBase + ';text-align:' + align + ';' + weight + bg + '">' + esc(c) + '</td>';
    }).join('') + '</tr>';
  });
  return '<table style="width:100%;border-collapse:collapse;margin:6px 0">'
    + '<thead><tr>' + headers.map(h => '<th style="' + thStyle + '">' + esc(h) + '</th>').join('') + '</tr></thead>'
    + '<tbody>' + bodyRows.join('') + '</tbody>'
    + '</table>';
}

// ── Storage ──
// _memCache is the single source of truth — populated from Supabase on app init
// localStorage kept only as offline fallback
let _memMemos = [];
function canUseLocalStorage() {
  try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return true; }
  catch(e) { return false; }
}
const HAS_LS = canUseLocalStorage();

function loadMemos() {
  // Prefer in-memory cache (populated from Supabase by loadMemosAsync on app init)
  if (_memCache && _memCache.length > 0) return _memCache;
  // Offline fallback: localStorage
  if (!HAS_LS) return _memMemos;
  try { const p = JSON.parse(localStorage.getItem(MEMO_KEY)||'[]'); return Array.isArray(p)?p:[]; }
  catch(e) { return _memMemos; }
}

function storeMemos(memos) {
  _memMemos = Array.isArray(memos) ? memos : [];
  // Always keep in-memory cache in sync
  _memCache = _memMemos;
  // localStorage as offline backup only
  if (!HAS_LS) return;
  try { localStorage.setItem(MEMO_KEY, JSON.stringify(_memMemos)); }
  catch(e) { console.warn('localStorage write failed'); }
}
function currentMemoPrefix() {
  const d = new Date();
  return `ORB-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextMemoNo() {
  const prefix = currentMemoPrefix();
  const max = loadMemos().reduce((m,memo) => {
    const match = String(memo.memoNo||'').match(new RegExp(`^${prefix}-(\\d{3})$`));
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `${prefix}-${String(max+1).padStart(3,'0')}`;
}
function setNextMemoNo() {
  const el = document.getElementById('f-memo-no');
  if(el && !el.value.trim()) el.value = nextMemoNo();
}
function saveMemo(data) {
  // Sync version for backward compat — pushes to Supabase async in background
  const now = new Date().toISOString();
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === data.memoNo);
  const existing = idx >= 0 ? memos[idx] : null;
  const saved = {
    ...data,
    id:          data.memoNo,
    status:      data.status || 'pending',
    createdAt:   existing?.createdAt || data.createdAt || now,
    updatedAt:   now,
  };
  if (!saved.submittedAt && saved.status !== 'draft') {
    saved.submittedAt = existing?.submittedAt || now;
  }
  // Update in-memory cache immediately
  if (!_memCache) _memCache = [];
  const ci = _memCache.findIndex(m => m.memoNo === saved.memoNo);
  if (ci >= 0) _memCache[ci] = saved; else _memCache.unshift(saved);
  // Async push to Supabase in background
  saveMemoAsync(saved).catch(e => console.warn('Background Supabase save failed', e));
  return saved;
}
function updateMemoStatus(memoNo, status, extra={}) {
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === memoNo);
  if(idx<0) { alert('ไม่พบ Memo ที่เลือก'); return null; }
  memos[idx] = { ...memos[idx], ...extra, status, updatedAt: new Date().toISOString() };
  if(status==='completed') memos[idx].approvedAt = memos[idx].updatedAt;
  if(status==='rejected')  memos[idx].rejectedAt = memos[idx].updatedAt;
  storeMemos(memos);
  // _memCache is already updated by storeMemos — do not null it here
  // Auto-create purchase orders for HW memos (sync only — avoid double-firing)
  if(status === 'completed' && memos[idx].type === 'hw') {
    if(typeof createPurchaseOrdersFromMemo === 'function') {
      createPurchaseOrdersFromMemo(memos[idx]);
    }
  }
  renderPendingMemos();
  renderHistoryMemos();
  updateMemoStatusAsync(memoNo, status, extra)
    .then(() => { renderPendingMemos(); renderHistoryMemos(); })
    .catch(e => console.warn('Supabase status update failed', e));
  return memos[idx];
}

// ── Navigation ──
function swView(id, el, title) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sb-sub-item').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  document.getElementById('page-title').textContent = title;
  if(el) el.classList.add('active');
  if(['create','pending','history'].includes(id)) document.getElementById('nav-memo').classList.add('active');
  if(id === 'budget')  renderBudget();
  if(id === 'license') renderLicense();
  if(id === 'device')  renderDevice();
  if(id === 'history') { renderHistoryMemos(); if(typeof populateHistTabCounts==='function') populateHistTabCounts(); }
  if(id === 'pending') renderPendingMemos();

  if(id === 'resource') { if(typeof renderResource==='function') renderResource(); }
  if(id === 'settings') { if(typeof renderSettings==='function') renderSettings(); }
}
function toggleMemoSub(el) {
  el.classList.add('active');
  swView('create', document.querySelector('#memo-sub .sb-sub-item'), 'Create Memo');
}

// ── PDF ──
function renderMemoPdf(data) {
  // Use server CSS classes (.mp-*) — injected by PDF server with THSarabun font
  // Auto-derive data.to from last approver title if not set
  if(!data.to && data.approvers && data.approvers.length > 0) {
    data = Object.assign({}, data, { to: data.approvers[data.approvers.length-1].title || '' });
  }

  function fmtDate(v) {
    if(!v || v === '-') return '';
    // Already a Thai full date string e.g. "17 มิถุนายน 2569" — return as-is
    if(/[ก-๙]/.test(v)) return v;
    // ISO YYYY-MM-DD or any parseable → full Thai date
    const d = new Date(v.length===10 ? v+'T00:00:00' : v);
    if(isNaN(d.getTime())) return v;
    return thaiDate(d); // "17 มิถุนายน พ.ศ. 2569"
  }
  // YYYY-MM → "มิถุนายน 2569"
  function fmtMonth(v) {
    if(!v || v==='-') return v;
    const m = v.match(/^(\d{4})-(\d{2})$/);
    if(!m) return v;
    return `${MONTHS_TH[parseInt(m[2],10)-1]} ${parseInt(m[1])+543}`;
  }

  // ── Authority master table ──
  // Looks up spending limit by last approver's title and memo type
  const AUTHORITY_TABLE = {
    'ประธานเจ้าหน้าที่บริหาร': { sl:2000000, hw:2000000, ent:150000, int:2000000, dep:2000000 },
    'ผู้อำนวยการโครงการ':     { sl:500000,  hw:500000,  ent:150000, int:500000,  dep:500000  },
    'ผู้อำนวยการ':             { sl:500000,  hw:500000,  ent:150000, int:500000,  dep:500000  },
  };
  function getAuthority(memoType) {
    const approvers = data.approvers || [];
    const lastApprover = approvers.length > 0 ? approvers[approvers.length-1] : null;
    const title = lastApprover?.title || data.approverTitle || '';
    const row = AUTHORITY_TABLE[title] || AUTHORITY_TABLE['ประธานเจ้าหน้าที่บริหาร'];
    const limit = row[memoType] || 2000000;
    return { title: title || 'ประธานเจ้าหน้าที่บริหาร', limit };
  }
  function fmtLimit(n) { return (Number(n)||0).toLocaleString('th-TH',{maximumFractionDigits:0}); }

  // ── SL: collect software names from slItems ──
  const slProgramNames = (data.slItems||[]).filter(it=>it.name&&it.name!=='-').map(it=>it.name);
  const slProgramStr   = slProgramNames.length ? slProgramNames.join(', ') : 'โปรแกรม';

  const typeBody = {
    sl: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} - บริษัท ออร์บิท ดิจิทัล จำกัด มีความจำเป็นต้องใช้งานโปรแกรม ${esc(slProgramStr)} ${esc(data.reason||'')} จึงขออนุมัติงบประมาณเพื่อจัดซื้อโปรแกรมดังกล่าว ตามรายละเอียดดังต่อไปนี้`,
    hw: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด มีความจำเป็นต้องจัดซื้ออุปกรณ์ Hardware ${esc(data.reason||'')} จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    int: `เนื่องด้วยโครงการ ${esc(data.project||'-')} มีความประสงค์จัดกิจกรรม Team Activity ${esc(data.reason||'')} จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    ent: `สืบเนื่องจากพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด ได้วางแผนจัดงานบริษัทเลี้ยงรับรองลูกค้าเพื่อขอบคุณ ซึ่งจะจัดวันที่ ${esc(fmtDate(data.entDate)||'-')} สถานที่จัดคือ ${esc(data.entPlace||'-')} จำนวนผู้เข้าร่วมโดยประมาณ ${esc(data.entPeople||'-')} คน โดยกำหนดงบประมาณสำหรับค่าใช้จ่ายงานเลี้ยงรับรองลูกค้าเป็นจำนวนเงินไม่เกิน ${data.total ? (Number(data.total)||0).toLocaleString('th-TH',{maximumFractionDigits:0}) : '-'} บาท`,
    dep: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด วางแผนดำเนินการปฏิบัติงานที่ ${esc(data.depLocation||'-')} ในช่วงวันที่ ${esc(fmtDate(data.depStart)||'-')}${data.depEnd && data.depEnd !== data.depStart ? ` – ${esc(fmtDate(data.depEnd))}` : ''} โดยมีจำนวนทั้งสิ้น ${data.depEmpCount||'-'} คน โดยมีรายละเอียดดังต่อไปนี้`,
  };
  const bodyText = typeBody[data.type] || `ด้วยฝ่าย PMO มีความประสงค์ขออนุมัติรายการตามรายละเอียดด้านล่าง เพื่อสนับสนุนการดำเนินงานของโครงการ ${esc(data.project||'-')} ให้เป็นไปตามแผนงาน`;

  const amtStr = data.total ? `<strong>${(Number(data.total)||0).toLocaleString('th-TH', {maximumFractionDigits:0})} บาท</strong> (${esc(data.amountWords||'-')})` : '';
  const totalNoSign = data.total ? (Number(data.total)||0).toLocaleString('th-TH',{maximumFractionDigits:0}) : '-';

  const closingMap = {
    sl: data.total ? (function(){
      const slSection = (data.sections||[]).find(s => s.title === 'รายการ Software');
      let totalSeats = 0, months = 12;
      if(slSection && slSection.html) {
        const doc = new DOMParser().parseFromString(slSection.html, 'text/html');
        doc.querySelectorAll('tbody tr').forEach(row => {
          const cells = row.querySelectorAll('td');
          if(cells.length >= 5) {
            const mo  = parseInt(cells[4]?.textContent)||0;
            const qty = parseInt(cells[5]?.textContent)||0;
            if(mo)  months = mo;
            totalSeats += qty;
          }
        });
      }
      const auth = getAuthority('sl');
      const seatsStr  = totalSeats ? `จำนวนรวมทั้งหมด ${totalSeats} Seats ` : '';
      const monthsStr = `ระยะเวลา ${months} เดือน `;
      return `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณสำหรับค่าใช้จ่ายดังกล่าว รวมเป็นจำนวนเงินไม่เกิน ${amtStr} ${seatsStr}${monthsStr}อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระค่าบริการ ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท`;
    })() : '',
    hw: data.total ? (function(){
      const auth = getAuthority('hw');
      return `จึงขอความกรุณาโปรดพิจารณาอนุมัติค่าใช้จ่ายสำหรับรายการจัดซื้อข้างต้น ในวงเงิน ${amtStr} อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระเงินค่าสวัสดิการพนักงาน ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท`;
    })() : '',
    int: data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณสำหรับค่ากิจกรรมทีม ${esc(data.project||'-')} เพื่อใช้จัดกิจกรรมดังกล่าว เป็นวงเงินจำนวนไม่เกิน ${totalNoSign} บาท (${esc(data.amountWords||'-')})` : '',
    ent: data.total ? (function(){
      const auth = getAuthority('ent');
      return `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณค่ารับรองลูกค้าจาก ${esc(data.entClient||data.project||'-')} ในช่วงเวลาดังกล่าว อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2564 ข้อ 3.2 หมวดค่าเลี้ยงรับรอง วงเงินไม่เกิน ${fmtLimit(auth.limit)} บาท ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
    })() : '',
    dep: data.total ? (function(){
      const auth = getAuthority('dep');
      return `จึงขอความอนุเคราะห์อนุมัติการจัดซื้อสำหรับรายการจัดซื้อข้างต้น ในวงเงิน ${amtStr} อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระเงินค่าสวัสดิการพนักงาน ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท`;
    })() : '',
  };
  const closingText = closingMap[data.type] || (data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณรวมเป็นจำนวนเงินไม่เกิน ${amtStr}` : '');

  // sectionsHtml rendered inline below with fxNote injection

  const fxNote = data.type === 'sl'
    ? `<p class="mp-note">* <u>หมายเหตุ</u> : เรทราคาโปรแกรมดังกล่าวแปลงเรทเงินตราจากหน่วย USD เป็น THB ณ วันที่ ${esc(fmtDate(data.date)||TODAY)}${data.fxRate ? ` (1 USD = ฿${data.fxRate})` : ''}</p>`
    : '';

  // Dates stored as Thai strings from dateInput() — display directly
  // fmtDate only as safety net for raw ISO strings
  const reviewerDate = data.reviewerDate && data.reviewerDate !== '-' ? data.reviewerDate : (data.date||'');
  const approverDate = data.approverDate && data.approverDate !== '-' ? data.approverDate : (data.date||'');

  return `<div class="preview-wrap">
    <!-- Header row: memo no + date (logo injected by server) -->
    <div class="mp-hdr">
      <div class="mp-hdr-right">
        <div><strong>เลขที่</strong>&nbsp;&nbsp;${esc(data.memoNo)}</div>
        <div><strong>ลงวันที่</strong>&nbsp;&nbsp;${esc(fmtDate(data.date)||TODAY)}</div>
      </div>
    </div>

    <!-- Title -->
    <div class="mp-title">บันทึกข้อความ</div>

    <!-- เรื่อง / เรียน -->
    <div class="mp-field"><span class="mp-field-label">เรื่อง</span><span class="mp-field-value">${esc(data.subject||'-')}</span></div>
    <div class="mp-field"><span class="mp-field-label">เรียน</span><span class="mp-field-value">${esc(data.to||'-')}</span></div>

    <!-- Body -->
    <div class="mp-body"><p style="font-size:14pt;line-height:1.8;text-indent:2.5em">${bodyText}</p></div>

    <!-- Sections with fxNote after SL table -->
    ${(data.sections||[]).map(function(s){
      let html = s.html;

      if(s.title === 'รายการ Software') {
        const renameHeader = (from, to) => {
          html = html.replace(new RegExp('<th([^>]*)>' + from + '<\/th>', 'g'), '<th$1>' + to + '</th>');
        };
        renameHeader('#', 'No');
        renameHeader('ชื่อ Software', 'Item');
        renameHeader('฿\/เดือน', 'Price/Month (THB)');
        renameHeader('จำนวน', 'QTY (License)');
        renameHeader('รวม', 'Amount (THB)');
        renameHeader('เดือน', 'Month');
        renameHeader('เริ่ม', 'Start');
        renameHeader('สิ้นสุด', 'End');
        html = html.replace(/>([0-9]{4}-[0-9]{2})</g, function(m, v) {
          var parts = v.match(/^([0-9]{4})-([0-9]{2})$/);
          if (!parts) return m;
          return '>' + MONTHS_TH[parseInt(parts[2],10)-1] + ' ' + (parseInt(parts[1])+543) + '<';
        });
        html = html.replace(/<tr>(.*?)<\/tr>/gs, function(match, cells) {
          if(match.includes('<th')) return match;
          var tds = [];
          var idx = 0;
          cells.replace(/<td([^>]*)>(.*?)<\/td>/gs, function(m, attrs, content) {
            var isLeft = (idx === 1 || idx === 2);
            var isBold = attrs.includes('font-weight:700');
            tds.push('<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:'+(isLeft?'left':'center')+';'+(isBold?'font-weight:700;':'')+'">'+content+'</td>');
            idx++;
            return m;
          });
          return tds.length ? '<tr>'+tds.join('')+'</tr>' : match;
        });
        if(!html.includes('Total Amount') && data.total) {
          var totalRow = '<tr><td colspan="8" style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">Total Amount</td><td style="text-align:center;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
          html = html.replace('</tbody></table>', totalRow+'</tbody></table>');
        }
      }

      if(s.title === 'ตาราง Account') {
        html = html.replace('<thead><tr>', '<thead><tr><th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:40px">No</th>');
        var rowNum = 0;
        html = html.replace(/<tr>(.*?)<\/tr>/gs, function(match, cells) {
          if(match.includes('<th')) return match;
          rowNum++;
          var tds = ['<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center">'+rowNum+'</td>'];
          var idx = 0;
          cells.replace(/<td([^>]*)>(.*?)<\/td>/gs, function(m, attrs, content) {
            var isLeft = idx === 0;
            tds.push('<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:'+(isLeft?'left':'center')+'">'+content+'</td>');
            idx++;
            return m;
          });
          return tds.length > 1 ? '<tr>'+tds.join('')+'</tr>' : match;
        });
      }

      if(s.title === 'รายการ Hardware') {
        if(!html.includes('Total Amount') && data.total) {
          var thMatch = html.match(/<thead>(.*?)<\/thead>/s);
          var colCount = thMatch ? (thMatch[1].match(/<th/g)||[]).length : 5;
          var totalRow = '<tr><td colspan="'+(colCount-1)+'" style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">Total Amount</td><td style="text-align:center;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
          html = html.replace('</tbody></table>', totalRow+'</tbody></table>');
        }
      }

      if(s.title === 'รายการค่าใช้จ่าย') {
        // Convert <ol> list to numbered table for DEP
        if(html.includes('<ol')) {
          var depItems = [];
          html.replace(/<li>(.*?)<\/li>/g, function(m, item) { depItems.push(item.trim()); });
          var depRows = depItems.map(function(item, i) {
            return '<tr>'
              + '<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center;width:50px;vertical-align:top">'+(i+1)+'.</td>'
              + '<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:left">'+item+'</td>'
              + '</tr>';
          }).join('');
          html = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:50px">ที่</th>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt">รายการ</th>'
            + '</tr></thead><tbody>'+depRows+'</tbody></table>';
          if(!html.includes('Total Amount') && data.total) {
            var depTotal = '<tr><td style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center">รวม</td>'
              + '<td style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
            html = html.replace('</tbody></table>', depTotal+'</tbody></table>');
          }
        }
      }

      if(s.title === 'รายชื่อผู้เข้าร่วม') {
        if(!html.includes('<table') && html.includes('<ol')) {
          var names = [];
          html.replace(/<li>(.*?)<\/li>/g, function(m, name) { names.push(name.trim()); });
          var rows = names.map(function(n,i) {
            return '<tr><td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center;width:50px">'+(i+1)+'</td><td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:left">'+n+'</td></tr>';
          }).join('');
          html = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:50px">No.</th>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt">รายชื่อ</th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table>';
        }
      }

      return '<div style="margin-top:12px"><p style="font-weight:700;margin-bottom:6px">'+esc(s.title)+'</p>'+html+(s.title==='รายการ Software'?fxNote:'')+'</div>';
    }).join('')}



    <!-- Closing -->
    ${closingText ? `<div class="mp-closing"><p style="font-size:14pt;line-height:1.8;text-indent:2.5em">${closingText}</p></div>` : ''}

    <!-- Signature boxes -->
    ${(function(){
      // Build approver array — always minimum 2 (reviewer + approver)
      let arr = data.approvers && data.approvers.length > 0
        ? [...data.approvers]
        : [];
      // If only 1 approver, prepend a reviewer slot
      if(arr.length < 2) {
        const revName  = data.reviewerName  && data.reviewerName  !== '-' ? data.reviewerName  : '';
        const revTitle = data.reviewerTitle && data.reviewerTitle !== '-' ? data.reviewerTitle : 'ผู้จัดการโครงการ';
        if(revName) {
          // Use the actual status from approvers if the reviewer is already in the list
          const revEntry = (data.approvers||[]).find(a => a.name === revName);
          arr.unshift({ name: revName, title: revTitle,
            status: revEntry?.status || 'pending',
            approvedAt: revEntry?.approvedAt || null });
        } else if(arr.length === 1) {
          // Duplicate as reviewer — copy full entry including status
          arr.unshift({ ...arr[0], title: 'ผู้จัดการโครงการ' });
        } else {
          arr = [
            { name: data.reviewerName||'-', title: data.reviewerTitle||'ผู้จัดการโครงการ', status:'pending' },
            { name: data.approverName||'-', title: data.approverTitle||'ประธานเจ้าหน้าที่บริหาร', status:'pending' },
          ];
        }
      }
      return '<div class="mp-approval" style="display:grid;grid-template-columns:repeat('+arr.length+',1fr);gap:0;width:100%;margin-top:8px">'
        + arr.map(function(a, i) {
          const isFirst = i === 0;
          const isLast  = i === arr.length - 1;
          // A1 always has headText
          const headText = isFirst
            ? 'เรียน ' + esc(data.to || 'ผู้อำนวยการโครงการ') + ' เพื่อโปรดพิจารณาอนุมัติดำเนินการ'
            : '';
          // Options: A1=เห็นชอบ (multi) or อนุมัติ (single), Last=อนุมัติ, Middle=เห็นชอบ
          const optText = isFirst && arr.length === 1
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; อนุมัติ, เพื่อโปรดพิจารณาดำเนินการ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : isFirst && arr.length > 1
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; เห็นชอบ, เพื่อโปรดพิจารณาอนุมัติ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : isLast
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; อนุมัติ, เพื่อโปรดพิจารณาดำเนินการ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : '<div class="mp-appr-opt" style="font-size:12pt">&#9675; เห็นชอบ, เพื่อโปรดพิจารณาอนุมัติ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>';
          const sigDate = data.date || '';
          const isApproved = a.status === 'approved';
          const sigImgUrl  = isApproved ? getSignatureFromCache(a.name) : null;
          const sigHtml    = sigImgUrl
            ? `<div style="text-align:center;height:54px;display:flex;align-items:center;justify-content:center">` +
              `<img src="${sigImgUrl}" style="max-width:170px;max-height:52px;object-fit:contain"></div>`
            : `<div class="mp-sig-space" style="height:54px"></div>`;
          return '<div class="mp-appr-cell" style="font-size:12pt;padding:10px 12px;min-height:160px;display:flex;flex-direction:column;border:1px solid #000;'+(i>0?'margin-left:-1px;':'')+'">'
            + (headText ? '<div class="mp-appr-head" style="font-size:12pt">'+headText+'</div>' : '')
            + optText
            + '<div style="flex:1"></div>'
            + sigHtml
            + '<div class="mp-sig-name" style="font-size:12pt;font-weight:600;text-align:center">( '+esc(a.name||'-')+' )</div>'
            + '<div class="mp-sig-role" style="font-size:12pt;text-align:center">'+esc(a.title||'-')+'</div>'
            + '<div class="mp-sig-date" style="font-size:12pt;text-align:center">'+(isApproved ? sigDate : '')+'</div>'
            + '</div>';
        }).join('')
        + '</div>';
    })()}
    </div>
  </div>`;
}

const LOGO_B64 = 'data:image/png;base64,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';
// ── Normalise memo data before PDF render ────────────────────────
// Rebuilds sections[] from raw item fields when sections is empty.
// This ensures PDF output is identical whether generated at create-time
// or downloaded later from History/Pending tab.
function _normalisePdfData(data) {
  const d = Object.assign({}, data, { sections: (data.sections || []).slice() });

  function _tbl(headers, rows, numericIdx) {
    const thStyle = 'background:#e8e8e8;color:#111;font-weight:600;padding:5px 8px;border:1px solid #ccc;font-size:12pt;text-align:center';
    const ths = headers.map(h => `<th style="${thStyle}">${h}</th>`).join('');
    const trs = rows.map(r => `<tr>${r.map((c, i) => {
      const align = numericIdx.includes(i) ? 'right' : i <= 1 ? 'left' : 'center';
      return `<td style="padding:6px 8px;border:1px solid #ccc;font-size:12pt;text-align:${align}">${c ?? ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<table style="width:100%;border-collapse:collapse"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  // SL — rebuild from slItems if no software section
  if (d.type === 'sl' && !(d.sections.find(s => s.title === 'รายการ Software')) && (d.slItems||[]).length) {
    const rows = d.slItems.map((it, i) => [
      i+1, it.name||'—', it.plan||'—',
      it.price ? money(it.price) : '—',
      it.months||'—', it.qty||'—',
      it.startMonth||'—', it.endMonth||'—',
      (it.price&&it.months&&it.qty) ? money(it.price*it.months*it.qty) : '—',
    ]);
    d.sections.unshift({ title:'รายการ Software', html: _tbl(
      ['#','ชื่อ Software','Plan','฿/เดือน','เดือน','จำนวน','เริ่ม','สิ้นสุด','รวม'], rows, [3,8]
    )});
  }

  // HW — rebuild from hwItems if no hardware section
  if (d.type === 'hw' && !(d.sections.find(s => s.title === 'รายการ Hardware')) && (d.hwItems||[]).length) {
    const rows = d.hwItems.map((it, i) => [
      i+1, it.name||'—',
      it.price ? money(it.price) : '—',
      it.qty||'—',
      (it.price&&it.qty) ? money(it.price*it.qty) : '—',
    ]);
    d.sections.push({ title:'รายการ Hardware', html: _tbl(
      ['#','ชื่ออุปกรณ์','ราคา/ชิ้น','จำนวน','รวม'], rows, [2,4]
    )});
  }

  return d;
}

async function downloadMemoPdf(data) {
  // ── Ensure sections are populated before PDF render ──────────────
  data = _normalisePdfData(data);

  // ── Preload signatures for all approvers ─────────────────────────
  // Also include legacy reviewerName/approverName fields used in PDF arr construction
  if (typeof _preloadSignatures === 'function') {
    const approversList = [...(data.approvers || [])];
    // Add legacy reviewer/approver if they have names not already in list
    if (data.reviewerName && data.reviewerName !== '-') {
      if (!approversList.find(a => a.name === data.reviewerName)) {
        approversList.push({ name: data.reviewerName, status: 'pending' });
      }
    }
    if (data.approverName && data.approverName !== '-') {
      if (!approversList.find(a => a.name === data.approverName)) {
        approversList.push({ name: data.approverName, status: 'pending' });
      }
    }
    await _preloadSignatures(approversList);
  }

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = renderMemoPdf(data);
  // File naming: [TYPE]_[MemoNo]_[Project]_[Extra]_[Date].Ver1.0.0
  const typeTag = ({ sl:'SL', hw:'HW', int:'INT', ent:'EXT', dep:'DEP' }[data.type] || data.type?.toUpperCase() || 'MEMO');
  const proj    = (data.project || '').replace(/\s+/g,'');
  const memoNo  = (data.memoNo  || 'memo').replace(/\s+/g,'');
  const dateStr = (data.date    || new Date().toISOString().slice(0,10)).replace(/\//g,'-').replace(/\s.*/,'');

  let extra = '';
  if(data.type === 'sl') {
    // Read first software name from memo sections data, NOT from live form DOM
    const slSection = (data.sections||[]).find(s => s.title === 'รายการ Software');
    let firstName = '';
    if (slSection?.html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = slSection.html;
      const firstTd = tmp.querySelector('tbody tr td:nth-child(2)');
      firstName = firstTd?.textContent?.trim() || '';
    }
    // Fallback to slItems array
    if (!firstName) {
      firstName = (data.slItems||[]).find(it => it.name && it.name !== '-')?.name || '';
    }
    extra = firstName ? '_' + firstName.replace(/\s+/g,'') : '';
  }

  const filename = `[${typeTag}]_${memoNo}_${proj}${extra}_${dateStr}.Ver1.0.0.pdf`;
  async function fetchWithRetry(url, opts, ms=55000, retries=2) {
    for(let i=0; i<=retries; i++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try {
        const r = await fetch(url, {...opts, signal:ctrl.signal});
        clearTimeout(t); return r;
      } catch(e) { clearTimeout(t); if(i===retries) throw e; await new Promise(r=>setTimeout(r,2000)); }
    }
  }
  // ── Show loading indicator ────────────────────────────────────────
  const loadingEl = document.createElement('div');
  loadingEl.id = 'pdf-loading-overlay';
  loadingEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px';
  loadingEl.innerHTML = '<div style="background:#fff;border-radius:12px;padding:28px 36px;text-align:center;font-family:\'IBM Plex Sans Thai\',sans-serif">'
    + '<div style="font-size:15px;font-weight:600;color:#185FA5;margin-bottom:8px">⏳ กำลังสร้าง PDF...</div>'
    + '<div id="pdf-loading-msg" style="font-size:12px;color:#666">กรุณารอสักครู่</div>'
    + '</div>';
  document.body.appendChild(loadingEl);
  const setMsg = msg => { const el = document.getElementById('pdf-loading-msg'); if(el) el.textContent = msg; };

  try {
    const html = stage.firstElementChild?.outerHTML || stage.innerHTML;
    setMsg('กำลังติดต่อ PDF server...');
    console.log('[PDF] Sending to server, html length:', html.length, 'filename:', filename);
    const resp = await fetchWithRetry('https://memo-pdf-server.onrender.com/generate-pdf', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ html, filename, logoBase64: LOGO_B64 })
    });
    if(!resp.ok) throw new Error('Server '+resp.status);
    setMsg('กำลัง download...');
    const blob = await resp.blob();
    console.log('[PDF] Received blob, size:', blob.size, 'bytes');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
    console.log('[PDF] Download triggered:', filename);
  } catch(err) {
    console.warn('[PDF] Server failed, fallback to print:', err.message);
    setMsg('Server ไม่ตอบสนอง — เปิด Print dialog แทน');
    await new Promise(r => setTimeout(r, 800));
    document.body.classList.add('printing-pdf');
    try { window.print(); } finally { document.body.classList.remove('printing-pdf'); }
  } finally {
    loadingEl.remove();
  }
}
function openMemoPdf(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if(!memo) { alert('ไม่พบ Memo'); return; }
  downloadMemoPdf(memo);
}

// ── Init ──
// ── Shared CSV export helper ──────────────────────────────────────
// UTF-8 CSV with BOM so Excel opens Thai text correctly
function _downloadCSV(filename, headers, rows) {
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Sidebar collapse ──────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  const collapsed = sb.classList.toggle('collapsed');
  try { localStorage.setItem('orbit-sb-collapsed', collapsed ? '1' : '0'); } catch(e) {}
}
function initSidebarState() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  try {
    if (localStorage.getItem('orbit-sb-collapsed') === '1') sb.classList.add('collapsed');
  } catch(e) {}
}

function initApp() {
  ['f-date','f-signdate','f-apprdate','sl-ratedate'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = todayISO;
  });

  renderPendingMemos();
  renderHistoryMemos();
  rebuildAcct();
  setInterval(() => fetch('https://memo-pdf-server.onrender.com/ping').catch(()=>{}), 4*60*1000);

  // Load all Supabase data on startup in parallel
  Promise.all([
    loadMemosAsync(),
    typeof loadManualLicensesAsync === 'function' ? loadManualLicensesAsync() : Promise.resolve(),
    typeof loadInfraCostsAsync     === 'function' ? loadInfraCostsAsync()     : Promise.resolve(),
    typeof loadBudgetsAsync        === 'function' ? loadBudgetsAsync()        : Promise.resolve(),
    typeof loadDevicesAsync        === 'function' ? loadDevicesAsync()        : Promise.resolve(),
    typeof loadPurchaseOrdersAsync === 'function' ? loadPurchaseOrdersAsync() : Promise.resolve(),
  ]).then(() => {
    renderPendingMemos();
    renderHistoryMemos();
  }).catch(e => console.warn('Supabase init load failed', e));
}
