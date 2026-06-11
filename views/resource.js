// ─────────────────────────────────────────
// views/resource.js — Resource Management
// Based on BRD v1.0 — Orbit Digital PMO
// ─────────────────────────────────────────

const RES_KEY = 'orbit-pmo-resources-v1';
let _resCache = null;

// ── Status config ──
const RES_STATUS = {
  pending:     { label:'Pending',             cls:'badge-gray',   th:'มีการ Request แล้ว รอดำเนินการ' },
  sourcing:    { label:'Sourcing',            cls:'badge-blue',   th:'อยู่ระหว่างหา Resource' },
  interviewing:{ label:'Interviewing',        cls:'badge-purple', th:'อยู่ระหว่างสัมภาษณ์' },
  offer:       { label:'Offer in Progress',   cls:'badge-amber',  th:'อยู่ระหว่างทำ Offer' },
  document:    { label:'Document Processing', cls:'badge-yellow', th:'อยู่ระหว่างจัดทำเอกสาร' },
  filled:      { label:'Filled',              cls:'badge-green',  th:'Resource เริ่มงานแล้ว' },
  mitigated:   { label:'Mitigated',           cls:'badge-teal',   th:'แก้ไขโดยใช้วิธีอื่น' },
  resolved:    { label:'Resolved',            cls:'badge-green',  th:'จัดการเรียบร้อยแล้ว' },
  cancelled:   { label:'Cancelled',           cls:'badge-red',    th:'ยกเลิก' },
};
const TERMINAL = ['filled','mitigated','resolved','cancelled'];
const OPEN     = ['pending','sourcing','interviewing','offer','document'];

// ── Dropdown options ──
const TEAM_OPTS    = ['BA','BE','FE','UX/UI','SA','PMO','PM','QA','Others'];
const LEVEL_OPTS   = ['Junior','Mid','Senior','Lead','Manager','Senior Manager','Director','Others'];
const HIRING_OPTS  = ['Permanent (Direct)','Secondment','Sub-contract','Others'];

// ── Storage ──
function loadResources() {
  if (_resCache) return _resCache;
  try {
    const d = JSON.parse(localStorage.getItem(RES_KEY) || '[]');
    _resCache = Array.isArray(d) ? d : [];
  } catch(e) { _resCache = []; }
  return _resCache;
}
function storeResources(list) {
  _resCache = list;
  try { localStorage.setItem(RES_KEY, JSON.stringify(list)); } catch(e) {}
}

async function loadResourcesAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('resource_requests', 'GET', null, '?order=created_at.desc&limit=500');
      _resCache = (rows || []).map(r => ({
        id:            r.id,
        resourceTeam:  r.resource_team,
        resourceTeamOther: r.resource_team_other || null,
        project:       r.project,
        projectOther:  r.project_other || null,
        position:      r.position,
        level:         r.level,
        levelOther:    r.level_other || null,
        hc:            r.hc,
        hiringType:    r.hiring_type,
        hiringTypeOther: r.hiring_type_other || null,
        startDate:     r.start_date,
        endDate:       r.end_date,
        requestDate:   r.request_date,
        resolvedDate:  r.resolved_date,
        remark:        r.remark,
        status:        r.status,
        requesterName: r.requester_name,
        transferFrom:  r.transfer_from,
        activityLog:   r.activity_log || [],
        createdAt:     r.created_at,
        updatedAt:     r.updated_at,
      }));
      try { localStorage.setItem(RES_KEY, JSON.stringify(_resCache)); } catch(e) {}
      return _resCache;
    } catch(e) { console.warn('Resource load failed', e.message); }
  }
  return loadResources();
}

async function saveResourceAsync(data) {
  const list = await loadResourcesAsync();
  const now  = new Date().toISOString();
  const isNew = !list.find(r => r.id === data.id);
  const saved = { ...data, updatedAt: now, createdAt: isNew ? now : (list.find(r => r.id === data.id)?.createdAt || now) };
  _resCache = isNew ? [...list, saved] : list.map(r => r.id === data.id ? saved : r);
  storeResources(_resCache);

  if (await checkSupa()) {
    try {
      await supaFetch('resource_requests', 'POST', {
        id:                  saved.id,
        resource_team:       saved.resourceTeam,
        resource_team_other: saved.resourceTeamOther || null,
        project:             saved.project,
        project_other:       saved.projectOther || null,
        position:            saved.position,
        level:               saved.level,
        level_other:         saved.levelOther || null,
        hc:                  saved.hc,
        hiring_type:         saved.hiringType,
        hiring_type_other:   saved.hiringTypeOther || null,
        start_date:          saved.startDate,
        end_date:            saved.endDate || null,
        request_date:        saved.requestDate,
        resolved_date:       saved.resolvedDate || null,
        remark:              saved.remark,
        status:              saved.status,
        requester_name:      saved.requesterName,
        transfer_from:       saved.transferFrom || null,
        activity_log:        saved.activityLog || [],
        created_at:          saved.createdAt,
        updated_at:          saved.updatedAt,
      }, '?on_conflict=id');
    } catch(e) { console.warn('Resource save failed', e.message); }
  }
  return saved;
}

// ── Safe unique ID using timestamp ──
function nextResId() {
  const d = new Date();
  return `RES-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}-${Date.now().toString(36).toUpperCase()}`;
}

