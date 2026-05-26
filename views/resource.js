// ─────────────────────────────────────────
// views/resource.js — Resource Management
// Based on BRD v1.0 — Orbit Digital PMO
// ─────────────────────────────────────────

const RES_KEY = 'orbit-pmo-resources-v1';
let _resCache = null;

// ── Status config ──
const RES_STATUS = {
  pending:     { label:'Pending',            cls:'badge-gray',   th:'มีการ Request แล้ว รอดำเนินการ' },
  sourcing:    { label:'Sourcing',           cls:'badge-blue',   th:'อยู่ระหว่างหา Resource' },
  interviewing:{ label:'Interviewing',       cls:'badge-purple', th:'อยู่ระหว่างสัมภาษณ์' },
  offer:       { label:'Offer in Progress',  cls:'badge-amber',  th:'อยู่ระหว่างทำ Offer' },
  document:    { label:'Document Processing',cls:'badge-yellow', th:'อยู่ระหว่างจัดทำเอกสาร' },
  filled:      { label:'Filled',             cls:'badge-green',  th:'Resource เริ่มงานแล้ว' },
  mitigated:   { label:'Mitigated',          cls:'badge-teal',   th:'แก้ไขโดยใช้วิธีอื่น' },
  resolved:    { label:'Resolved',           cls:'badge-green',  th:'จัดการเรียบร้อยแล้ว' },
  cancelled:   { label:'Cancelled',          cls:'badge-red',    th:'ยกเลิก' },
};
const TERMINAL = ['filled','mitigated','resolved','cancelled'];
const OPEN = ['pending','sourcing','interviewing','offer','document'];

const LEVEL_OPTS = ['Junior','Mid','Senior','Lead','Manager'];
const HIRING_OPTS = ['Permanent (Direct)','Secondment','Sub-contract'];

