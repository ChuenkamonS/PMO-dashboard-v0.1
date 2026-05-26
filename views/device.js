// ─────────────────────────────────────────
// views/device.js — Device Registry Enhanced
// ─────────────────────────────────────────

const DEVICE_KEY = 'orbit-pmo-devices-v1';

function loadDevices() {
  try { const d = JSON.parse(localStorage.getItem(DEVICE_KEY)||'[]'); return Array.isArray(d)?d:[]; }
  catch(e) { return []; }
}
function storeDevices(devices) {
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(devices)); } catch(e) {}
}
function nextDeviceId() {
  const max = loadDevices().reduce((m,d) => Math.max(m, Number(d.id)||0), 0);
  return max + 1;
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

// ── Auto-sync from HW Memos ──
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
      if(devices.some(d => d.memoRef === memo.memoNo && d.name === name)) return;
      devices.push({
        id: nextDeviceId() + added, name,
        platform: 'other', type: 'other', brand: '', serial: '', assetTag: '',
        owner: memo.reviewerName||'', assignedDate: memo.approvedAt?.slice(0,10)||'',
        project: memo.project||'', returnDate: '', warranty: '', condition: 'good',
        status: 'in-use', company: '', memoRef: memo.memoNo,
        note: `Auto-imported from ${memo.memoNo}`, createdAt: new Date().toISOString()
      });
      added++;
    });
  });
  if(added > 0) storeDevices(devices);
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
    ).join('') + `<tr style="background:var(--bg);font-weight:600;font-size:11px">
        <td style="padding-left:16px;color:var(--text-3)">Total</td>
        <td>${grandTotal.mobile}</td><td>${grandTotal.tablet}</td><td>${grandTotal.other}</td>
        <td style="text-align:right;padding-right:16px">${grandTotal.total}</td>
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
  syncFromHWMemos();

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
  if(search) devices = devices.filter(d =>
    `${d.name} ${d.brand} ${d.serial} ${d.assetTag} ${d.owner} ${d.project} ${d.company}`.toLowerCase().includes(search)
  );

  const tbody = document.getElementById('dev-table-body');
  if(!devices.length) {
    tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:34px 16px;color:var(--text-3)">ยังไม่มีอุปกรณ์${search?' ที่ตรงกับการค้นหา':''} — กด Add Device หรือ Import Excel</td></tr>`;
    return;
  }

  tbody.innerHTML = devices.map(d => {
    const statusB = deviceStatusBadge(d.status);
    const condB   = deviceConditionBadge(d.condition);
    const warr    = warrantyStatus(d.warranty);
    const platLbl = PLATFORM_LABEL[d.platform||'other'] || d.platform || '—';
    const typeLbl = TYPE_LABEL[d.type||'other'] || d.type || '—';
    return `<tr>
      <td style="padding-left:16px;font-weight:500">
        ${esc(d.name)}
        ${d.brand?`<div style="font-size:10px;color:var(--text-3);font-weight:400">${esc(d.brand)}</div>`:''}
      </td>
      <td><span style="font-size:11px;font-weight:500">${esc(platLbl)}</span></td>
      <td><span style="font-size:11px">${esc(typeLbl)}</span></td>
      <td><span style="font-family:monospace;font-size:11px">${esc(d.assetTag||'—')}</span></td>
      <td><span style="font-family:monospace;font-size:11px">${esc(d.serial||'—')}</span></td>
      <td style="font-size:12px">${esc(d.project||'—')}</td>
      <td style="font-size:12px">${esc(d.owner||'—')}${d.assignedDate?`<br><span style="font-size:10px;color:var(--text-3)">${esc(shortDate(d.assignedDate))}</span>`:''}</td>
      <td style="font-size:11px">${esc(d.company||'—')}</td>
      <td><span class="badge ${condB.cls}" style="font-size:10px">${esc(condB.label)}</span></td>
      <td>${warr?`<span class="badge ${warr.cls}" style="font-size:10px">${esc(warr.label)}</span>`:'<span style="color:var(--text-3);font-size:11px">—</span>'}</td>
      <td style="text-align:center"><span class="badge ${statusB.cls}" style="font-size:10px">${esc(statusB.label)}</span></td>
      <td style="text-align:center;white-space:nowrap">
        <button class="btn-sm" data-action="edit" data-id="${d.id}" style="padding:3px 7px;font-size:11px">✎</button>
        <button class="btn-sm" data-action="delete" data-id="${d.id}" style="padding:3px 7px;font-size:11px;color:var(--red)">✕</button>
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
    setVal('dev-company', d.company);  setVal('dev-project', d.project);
    setVal('dev-owner', d.owner);      setVal('dev-assigned-date', d.assignedDate);
    setVal('dev-return-date', d.returnDate); setVal('dev-memo-ref', d.memoRef);
    setVal('dev-warranty', d.warranty); setVal('dev-condition', d.condition||'good');
    setVal('dev-status', d.status||'in-use'); setVal('dev-note', d.note);
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
  const data = {
    name,
    brand:        g('dev-brand'),
    platform:     g('dev-platform') || 'other',
    type:         g('dev-type') || 'mobile',
    assetTag:     g('dev-asset'),
    serial:       g('dev-serial'),
    company:      g('dev-company'),
    project:      g('dev-project'),
    owner:        g('dev-owner'),
    assignedDate: g('dev-assigned-date'),
    returnDate:   g('dev-return-date'),
    memoRef:      g('dev-memo-ref'),
    warranty:     g('dev-warranty'),
    condition:    g('dev-condition') || 'good',
    status:       g('dev-status') || 'in-use',
    note:         g('dev-note'),
    updatedAt:    now,
  };
  if(editId) {
    const idx = devices.findIndex(d => d.id === Number(editId));
    if(idx >= 0) devices[idx] = { ...devices[idx], ...data };
  } else {
    devices.push({ id: nextDeviceId(), ...data, createdAt: now });
  }
  storeDevices(devices);
  closeDeviceModal();
  renderDevice();
}

function deleteDevice(id) {
  const d = loadDevices().find(dev => dev.id === id);
  if(!d) return;
  if(!confirm(`ลบ "${d.name}" ออกจากระบบ?`)) return;
  storeDevices(loadDevices().filter(dev => dev.id !== id));
  renderDevice();
}

// ── Export CSV ──
function exportDeviceCsv() {
  const devices = loadDevices();
  if(!devices.length) { alert('ไม่มีข้อมูลสำหรับ Export'); return; }
  const headers = ['ID','Device Name','Brand','Platform','Type','IT Asset ID','Serial No','Owner','Assigned Date','Project','Company','Return Date','Warranty','Condition','Status','Memo Ref','Note'];
  const rows = devices.map(d => [
    d.id, d.name, d.brand||'', PLATFORM_LABEL[d.platform]||d.platform||'',
    TYPE_LABEL[d.type]||d.type||'', d.assetTag||'', d.serial||'',
    d.owner||'', d.assignedDate||'', d.project||'', d.company||'',
    d.returnDate||'', d.warranty||'', d.condition||'', d.status||'',
    d.memoRef||'', d.note||''
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