// ── Helpers ──
function resDisplayTeam(r)    { return r.resourceTeam === 'Others' && r.resourceTeamOther ? r.resourceTeamOther : (r.resourceTeam || '—'); }
function resDisplayProject(r) { return r.project === 'Others' && r.projectOther ? r.projectOther : (r.project || '—'); }
function resDisplayLevel(r)   { return r.level === 'Others' && r.levelOther ? r.levelOther : (r.level || '—'); }
function resDisplayHiring(r)  { return r.hiringType === 'Others' && r.hiringTypeOther ? r.hiringTypeOther : (r.hiringType || '—'); }

// ── Main render ──
let _resPage    = 1;
const RES_PER_PAGE = 20;
let _resSortCol = 'requestDate';
let _resSortAsc = false;

async function renderResource() {
  try {
    const local = loadResources();
    if (local.length) _renderResourceUI(local);
    const all = await loadResourcesAsync();
    _renderResourceUI(all);
  } catch(e) {
    console.error('renderResource failed:', e);
    const kpiEl = document.getElementById('res-kpi');
    if (kpiEl) kpiEl.innerHTML = `<div style="color:var(--red);font-size:12px;padding:12px">Error: ${e.message}</div>`;
  }
}

function _renderResourceUI(all) {
  // ── KPI (3 cards) ──
  const open   = all.filter(r => OPEN.includes(r.status)).length;
  const pending = all.filter(r => r.status === 'pending').length;
  const inProg  = all.filter(r => ['sourcing','interviewing','offer','document'].includes(r.status)).length;

  const kpiEl = document.getElementById('res-kpi');
  if (kpiEl) kpiEl.innerHTML = `
    <div class="metric-card"><div class="metric-label">Total Open</div><div class="metric-val" style="color:var(--blue)">${open}</div><div class="metric-sub">OPEN requests</div></div>
    <div class="metric-card"><div class="metric-label">Pending</div><div class="metric-val" style="color:var(--text-2)">${pending}</div><div class="metric-sub">รอดำเนินการ</div></div>
    <div class="metric-card"><div class="metric-label">In Progress</div><div class="metric-val" style="color:var(--amber)">${inProg}</div><div class="metric-sub">Sourcing → Document</div></div>`;

  // ── Populate dynamic dropdowns ──
  _resPopulateProjectFilter(all);

  // ── Filters ──
  const search   = (document.getElementById('res-search')?.value || '').toLowerCase();
  const fStatus  = document.getElementById('res-f-status')?.value  || 'all';
  const fHiring  = document.getElementById('res-f-hiring')?.value  || 'all';
  const fProject = document.getElementById('res-f-project')?.value || 'all';
  const fTeam    = document.getElementById('res-f-team')?.value    || 'all';
  const fLevel   = document.getElementById('res-f-level')?.value   || 'all';

  let list = all;
  if (fStatus  !== 'all') list = list.filter(r => r.status === fStatus);
  if (fHiring  !== 'all') list = list.filter(r => resDisplayHiring(r) === fHiring);
  if (fProject !== 'all') list = list.filter(r => resDisplayProject(r) === fProject);
  if (fTeam    !== 'all') list = list.filter(r => resDisplayTeam(r) === fTeam);
  if (fLevel   !== 'all') list = list.filter(r => resDisplayLevel(r) === fLevel);
  if (search) list = list.filter(r =>
    `${resDisplayProject(r)} ${r.position} ${resDisplayTeam(r)} ${resDisplayLevel(r)}`.toLowerCase().includes(search));

  // ── Sort ──
  list = [...list].sort((a, b) => {
    let va = a[_resSortCol] || '', vb = b[_resSortCol] || '';
    return _resSortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  // ── Pagination ──
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / RES_PER_PAGE));
  if (_resPage > pages) _resPage = 1;
  const slice = list.slice((_resPage - 1) * RES_PER_PAGE, _resPage * RES_PER_PAGE);

  // ── Update sort header indicators ──
  document.querySelectorAll('.res-th-sort').forEach(th => {
    const col = th.dataset.col;
    const arrow = _resSortCol === col ? (_resSortAsc ? ' ▲' : ' ▼') : '';
    th.querySelector('.sort-arrow').textContent = arrow;
  });

  // ── Table ──
  const tbody = document.getElementById('res-table-body');
  if (!tbody) return;

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:34px;color:var(--text-3)">ยังไม่มี Resource Request — กด + New Request เพื่อเริ่ม</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(r => {
      const s = RES_STATUS[r.status] || { label: r.status, cls: 'badge-gray' };
      return `<tr style="cursor:pointer" onclick="openResDetail('${r.id}')">
        <td style="padding-left:12px;font-family:monospace;font-size:11px;color:var(--text-3)">${esc(r.id)}</td>
        <td>${esc(resDisplayTeam(r))}</td>
        <td><span style="font-weight:500">${esc(resDisplayProject(r))}</span></td>
        <td>${esc(r.position)}</td>
        <td><span class="badge badge-gray" style="font-size:10px">${esc(resDisplayLevel(r))}</span></td>
        <td style="text-align:center;font-weight:600">${r.hc}</td>
        <td style="font-size:11px">${esc(resDisplayHiring(r))}</td>
        <td style="font-size:11px">${r.startDate ? shortDate(r.startDate) : '—'}</td>
        <td style="font-size:11px">${r.endDate ? shortDate(r.endDate) : '—'}</td>
        <td style="font-size:11px">${r.requestDate ? shortDate(r.requestDate) : '—'}</td>
        <td style="font-size:11px">${r.resolvedDate ? shortDate(r.resolvedDate) : '—'}</td>
        <td><span class="badge ${s.cls}" style="font-size:10px;white-space:nowrap">${esc(s.label)}</span></td>
        <td style="text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
          <button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResDetail('${r.id}')">👁</button>
          <button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResModal('${r.id}')">✎</button>
          <button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResStatus('${r.id}')">⇄</button>
          ${r.status === 'filled' ? `<button class="btn-sm" style="font-size:10px;padding:2px 7px;color:var(--blue)" onclick="openResTransfer('${r.id}')">↗ Transfer</button>` : ''}
        </td>
      </tr>`;
    }).join('');
  }

  // ── Pagination ──
  const pagEl = document.getElementById('res-pagination');
  if (pagEl) pagEl.innerHTML = `
    <span style="font-size:12px;color:var(--text-3)">${total} รายการ | หน้า ${_resPage}/${pages}</span>
    <div style="display:flex;gap:4px">
      <button class="btn-sm" ${_resPage <= 1 ? 'disabled' : ''} onclick="_resPage=1;_renderResourceUI(loadResources())" style="padding:3px 8px">«</button>
      <button class="btn-sm" ${_resPage <= 1 ? 'disabled' : ''} onclick="_resPage--;_renderResourceUI(loadResources())" style="padding:3px 8px">‹</button>
      <button class="btn-sm" ${_resPage >= pages ? 'disabled' : ''} onclick="_resPage++;_renderResourceUI(loadResources())" style="padding:3px 8px">›</button>
      <button class="btn-sm" ${_resPage >= pages ? 'disabled' : ''} onclick="_resPage=pages;_renderResourceUI(loadResources())" style="padding:3px 8px">»</button>
    </div>`;
}