// ── Storage ──
function loadResources() {
  if(_resCache) return _resCache;
  try { const d = JSON.parse(localStorage.getItem(RES_KEY)||'[]'); _resCache=Array.isArray(d)?d:[]; }
  catch(e) { _resCache = []; }
  return _resCache;
}
function storeResources(list) {
  _resCache = list;
  try { localStorage.setItem(RES_KEY, JSON.stringify(list)); } catch(e) {}
}
async function loadResourcesAsync() {
  if(await checkSupa()) {
    try {
      const rows = await supaFetch('resource_requests','GET',null,'?order=created_at.desc&limit=500');
      _resCache = (rows||[]).map(r => ({
        id: r.id, resourceTeam: r.resource_team, project: r.project,
        position: r.position, level: r.level, hc: r.hc,
        hiringType: r.hiring_type, startDate: r.start_date, endDate: r.end_date,
        requestDate: r.request_date, resolvedDate: r.resolved_date,
        remark: r.remark, status: r.status, requesterName: r.requester_name,
        transferFrom: r.transfer_from, activityLog: r.activity_log||[],
        createdAt: r.created_at, updatedAt: r.updated_at,
      }));
      try { localStorage.setItem(RES_KEY, JSON.stringify(_resCache)); } catch(e) {}
      return _resCache;
    } catch(e) { console.warn('Resource load failed', e.message); }
  }
  return loadResources();
}
async function saveResourceAsync(data) {
  const list = await loadResourcesAsync();
  const now = new Date().toISOString();
  const isNew = !list.find(r => r.id === data.id);
  const saved = { ...data, updatedAt: now, createdAt: isNew ? now : (list.find(r=>r.id===data.id)?.createdAt||now) };
  _resCache = isNew ? [...list, saved] : list.map(r => r.id===data.id ? saved : r);
  storeResources(_resCache);
  if(await checkSupa()) {
    try {
      await supaFetch('resource_requests','POST',{
        id: saved.id, resource_team: saved.resourceTeam, project: saved.project,
        position: saved.position, level: saved.level, hc: saved.hc,
        hiring_type: saved.hiringType, start_date: saved.startDate, end_date: saved.endDate||null,
        request_date: saved.requestDate, resolved_date: saved.resolvedDate||null,
        remark: saved.remark, status: saved.status, requester_name: saved.requesterName,
        transfer_from: saved.transferFrom||null, activity_log: saved.activityLog||[],
        created_at: saved.createdAt, updated_at: saved.updatedAt,
      },'?on_conflict=id');
    } catch(e) { console.warn('Resource save failed', e.message); }
  }
  return saved;
}
function nextResId() {
  const d = new Date();
  return `RES-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}-${String(loadResources().length+1).padStart(3,'0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

// ── Main render ──
let _resPage = 1;
const RES_PER_PAGE = 20;
let _resSortCol = 'requestDate';
let _resSortAsc = false;

async function renderResource() {
  const all = await loadResourcesAsync();
  _renderResourceUI(all);
}

function _renderResourceUI(all) {
  // KPI cards
  const open    = all.filter(r => OPEN.includes(r.status)).length;
  const pending = all.filter(r => r.status === 'pending').length;
  const inProg  = all.filter(r => ['sourcing','interviewing','offer','document'].includes(r.status)).length;
  const thisMonth = (() => { const m=new Date().toISOString().slice(0,7); return all.filter(r=>r.status==='filled'&&r.resolvedDate?.startsWith(m)).length; })();
  const cancelled = all.filter(r => r.status === 'cancelled').length;

  const kpiEl = document.getElementById('res-kpi');
  if(kpiEl) kpiEl.innerHTML = `
    <div class="metric-card"><div class="metric-label">Total Open</div><div class="metric-val" style="color:var(--blue)">${open}</div></div>
    <div class="metric-card"><div class="metric-label">Pending</div><div class="metric-val" style="color:var(--text-2)">${pending}</div></div>
    <div class="metric-card"><div class="metric-label">In Progress</div><div class="metric-val" style="color:var(--amber)">${inProg}</div></div>
    <div class="metric-card"><div class="metric-label">Filled This Month</div><div class="metric-val" style="color:var(--green)">${thisMonth}</div></div>
    <div class="metric-card"><div class="metric-label">Cancelled</div><div class="metric-val" style="color:var(--red)">${cancelled}</div></div>`;

  // Filters
  const search   = (document.getElementById('res-search')?.value||'').toLowerCase();
  const fStatus  = document.getElementById('res-f-status')?.value  || 'all';
  const fHiring  = document.getElementById('res-f-hiring')?.value  || 'all';
  const fProject = document.getElementById('res-f-project')?.value || 'all';
  const fTeam    = document.getElementById('res-f-team')?.value    || 'all';
  const fLevel   = document.getElementById('res-f-level')?.value   || 'all';

  let list = all;
  if(fStatus  !== 'all') list = list.filter(r => r.status === fStatus);
  if(fHiring  !== 'all') list = list.filter(r => r.hiringType === fHiring);
  if(fProject !== 'all') list = list.filter(r => r.project === fProject);
  if(fTeam    !== 'all') list = list.filter(r => r.resourceTeam === fTeam);
  if(fLevel   !== 'all') list = list.filter(r => r.level === fLevel);
  if(search) list = list.filter(r =>
    `${r.project} ${r.position} ${r.resourceTeam} ${r.level}`.toLowerCase().includes(search));

  // Sort
  list = [...list].sort((a,b) => {
    let va = a[_resSortCol]||'', vb = b[_resSortCol]||'';
    return _resSortAsc ? (va>vb?1:-1) : (va<vb?1:-1);
  });

  // Pagination
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total/RES_PER_PAGE));
  if(_resPage > pages) _resPage = 1;
  const slice = list.slice((_resPage-1)*RES_PER_PAGE, _resPage*RES_PER_PAGE);

  // Table
  const tbody = document.getElementById('res-table-body');
  if(!tbody) return;

  if(!slice.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:34px;color:var(--text-3)">ยังไม่มี Resource Request — กด + New Request เพื่อเริ่ม</td></tr>`;
  } else {
    tbody.innerHTML = slice.map(r => {
      const s = RES_STATUS[r.status] || { label:r.status, cls:'badge-gray' };
      return `<tr style="cursor:pointer" onclick="openResDetail('${r.id}')">
        <td style="padding-left:12px;font-family:monospace;font-size:11px;color:var(--text-3)">${esc(r.id)}</td>
        <td>${esc(r.resourceTeam)}</td>
        <td><span style="font-weight:500">${esc(r.project)}</span></td>
        <td>${esc(r.position)}</td>
        <td><span class="badge badge-gray" style="font-size:10px">${esc(r.level)}</span></td>
        <td style="text-align:center;font-weight:600">${r.hc}</td>
        <td style="font-size:11px">${esc(r.hiringType)}</td>
        <td style="font-size:11px">${r.startDate ? shortDate(r.startDate) : '—'}</td>
        <td style="font-size:11px">${r.endDate ? shortDate(r.endDate) : '—'}</td>
        <td style="font-size:11px">${r.requestDate ? shortDate(r.requestDate) : '—'}</td>
        <td style="font-size:11px">${r.resolvedDate ? shortDate(r.resolvedDate) : '—'}</td>
        <td><span class="badge ${s.cls}" style="font-size:10px;white-space:nowrap">${esc(s.label)}</span></td>
        <td style="text-align:center;white-space:nowrap" onclick="event.stopPropagation()">
          <button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResDetail('${r.id}')">👁</button>
          <button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResModal('${r.id}')">✎</button>
          <button class="btn-sm" style="font-size:10px;padding:2px 7px" onclick="openResStatus('${r.id}')">⇄</button>
          ${r.status==='filled'?`<button class="btn-sm" style="font-size:10px;padding:2px 7px;color:var(--blue)" onclick="openResTransfer('${r.id}')">↗ Transfer</button>`:''}
        </td>
      </tr>`;
    }).join('');
  }

  // Pagination
  const pagEl = document.getElementById('res-pagination');
  if(pagEl) pagEl.innerHTML = `
    <span style="font-size:12px;color:var(--text-3)">${total} รายการ | หน้า ${_resPage}/${pages}</span>
    <div style="display:flex;gap:4px">
      <button class="btn-sm" ${_resPage<=1?'disabled':''} onclick="_resPage=1;_renderResourceUI(loadResources())" style="padding:3px 8px">«</button>
      <button class="btn-sm" ${_resPage<=1?'disabled':''} onclick="_resPage--;_renderResourceUI(loadResources())" style="padding:3px 8px">‹</button>
      <button class="btn-sm" ${_resPage>=pages?'disabled':''} onclick="_resPage++;_renderResourceUI(loadResources())" style="padding:3px 8px">›</button>
      <button class="btn-sm" ${_resPage>=pages?'disabled':''} onclick="_resPage=pages;_renderResourceUI(loadResources())" style="padding:3px 8px">»</button>
    </div>`;
}

// ── New/Edit Modal ──
function openResModal(id) {
  const isEdit = !!id;
  const r = isEdit ? loadResources().find(x => x.id===id) : null;
  const s = typeof loadSettings==='function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const projectOpts = projects.map(p=>`<option value="${esc(p)}" ${r?.project===p?'selected':''}>${esc(p)}</option>`).join('');

  document.getElementById('res-modal-title').textContent = isEdit ? 'Edit Resource Request' : 'New Resource Request';
  document.getElementById('res-edit-id').value = id||'';

  const g = (fld,def='') => r ? (r[fld]||def) : def;

  document.getElementById('res-form-body').innerHTML = `
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Resource Team *</label><input id="rf-team" class="ri" placeholder="เช่น Dev, QA, BA" value="${esc(g('resourceTeam'))}"></div>
      <div class="fg"><label>โครงการ (Target) *</label><select id="rf-project" class="ri"><option value="">— เลือกโครงการ —</option>${projectOpts}</select></div>
      <div class="fg"><label>Position *</label><input id="rf-position" class="ri" placeholder="เช่น Senior Backend Developer" value="${esc(g('position'))}"></div>
      <div class="fg"><label>Level *</label><select id="rf-level" class="ri">${LEVEL_OPTS.map(l=>`<option ${g('level')===l?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="fg"><label>HC (Headcount) *</label><input id="rf-hc" class="ri" type="number" min="1" value="${g('hc',1)}"></div>
      <div class="fg"><label>Hiring Type *</label><select id="rf-hiring" class="ri" onchange="toggleEndDateRequired()">
        ${HIRING_OPTS.map(h=>`<option ${g('hiringType')===h?'selected':''}>${h}</option>`).join('')}
      </select></div>
      <div class="fg"><label>Start Date *</label><input id="rf-start" class="ri" type="date" value="${g('startDate')}"></div>
      <div class="fg"><label id="rf-end-label">End Date</label><input id="rf-end" class="ri" type="date" value="${g('endDate')}"></div>
      <div class="fg"><label>Requester Name</label><input id="rf-requester" class="ri" placeholder="ชื่อผู้ขอ" value="${esc(g('requesterName'))}"></div>
      <div class="fg"><label>Request Date</label><input id="rf-reqdate" class="ri" type="date" value="${g('requestDate', todayISO)}" readonly style="background:var(--bg)"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>Remark</label><textarea id="rf-remark" class="ri" rows="3" placeholder="หมายเหตุ / เหตุผล">${esc(g('remark'))}</textarea></div>`;

  toggleEndDateRequired();
  document.getElementById('resource-modal').style.display = 'flex';
}

function toggleEndDateRequired() {
  const ht = document.getElementById('rf-hiring')?.value||'';
  const lbl = document.getElementById('rf-end-label');
  const inp = document.getElementById('rf-end');
  const req = ht === 'Secondment' || ht === 'Sub-contract';
  if(lbl) lbl.textContent = req ? 'End Date *' : 'End Date';
  if(inp) inp.required = req;
}

function closeResModal() { document.getElementById('resource-modal').style.display='none'; }

async function saveResource() {
  const g = id => document.getElementById(id)?.value?.trim()||'';
  const team = g('rf-team'), project = g('rf-project'), position = g('rf-position');
  const hc = parseInt(g('rf-hc'))||0;
  const hiring = g('rf-hiring'), startDate = g('rf-start'), endDate = g('rf-end');

  if(!team||!project||!position||!hiring||!startDate) { alert('กรุณากรอกข้อมูลที่จำเป็นให้ครบ'); return; }
  if(hc < 1) { alert('HC ต้องมีค่าอย่างน้อย 1'); return; }
  if((hiring==='Secondment'||hiring==='Sub-contract') && !endDate) { alert('End Date จำเป็นสำหรับ Secondment / Sub-contract'); return; }
  if(endDate && startDate && endDate < startDate) { alert('End Date ต้องอยู่หลัง Start Date'); return; }

  const editId = g('res-edit-id');
  const existing = editId ? loadResources().find(r=>r.id===editId) : null;

  const data = {
    id: editId || nextResId(),
    resourceTeam: team, project, position,
    level: g('rf-level'), hc, hiringType: hiring,
    startDate, endDate: endDate||null,
    requestDate: g('rf-reqdate') || todayISO,
    resolvedDate: existing?.resolvedDate||null,
    remark: g('rf-remark'),
    status: existing?.status || 'pending',
    requesterName: g('rf-requester'),
    transferFrom: existing?.transferFrom||null,
    activityLog: existing?.activityLog || [{ action:'Created', status:'pending', by: g('rf-requester')||'System', at: new Date().toISOString() }],
  };

  await saveResourceAsync(data);
  closeResModal();
  renderResource();
}

// ── Status change modal ──
function openResStatus(id) {
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const s = RES_STATUS[r.status]||{label:r.status};
  const opts = Object.entries(RES_STATUS).map(([k,v])=>`<option value="${k}" ${k===r.status?'selected':''}>${v.label}</option>`).join('');

  document.getElementById('res-status-id').value = id;
  document.getElementById('res-status-current').innerHTML = `<span class="badge ${RES_STATUS[r.status]?.cls||'badge-gray'}">${s.label}</span> — ${esc(r.position)} / ${esc(r.project)}`;
  document.getElementById('res-status-select').innerHTML = opts;
  document.getElementById('res-status-remark').value = '';
  document.getElementById('resource-status-modal').style.display = 'flex';
}
function closeResStatus() { document.getElementById('resource-status-modal').style.display='none'; }

async function saveResStatus() {
  const id = document.getElementById('res-status-id').value;
  const newStatus = document.getElementById('res-status-select').value;
  const remark = document.getElementById('res-status-remark').value.trim();

  if(newStatus==='cancelled' && !remark) { alert('กรุณากรอก Remark สำหรับการยกเลิก'); return; }

  const list = loadResources();
  const idx = list.findIndex(r=>r.id===id);
  if(idx<0) return;

  const now = new Date().toISOString();
  const updated = { ...list[idx],
    status: newStatus,
    resolvedDate: ['filled','resolved','mitigated'].includes(newStatus) ? todayISO : list[idx].resolvedDate,
    updatedAt: now,
    activityLog: [...(list[idx].activityLog||[]), {
      action: 'Status changed', from: list[idx].status, to: newStatus,
      by: 'PMO', remark, at: now
    }],
  };
  if(remark) updated.remark = (updated.remark ? updated.remark+'\n' : '') + `[${new Date().toLocaleDateString('th')}] ${remark}`;

  await saveResourceAsync(updated);
  closeResStatus();
  renderResource();
}

// ── Transfer modal ──
function openResTransfer(id) {
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const s = typeof loadSettings==='function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const projectOpts = projects.filter(p=>p!==r.project).map(p=>`<option>${esc(p)}</option>`).join('');

  document.getElementById('res-transfer-id').value = id;
  document.getElementById('res-transfer-body').innerHTML = `
    <p style="font-size:12px;color:var(--text-2);margin-bottom:12px">
      Transfer <strong>${esc(r.position)}</strong> (${esc(r.resourceTeam)}) จาก <strong>${esc(r.project)}</strong> ไปยัง:
    </p>
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>โครงการปลายทาง *</label><select id="rtf-project" class="ri"><option value="">— เลือก —</option>${projectOpts}</select></div>
      <div class="fg"><label>Start Date ใหม่ *</label><input id="rtf-start" class="ri" type="date" value="${todayISO}"></div>
      <div class="fg"><label>End Date</label><input id="rtf-end" class="ri" type="date" value="${r.endDate||''}"></div>
    </div>
    <div class="fg" style="margin-top:10px"><label>เหตุผลในการ Transfer *</label>
      <textarea id="rtf-remark" class="ri" rows="2" placeholder="ระบุเหตุผล"></textarea></div>`;
  document.getElementById('resource-transfer-modal').style.display = 'flex';
}
function closeResTransfer() { document.getElementById('resource-transfer-modal').style.display='none'; }

async function saveResTransfer() {
  const sourceId = document.getElementById('res-transfer-id').value;
  const destProject = document.getElementById('rtf-project')?.value||'';
  const startDate = document.getElementById('rtf-start')?.value||'';
  const endDate = document.getElementById('rtf-end')?.value||'';
  const remark = document.getElementById('rtf-remark')?.value?.trim()||'';

  if(!destProject||!startDate||!remark) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }

  const source = loadResources().find(r=>r.id===sourceId);
  if(!source) return;
  const now = new Date().toISOString();

  // Update source record
  const updatedSource = { ...source,
    status: 'resolved',
    resolvedDate: todayISO,
    updatedAt: now,
    activityLog: [...(source.activityLog||[]), {
      action: 'Transferred', to: destProject, by:'PMO', remark, at: now
    }],
    remark: (source.remark ? source.remark+'\n' : '') + `[Transfer] → ${destProject}: ${remark}`,
  };

  // Create new record for destination
  const newRecord = {
    id: nextResId(),
    resourceTeam: source.resourceTeam, project: destProject,
    position: source.position, level: source.level,
    hc: source.hc, hiringType: source.hiringType,
    startDate, endDate: endDate||null,
    requestDate: todayISO, resolvedDate: null,
    remark: `Transferred from ${source.project} (${sourceId})\n${remark}`,
    status: 'filled',
    requesterName: source.requesterName,
    transferFrom: sourceId,
    activityLog: [{ action:'Transfer received', from: source.project, by:'PMO', remark, at: now }],
    createdAt: now, updatedAt: now,
  };

  await saveResourceAsync(updatedSource);
  await saveResourceAsync(newRecord);
  closeResTransfer();
  renderResource();
  alert(`✓ Transfer เสร็จสิ้น\nสร้าง Request ใหม่ ${newRecord.id} สำหรับ ${destProject}`);
}

// ── Detail drawer ──
function openResDetail(id) {
  const r = loadResources().find(x=>x.id===id);
  if(!r) return;
  const s = RES_STATUS[r.status]||{label:r.status,cls:'badge-gray'};

  const log = (r.activityLog||[]).slice().reverse().map(l=>
    `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600">${esc(l.action)}${l.from?` (${l.from} → ${l.to||''})`:''}${l.to&&!l.from?` → ${l.to}`:''}</div>
      ${l.remark?`<div style="font-size:11px;color:var(--text-2);margin-top:2px">${esc(l.remark)}</div>`:''}
      <div style="font-size:10px;color:var(--text-3);margin-top:2px">${esc(l.by||'System')} · ${l.at?new Date(l.at).toLocaleString('th-TH'):''}</div>
    </div>`
  ).join('');

  document.getElementById('res-detail-body').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <div style="font-size:15px;font-weight:700">${esc(r.position)}</div>
        <div style="font-size:12px;color:var(--text-2)">${esc(r.resourceTeam)} · ${esc(r.project)}</div>
      </div>
      <span class="badge ${s.cls}">${s.label}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;font-size:12px">
      ${[['ID',r.id],['Level',r.level],['HC',r.hc],['Hiring Type',r.hiringType],
         ['Start Date',r.startDate?shortDate(r.startDate):'—'],['End Date',r.endDate?shortDate(r.endDate):'—'],
         ['Request Date',r.requestDate?shortDate(r.requestDate):'—'],['Resolved Date',r.resolvedDate?shortDate(r.resolvedDate):'—'],
         ['Requester',r.requesterName||'—'],['Transfer From',r.transferFrom||'—']
        ].map(([k,v])=>`<div><span style="color:var(--text-3)">${k}</span><br><strong>${esc(String(v))}</strong></div>`).join('')}
    </div>
    ${r.remark?`<div style="background:var(--bg);border-radius:var(--r-sm);padding:10px;font-size:12px;margin-bottom:16px;white-space:pre-wrap">${esc(r.remark)}</div>`:''}
    <div style="font-size:12px;font-weight:700;margin-bottom:8px;color:var(--text-2)">Activity Log</div>
    ${log || '<div style="color:var(--text-3);font-size:12px">ไม่มีประวัติ</div>'}
    <div style="margin-top:16px;display:flex;gap:8px">
      <button class="btn-sm" onclick="openResModal('${r.id}');closeResDetail()">✎ Edit</button>
      <button class="btn-sm" onclick="openResStatus('${r.id}');closeResDetail()">⇄ Change Status</button>
      ${r.status==='filled'?`<button class="btn-sm" style="color:var(--blue)" onclick="openResTransfer('${r.id}');closeResDetail()">↗ Transfer</button>`:''}
    </div>`;

  document.getElementById('resource-detail-drawer').classList.add('open');
}
function closeResDetail() { document.getElementById('resource-detail-drawer').classList.remove('open'); }

// ── Export ──
function exportResourceCsv() {
  const list = loadResources();
  if(!list.length) { alert('ไม่มีข้อมูล'); return; }
  const headers = ['ID','Resource Team','Project','Position','Level','HC','Hiring Type','Start Date','End Date','Request Date','Resolved Date','Status','Requester','Transfer From','Remark'];
  const rows = list.map(r=>[r.id,r.resourceTeam,r.project,r.position,r.level,r.hc,r.hiringType,r.startDate||'',r.endDate||'',r.requestDate||'',r.resolvedDate||'',RES_STATUS[r.status]?.label||r.status,r.requesterName||'',r.transferFrom||'',r.remark||'']);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download = `Resource_Requests_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.csv`;
  a.click();
}

// Close modals on backdrop
document.addEventListener('click', e => {
  if(e.target===document.getElementById('resource-modal')) closeResModal();
  if(e.target===document.getElementById('resource-status-modal')) closeResStatus();
  if(e.target===document.getElementById('resource-transfer-modal')) closeResTransfer();
});