// ── Sort handler ──
function resSortBy(col) {
  if (_resSortCol === col) { _resSortAsc = !_resSortAsc; }
  else { _resSortCol = col; _resSortAsc = true; }
  _renderResourceUI(loadResources());
}

// ── Populate all filters dynamically from actual records ──
function _resPopulateProjectFilter(all) {
  _resPopulateFilter('res-f-project', all.map(r => resDisplayProject(r)));
  _resPopulateFilter('res-f-team',    all.map(r => resDisplayTeam(r)));
  _resPopulateFilter('res-f-level',   all.map(r => resDisplayLevel(r)));
  _resPopulateFilter('res-f-hiring',  all.map(r => resDisplayHiring(r)));
}

function _resPopulateFilter(selId, values) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const current = sel.value;
  const unique  = [...new Set(values.filter(Boolean))].sort();
  // Keep "all" option, rebuild the rest
  sel.innerHTML = `<option value="all">${sel.options[0]?.text || 'ทั้งหมด'}</option>` +
    unique.map(v => `<option value="${esc(v)}" ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('');
}

// ── New/Edit Modal ──
function openResModal(id) {
  const isEdit = !!id;
  const r = isEdit ? loadResources().find(x => x.id === id) : null;
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = [...(s?.projects || []), 'Others'];

  document.getElementById('res-modal-title').textContent = isEdit ? 'Edit Resource Request' : 'New Resource Request';
  document.getElementById('res-edit-id').value = id || '';

  const g = (fld, def = '') => r ? (r[fld] ?? def) : def;

  const teamOpts    = TEAM_OPTS.map(t => `<option value="${esc(t)}" ${g('resourceTeam') === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const levelOpts   = LEVEL_OPTS.map(l => `<option value="${esc(l)}" ${g('level') === l ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const hiringOpts  = HIRING_OPTS.map(h => `<option value="${esc(h)}" ${g('hiringType') === h ? 'selected' : ''}>${esc(h)}</option>`).join('');
  const projectOpts = projects.map(p => `<option value="${esc(p)}" ${g('project') === p ? 'selected' : ''}>${esc(p)}</option>`).join('');

  document.getElementById('res-form-body').innerHTML = `
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg">
        <label>Resource Team *</label>
        <select id="rf-team" class="ri" onchange="toggleOtherField('rf-team','rf-team-other-wrap')">${teamOpts}</select>
        <div id="rf-team-other-wrap" style="display:${g('resourceTeam') === 'Others' ? '' : 'none'};margin-top:6px">
          <input id="rf-team-other" class="ri" placeholder="ระบุ Team" value="${esc(g('resourceTeamOther'))}">
        </div>
      </div>
      <div class="fg">
        <label>โครงการ *</label>
        <select id="rf-project" class="ri" onchange="toggleOtherField('rf-project','rf-project-other-wrap')"><option value="">— เลือก —</option>${projectOpts}</select>
        <div id="rf-project-other-wrap" style="display:${g('project') === 'Others' ? '' : 'none'};margin-top:6px">
          <input id="rf-project-other" class="ri" placeholder="ระบุโครงการ" value="${esc(g('projectOther'))}">
        </div>
      </div>
      <div class="fg"><label>Position *</label><input id="rf-position" class="ri" placeholder="เช่น Senior Backend Developer" value="${esc(g('position'))}"></div>
      <div class="fg">
        <label>Level *</label>
        <select id="rf-level" class="ri" onchange="toggleOtherField('rf-level','rf-level-other-wrap')">${levelOpts}</select>
        <div id="rf-level-other-wrap" style="display:${g('level') === 'Others' ? '' : 'none'};margin-top:6px">
          <input id="rf-level-other" class="ri" placeholder="ระบุ Level" value="${esc(g('levelOther'))}">
        </div>
      </div>
      <div class="fg"><label>HC (Headcount) *</label><input id="rf-hc" class="ri" type="number" min="1" value="${g('hc', 1)}"></div>
      <div class="fg">
        <label>Hiring Type *</label>
        <select id="rf-hiring" class="ri" onchange="toggleOtherField('rf-hiring','rf-hiring-other-wrap')">${hiringOpts}</select>
        <div id="rf-hiring-other-wrap" style="display:${g('hiringType') === 'Others' ? '' : 'none'};margin-top:6px">
          <input id="rf-hiring-other" class="ri" placeholder="ระบุ Hiring Type" value="${esc(g('hiringTypeOther'))}">
        </div>
      </div>
      <div class="fg"><label>Start Date *</label><input id="rf-start" class="ri" type="date" value="${g('startDate')}"></div>
      <div class="fg"><label>End Date</label><input id="rf-end" class="ri" type="date" value="${g('endDate')}"></div>
      <div class="fg"><label>Requester Name</label><input id="rf-requester" class="ri" placeholder="ชื่อผู้ขอ" value="${esc(g('requesterName'))}"></div>
      <div class="fg"><label>Request Date</label><input id="rf-reqdate" class="ri" type="date" value="${g('requestDate', todayISO)}" readonly style="background:var(--bg)"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Remark</label><textarea id="rf-remark" class="ri" rows="3" placeholder="หมายเหตุ / เหตุผล">${esc(g('remark'))}</textarea></div>`;

  document.getElementById('resource-modal').style.display = 'flex';
}

// ── Toggle "Others" free-text fields ──
function toggleOtherField(selectId, wrapId) {
  const sel  = document.getElementById(selectId);
  const wrap = document.getElementById(wrapId);
  if (wrap) wrap.style.display = sel?.value === 'Others' ? '' : 'none';
}

function closeResModal() { document.getElementById('resource-modal').style.display = 'none'; }

async function saveResource() {
  const g = id => document.getElementById(id)?.value?.trim() || '';

  const team    = g('rf-team');
  const project = g('rf-project');
  const position = g('rf-position');
  const hc      = parseInt(g('rf-hc')) || 0;
  const hiring  = g('rf-hiring');
  const startDate = g('rf-start');
  const endDate   = g('rf-end');

  if (!team)     { alert('กรุณาเลือก Resource Team'); return; }
  if (!project)  { alert('กรุณาเลือกโครงการ'); return; }
  if (!position) { alert('กรุณากรอก Position'); return; }
  if (!hiring)   { alert('กรุณาเลือก Hiring Type'); return; }
  if (!startDate){ alert('กรุณาระบุ Start Date'); return; }
  if (hc < 1)    { alert('HC ต้องมีค่าอย่างน้อย 1'); return; }
  if (endDate && startDate && endDate < startDate) { alert('End Date ต้องอยู่หลัง Start Date'); return; }
  if (team === 'Others'    && !g('rf-team-other'))    { alert('กรุณาระบุ Team'); return; }
  if (project === 'Others' && !g('rf-project-other')) { alert('กรุณาระบุชื่อโครงการ'); return; }
  if (hiring === 'Others'  && !g('rf-hiring-other'))  { alert('กรุณาระบุ Hiring Type'); return; }

  const editId   = g('res-edit-id');
  const existing = editId ? loadResources().find(r => r.id === editId) : null;
  const now      = new Date().toISOString();
  const requester = g('rf-requester');

  const data = {
    id:                editId || nextResId(),
    resourceTeam:      team,
    resourceTeamOther: team === 'Others' ? g('rf-team-other') : null,
    project,
    projectOther:      project === 'Others' ? g('rf-project-other') : null,
    position,
    level:             g('rf-level'),
    levelOther:        g('rf-level') === 'Others' ? g('rf-level-other') : null,
    hc,
    hiringType:        hiring,
    hiringTypeOther:   hiring === 'Others' ? g('rf-hiring-other') : null,
    startDate,
    endDate:           endDate || null,
    requestDate:       g('rf-reqdate') || todayISO,
    resolvedDate:      existing?.resolvedDate || null,
    remark:            g('rf-remark'),
    status:            existing?.status || 'pending',
    requesterName:     requester,
    transferFrom:      existing?.transferFrom || null,
    activityLog: existing
      ? [...(existing.activityLog || []), { action: 'Edited', by: requester || 'PMO', at: now, remark: 'Record updated' }]
      : [{ action: 'Created', status: 'pending', by: requester || 'PMO', at: now }],
  };

  await saveResourceAsync(data);
  closeResModal();
  renderResource();
}

// ── Status change modal ──
function openResStatus(id) {
  const r = loadResources().find(x => x.id === id);
  if (!r) return;
  const s = RES_STATUS[r.status] || { label: r.status };
  const opts = Object.entries(RES_STATUS)
    .map(([k, v]) => `<option value="${k}" ${k === r.status ? 'selected' : ''}>${v.label}</option>`)
    .join('');

  document.getElementById('res-status-id').value = id;
  document.getElementById('res-status-current').innerHTML =
    `<span class="badge ${RES_STATUS[r.status]?.cls || 'badge-gray'}">${s.label}</span>
     <span style="font-size:12px;color:var(--text-2);margin-left:8px">${esc(r.position)} · ${esc(resDisplayProject(r))}</span>`;
  document.getElementById('res-status-select').innerHTML = opts;
  document.getElementById('res-status-remark').value = '';
  document.getElementById('resource-status-modal').style.display = 'flex';
}

function closeResStatus() { document.getElementById('resource-status-modal').style.display = 'none'; }

async function saveResStatus() {
  const id        = document.getElementById('res-status-id').value;
  const newStatus = document.getElementById('res-status-select').value;
  const remark    = document.getElementById('res-status-remark').value.trim();

  if (newStatus === 'cancelled' && !remark) { alert('กรุณากรอก Remark สำหรับการยกเลิก'); return; }

  const list = loadResources();
  const idx  = list.findIndex(r => r.id === id);
  if (idx < 0) return;

  const now     = new Date().toISOString();
  const prev    = list[idx];
  const isTerminal = TERMINAL.includes(newStatus);

  const logEntry = {
    action:  'Status changed',
    from:    prev.status,
    to:      newStatus,
    by:      'PMO',
    remark:  remark || null,
    at:      now,
  };

  const updated = {
    ...prev,
    status:       newStatus,
    resolvedDate: isTerminal && !prev.resolvedDate ? todayISO : prev.resolvedDate,
    updatedAt:    now,
    activityLog:  [...(prev.activityLog || []), logEntry],
    remark:       remark
      ? (prev.remark ? prev.remark + '\n' : '') + `[${new Date().toLocaleDateString('th-TH')}] ${remark}`
      : prev.remark,
  };

  await saveResourceAsync(updated);
  closeResStatus();
  renderResource();
}

// ── Transfer modal ──
function openResTransfer(id) {
  const r = loadResources().find(x => x.id === id);
  if (!r) return;
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = [...new Set([...(s?.projects || []), ...loadResources().map(x => x.project).filter(Boolean)])]
    .filter(p => p !== r.project && p !== 'Others')
    .sort();
  const projectOpts = projects.map(p => `<option>${esc(p)}</option>`).join('');

  document.getElementById('res-transfer-id').value = id;
  document.getElementById('res-transfer-body').innerHTML = `
    <p style="font-size:12px;color:var(--text-2);margin-bottom:12px">
      Transfer <strong>${esc(r.position)}</strong> (${esc(resDisplayTeam(r))}) จาก <strong>${esc(resDisplayProject(r))}</strong> ไปยัง:
    </p>
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>โครงการปลายทาง *</label>
        <select id="rtf-project" class="ri"><option value="">— เลือก —</option>${projectOpts}</select>
      </div>
      <div class="fg"><label>Start Date ใหม่ *</label><input id="rtf-start" class="ri" type="date" value="${todayISO}"></div>
      <div class="fg"><label>End Date</label><input id="rtf-end" class="ri" type="date" value="${r.endDate || ''}"></div>
    </div>
    <div class="fg" style="margin-top:10px">
      <label>เหตุผลในการ Transfer *</label>
      <textarea id="rtf-remark" class="ri" rows="2" placeholder="ระบุเหตุผล"></textarea>
    </div>`;
  document.getElementById('resource-transfer-modal').style.display = 'flex';
}

function closeResTransfer() { document.getElementById('resource-transfer-modal').style.display = 'none'; }

async function saveResTransfer() {
  const sourceId    = document.getElementById('res-transfer-id').value;
  const destProject = document.getElementById('rtf-project')?.value || '';
  const startDate   = document.getElementById('rtf-start')?.value || '';
  const endDate     = document.getElementById('rtf-end')?.value || '';
  const remark      = document.getElementById('rtf-remark')?.value?.trim() || '';

  if (!destProject) { alert('กรุณาเลือกโครงการปลายทาง'); return; }
  if (!startDate)   { alert('กรุณาระบุ Start Date'); return; }
  if (!remark)      { alert('กรุณาระบุเหตุผลในการ Transfer'); return; }

  const source = loadResources().find(r => r.id === sourceId);
  if (!source) return;
  const now    = new Date().toISOString();
  const newId  = nextResId();

  // Update source: resolved + log
  const updatedSource = {
    ...source,
    status:       'resolved',
    resolvedDate: todayISO,
    updatedAt:    now,
    activityLog:  [...(source.activityLog || []), {
      action: 'Transferred',
      to:     destProject,
      newId,
      by:     'PMO',
      remark,
      at:     now,
    }],
    remark: (source.remark ? source.remark + '\n' : '') + `[Transfer → ${destProject}] ${remark}`,
  };

  // New record for destination: starts as filled
  const newRecord = {
    id:                newId,
    resourceTeam:      source.resourceTeam,
    resourceTeamOther: source.resourceTeamOther || null,
    project:           destProject,
    projectOther:      null,
    position:          source.position,
    level:             source.level,
    levelOther:        source.levelOther || null,
    hc:                source.hc,
    hiringType:        source.hiringType,
    hiringTypeOther:   source.hiringTypeOther || null,
    startDate,
    endDate:           endDate || null,
    requestDate:       todayISO,
    resolvedDate:      todayISO,
    remark:            `Transferred from ${resDisplayProject(source)} (${sourceId})\n${remark}`,
    status:            'filled',
    requesterName:     source.requesterName,
    transferFrom:      sourceId,
    activityLog:       [{ action: 'Transfer received', from: resDisplayProject(source), sourceId, by: 'PMO', remark, at: now }],
    createdAt:         now,
    updatedAt:         now,
  };

  await saveResourceAsync(updatedSource);
  await saveResourceAsync(newRecord);
  closeResTransfer();
  renderResource();
  alert(`✓ Transfer เสร็จสิ้น\nสร้าง Request ใหม่ ${newId} สำหรับ ${destProject}`);
}

// ── Detail Drawer ──
function openResDetail(id) {
  const r = loadResources().find(x => x.id === id);
  if (!r) return;
  const s = RES_STATUS[r.status] || { label: r.status, cls: 'badge-gray' };

  const log = (r.activityLog || []).slice().reverse().map(l => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600">
        ${esc(l.action)}
        ${l.from ? `<span style="font-size:11px;font-weight:400;color:var(--text-3)"> ${l.from} → ${l.to || ''}</span>` : ''}
        ${l.to && !l.from ? `<span style="font-size:11px;font-weight:400;color:var(--text-3)"> → ${l.to}</span>` : ''}
      </div>
      ${l.remark ? `<div style="font-size:11px;color:var(--text-2);margin-top:2px">${esc(l.remark)}</div>` : ''}
      <div style="font-size:10px;color:var(--text-3);margin-top:2px">${esc(l.by || 'System')} · ${l.at ? new Date(l.at).toLocaleString('th-TH') : ''}</div>
    </div>`).join('');

  document.getElementById('res-detail-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(r.position)}</div>
        <div style="font-size:12px;color:var(--text-2)">${esc(resDisplayTeam(r))} · ${esc(resDisplayProject(r))}</div>
      </div>
      <span class="badge ${s.cls}">${s.label}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:12px">
      ${[
        ['ID',           r.id],
        ['Level',        resDisplayLevel(r)],
        ['HC',           r.hc],
        ['Hiring Type',  resDisplayHiring(r)],
        ['Start Date',   r.startDate   ? shortDate(r.startDate)   : '—'],
        ['End Date',     r.endDate     ? shortDate(r.endDate)     : '—'],
        ['Request Date', r.requestDate ? shortDate(r.requestDate) : '—'],
        ['Resolved Date',r.resolvedDate? shortDate(r.resolvedDate): '—'],
        ['Requester',    r.requesterName || '—'],
        ['Transfer From',r.transferFrom  || '—'],
      ].map(([k, v]) => `<div><span style="color:var(--text-3)">${k}</span><br><strong>${esc(String(v))}</strong></div>`).join('')}
    </div>
    ${r.remark ? `<div style="background:var(--bg);border-radius:var(--r-sm);padding:10px;font-size:12px;margin-bottom:16px;white-space:pre-wrap">${esc(r.remark)}</div>` : ''}
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-2)">Activity Log</div>
    ${log || '<div style="color:var(--text-3);font-size:12px">ไม่มีประวัติ</div>'}
    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn-sm" onclick="openResModal('${r.id}');closeResDetail()">✎ Edit</button>
      <button class="btn-sm" onclick="openResStatus('${r.id}');closeResDetail()">⇄ Change Status</button>
      ${r.status === 'filled' ? `<button class="btn-sm" style="color:var(--blue)" onclick="openResTransfer('${r.id}');closeResDetail()">↗ Transfer</button>` : ''}
    </div>`;

  document.getElementById('resource-detail-drawer').classList.add('open');
}
function closeResDetail() { document.getElementById('resource-detail-drawer').classList.remove('open'); }

// ── Export CSV — columns match table ──
function exportResourceCsv() {
  const list = loadResources();
  if (!list.length) { alert('ไม่มีข้อมูล'); return; }

  // Columns match table: ID / Team / Project / Position / Level / HC / Hiring Type / Start / End / Request Date / Resolved Date / Status / Remark / Transfer From
  const headers = [
    'Request ID', 'Resource Team', 'Project', 'Position', 'Level', 'HC',
    'Hiring Type', 'Start Date', 'End Date', 'Request Date', 'Resolved Date',
    'Status', 'Requester', 'Transfer From', 'Remark',
  ];
  const rows = list.map(r => [
    r.id,
    resDisplayTeam(r),
    resDisplayProject(r),
    r.position,
    resDisplayLevel(r),
    r.hc,
    resDisplayHiring(r),
    r.startDate    || '',
    r.endDate      || '',
    r.requestDate  || '',
    r.resolvedDate || '',
    RES_STATUS[r.status]?.label || r.status,
    r.requesterName || '',
    r.transferFrom  || '',
    (r.remark || '').replace(/\n/g, ' | '),
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Resource_Requests_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
  a.click();
}

// ── Close modals on backdrop click ──
document.addEventListener('click', e => {
  if (e.target === document.getElementById('resource-modal'))          closeResModal();
  if (e.target === document.getElementById('resource-status-modal'))   closeResStatus();
  if (e.target === document.getElementById('resource-transfer-modal')) closeResTransfer();
});

// ══════════════════════════════════════════
// BULK UPLOAD — Resource Requests
// ══════════════════════════════════════════

// Columns shared between export, template, and import
const RES_BULK_COLS = [
  { key: 'id',             header: 'Request ID',      required: false },
  { key: 'resourceTeam',   header: 'Resource Team',   required: true },
  { key: 'project',        header: 'Project',         required: true },
  { key: 'position',       header: 'Position',        required: true },
  { key: 'level',          header: 'Level',           required: true },
  { key: 'hc',             header: 'HC',              required: true },
  { key: 'hiringType',     header: 'Hiring Type',     required: true },
  { key: 'startDate',      header: 'Start Date',      required: true },
  { key: 'endDate',        header: 'End Date',        required: false },
  { key: 'requestDate',    header: 'Request Date',    required: false },
  { key: 'resolvedDate',   header: 'Resolved Date',   required: false },
  { key: 'status',         header: 'Status',          required: false },
  { key: 'requesterName',  header: 'Requester',       required: false },
  { key: 'transferFrom',   header: 'Transfer From',   required: false },
  { key: 'remark',         header: 'Remark',          required: false },
];

// ── Download Template ──
function downloadResTemplate() {
  if (typeof XLSX === 'undefined') { alert('ไม่พบ SheetJS library'); return; }

  const headers = RES_BULK_COLS.map(c => c.header);
  const sample  = [
    'RES-2501-ABC123',  // Request ID — ใส่ถ้ามี ID เดิม / ว่างไว้ถ้าเป็น record ใหม่
    'BA', 'Geo9', 'Senior Backend Developer', 'Senior', 1,
    'Permanent (Direct)', '2025-01-15', '', '2025-01-10', '',
    'pending', 'Chuen', '', 'ต้องการ resource เพิ่ม Q1',
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);

  // Column widths
  ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));

  // Style header row (note: basic xlsx doesn't support full cell styling but we add a note)
  ws['A1'].c = [{ a: 'PMO', t: '* = required field' }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resource Requests');
  XLSX.writeFile(wb, 'Resource_Requests_Template.xlsx');
}

// ── Handle file select ──
function handleResBulkUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (typeof XLSX === 'undefined') { alert('ไม่พบ SheetJS library'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) { alert('ไม่พบข้อมูลในไฟล์'); return; }

      _resParseAndPreview(rows);
    } catch(err) {
      alert('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + err.message);
    }
  };
  reader.readAsBinaryString(file);
  event.target.value = ''; // reset so same file can be re-uploaded
}

// ── Parse rows + deduplicate + show preview ──
function _resParseAndPreview(rows) {
  const existing = loadResources();
  const now      = new Date().toISOString();

  const parsed  = [];
  const errors  = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // +2 because row 1 = header

    // Map header → field
    const get = header => {
      const col = RES_BULK_COLS.find(c => c.header === header);
      if (!col) return '';
      // Support both header name and key name in the file
      const v = row[header] ?? row[col.key] ?? '';
      if (v instanceof Date) return v.toISOString().slice(0, 10);
      return String(v).trim();
    };

    // Required field check
    const missing = RES_BULK_COLS.filter(c => c.required && !get(c.header));
    if (missing.length) {
      errors.push(`Row ${rowNum}: ขาด field — ${missing.map(c => c.header).join(', ')}`);
      return;
    }

    const hc = parseInt(get('HC')) || 0;
    if (hc < 1) { errors.push(`Row ${rowNum}: HC ต้องมากกว่า 0`); return; }

    const statusRaw = get('Status').toLowerCase().replace(/\s+/g, '');
    const statusMap = {
      'pending': 'pending', 'sourcing': 'sourcing',
      'interviewing': 'interviewing', 'offer': 'offer',
      'offerinprogress': 'offer', 'document': 'document',
      'documentprocessing': 'document', 'filled': 'filled',
      'mitigated': 'mitigated', 'resolved': 'resolved', 'cancelled': 'cancelled',
    };
    const status = statusMap[statusRaw] || 'pending';

    const record = {
      id:            get('Request ID').trim() || (nextResId() + '-' + String(i).padStart(3, '0')),
      resourceTeam:  get('Resource Team'),
      resourceTeamOther: null,
      project:       get('Project'),
      projectOther:  null,
      position:      get('Position'),
      level:         get('Level'),
      levelOther:    null,
      hc,
      hiringType:    get('Hiring Type'),
      hiringTypeOther: null,
      startDate:     get('Start Date'),
      endDate:       get('End Date') || null,
      requestDate:   get('Request Date') || todayISO,
      resolvedDate:  get('Resolved Date') || null,
      status,
      requesterName: get('Requester'),
      transferFrom:  get('Transfer From') || null,
      remark:        get('Remark'),
      activityLog:   [{ action: 'Imported via bulk upload', by: 'PMO', at: now }],
      createdAt:     now,
      updatedAt:     now,
    };
    parsed.push(record);
  });

  // ── Deduplicate: check by ID (exact match) OR all business fields ──
  const COMPARE_KEYS = [
    'resourceTeam','project','position','level','hc',
    'hiringType','startDate','endDate','requestDate',
    'resolvedDate','status','requesterName','transferFrom','remark',
  ];

  const fingerprint  = r => COMPARE_KEYS.map(k => String(r[k] ?? '')).join('|');
  const existingFPs  = new Set(existing.map(fingerprint));
  const existingIDs  = new Set(existing.map(r => r.id));

  const toAdd    = parsed.filter(r => !existingIDs.has(r.id) && !existingFPs.has(fingerprint(r)));
  const dupCount = parsed.length - toAdd.length;

  _resShowBulkPreview(toAdd, dupCount, errors);
}

// ── Preview modal ──
function _resShowBulkPreview(toAdd, dupCount, errors) {
  const modal = document.getElementById('res-bulk-preview-modal');
  const body  = document.getElementById('res-bulk-preview-body');
  if (!modal || !body) return;

  const tdS = 'padding:5px 8px;border-bottom:1px solid var(--border);font-size:11px';

  body.innerHTML = `
    <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">
      <div style="background:var(--green-50,#F0FDF4);border-radius:var(--r-sm);padding:10px 16px;flex:1;min-width:120px">
        <div style="font-size:11px;color:var(--text-3)">จะ Import</div>
        <div style="font-size:22px;font-weight:700;color:var(--green)">${toAdd.length}</div>
        <div style="font-size:10px;color:var(--text-3)">รายการใหม่</div>
      </div>
      <div style="background:var(--amber-50,#FFFBEB);border-radius:var(--r-sm);padding:10px 16px;flex:1;min-width:120px">
        <div style="font-size:11px;color:var(--text-3)">ข้าม</div>
        <div style="font-size:22px;font-weight:700;color:var(--amber)">${dupCount}</div>
        <div style="font-size:10px;color:var(--text-3)">ซ้ำกับที่มีอยู่</div>
      </div>
      <div style="background:${errors.length ? 'var(--red-50,#FEF2F2)' : 'var(--bg)'};border-radius:var(--r-sm);padding:10px 16px;flex:1;min-width:120px">
        <div style="font-size:11px;color:var(--text-3)">Error</div>
        <div style="font-size:22px;font-weight:700;color:${errors.length ? 'var(--red)' : 'var(--text-3)'}">${errors.length}</div>
        <div style="font-size:10px;color:var(--text-3)">row ที่ข้อมูลไม่ครบ</div>
      </div>
    </div>

    ${errors.length ? `
      <div style="background:var(--red-50,#FEF2F2);border-radius:var(--r-sm);padding:10px;margin-bottom:12px;font-size:11px;color:var(--red)">
        <div style="font-weight:600;margin-bottom:4px">⚠ Rows ที่ไม่ผ่าน validation (จะไม่ถูก import):</div>
        ${errors.map(e => `<div>• ${esc(e)}</div>`).join('')}
      </div>` : ''}

    ${toAdd.length ? `
      <div style="font-size:11px;font-weight:600;color:var(--text-2);margin-bottom:6px">Preview รายการที่จะ import:</div>
      <div style="overflow-x:auto;max-height:300px;overflow-y:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead style="position:sticky;top:0;background:var(--bg)"><tr>
            <th style="${tdS};font-weight:600;text-align:left">Team</th>
            <th style="${tdS};font-weight:600;text-align:left">Project</th>
            <th style="${tdS};font-weight:600;text-align:left">Position</th>
            <th style="${tdS};font-weight:600;text-align:left">Level</th>
            <th style="${tdS};font-weight:600">HC</th>
            <th style="${tdS};font-weight:600;text-align:left">Hiring Type</th>
            <th style="${tdS};font-weight:600;text-align:left">Start</th>
            <th style="${tdS};font-weight:600;text-align:left">Status</th>
          </tr></thead>
          <tbody>
            ${toAdd.map(r => `<tr>
              <td style="${tdS}">${esc(r.resourceTeam)}</td>
              <td style="${tdS}">${esc(r.project)}</td>
              <td style="${tdS}">${esc(r.position)}</td>
              <td style="${tdS}">${esc(r.level)}</td>
              <td style="${tdS};text-align:center">${r.hc}</td>
              <td style="${tdS}">${esc(r.hiringType)}</td>
              <td style="${tdS}">${r.startDate || '—'}</td>
              <td style="${tdS}"><span class="badge ${RES_STATUS[r.status]?.cls || 'badge-gray'}" style="font-size:10px">${RES_STATUS[r.status]?.label || r.status}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `<div style="text-align:center;padding:20px;color:var(--text-3);font-size:12px">ไม่มีรายการใหม่ที่จะ import</div>`}`;

  // Store toAdd for confirm step
  modal._pendingRecords = toAdd;
  modal.style.display = 'flex';
}

function closeResBulkPreview() {
  const modal = document.getElementById('res-bulk-preview-modal');
  if (modal) { modal.style.display = 'none'; modal._pendingRecords = null; }
}

async function confirmResBulkImport() {
  const modal   = document.getElementById('res-bulk-preview-modal');
  const records = modal?._pendingRecords || [];
  if (!records.length) { closeResBulkPreview(); return; }

  const btn = document.getElementById('res-bulk-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Importing...'; }

  try {
    // Save all to localStorage first for instant feedback
    const existing = loadResources();
    const merged   = [...existing, ...records];
    storeResources(merged);
    _resCache = merged;

    // Then push to Supabase
    if (await checkSupa()) {
      await Promise.all(records.map(r => saveResourceAsync(r).catch(e =>
        console.warn('Supabase save failed for', r.id, e.message)
      )));
    }

    closeResBulkPreview();
    renderResource();
    alert(`✓ Import สำเร็จ — เพิ่ม ${records.length} รายการ`);
  } catch(err) {
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Confirm Import'; }
  }
}
