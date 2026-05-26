// ─────────────────────────────────────────
// views/license.js — License Monitor Enhanced
// ─────────────────────────────────────────

const LICENSE_KEY = 'orbit-pmo-licenses-v1';
let licTrendChart = null;

// ── Storage ──
function loadManualLicenses() {
  try { const d = JSON.parse(localStorage.getItem(LICENSE_KEY)||'[]'); return Array.isArray(d)?d:[]; }
  catch(e) { return []; }
}
function storeManualLicenses(licenses) {
  try { localStorage.setItem(LICENSE_KEY, JSON.stringify(licenses)); } catch(e) {}
}
function nextLicenseId() {
  const licenses = loadManualLicenses();
  return (licenses.reduce((m,l) => Math.max(m, Number(l.id)||0), 0)) + 1;
}

// ── Parse from SL memo ──
function parseLicenseFromMemo(memo) {
  const licenses = [];
  if(memo.type !== 'sl' || memo.status !== 'completed') return licenses;
  const purchaseDate = memo.approvedAt || memo.updatedAt || memo.createdAt;
  const section = memo.sections?.find(s => s.title === 'รายการ Software');
  if(!section) return licenses;
  const parser = new DOMParser();
  const doc = parser.parseFromString(section.html, 'text/html');
  doc.querySelectorAll('tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if(cells.length < 6) return;
    const name     = cells[1]?.textContent?.trim();
    const priceStr = cells[2]?.textContent?.replace(/[฿,]/g,'').trim();
    const months   = parseInt(cells[3]?.textContent) || 12;
    const seats    = parseInt(cells[4]?.textContent) || 1;
    const price    = parseFloat(priceStr) || 0;
    if(!name || name === '-') return;
    const start = new Date(purchaseDate);
    const expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + months);
    licenses.push({
      id: `memo-${memo.memoNo}-${name}`.replace(/\s/g,'_'),
      name, seats, pricePerMonth: price, months,
      purchaseDate, expiry: expiry.toISOString(),
      project: memo.project, memoNo: memo.memoNo,
      source: 'memo', owner: '', department: '',
      vendor: '', billingFreq: 'monthly', licenseType: 'subscription',
      statusOverride: null, note: ''
    });
  });
  return licenses;
}

// ── Status logic ──
function getLicenseStatus(lic) {
  if(lic.statusOverride === 'cancelled') return { label:'Cancelled', badge:'badge-gray', days: null, key:'cancelled' };
  if(!lic.expiry) return { label:'Active', badge:'badge-green', days: null, key:'active' };
  const now = new Date();
  const expiry = new Date(lic.expiry);
  const days = Math.floor((expiry - now) / 86400000);
  if(days < 0)   return { label:'Expired',  badge:'badge-red',    days, key:'expired' };
  if(days <= 7)  return { label:`${days}d`, badge:'badge-red',    days, key:'expiring-7' };
  if(days <= 15) return { label:`${days}d`, badge:'badge-orange', days, key:'expiring-15' };
  if(days <= 30) return { label:`${days}d`, badge:'badge-amber',  days, key:'expiring-30' };
  return                 { label:'Active',  badge:'badge-green',  days, key:'active' };
}

// ── All licenses: memo + manual ──
function getAllLicenses() {
  const memoLicenses = loadMemos()
    .filter(m => m.type === 'sl' && m.status === 'completed')
    .flatMap(parseLicenseFromMemo);
  const manual = loadManualLicenses();
  // Merge: manual overrides same memo-sourced record by id
  const manualIds = new Set(manual.map(l => l.id));
  const filteredMemo = memoLicenses.filter(l => !manualIds.has(l.id));
  return [...filteredMemo, ...manual];
}

// ── Trend chart ──
function renderLicenseTrend(licenses) {
  const canvas = document.getElementById('lic-trend-chart');
  if(!canvas || typeof Chart === 'undefined') return;
  if(licTrendChart) licTrendChart.destroy();
  const now = new Date();
  const labels = [], data = [];
  for(let i=11; i>=0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const next = new Date(d.getFullYear(), d.getMonth()+1, 1);
    labels.push(d.toLocaleDateString('th-TH',{month:'short', year:'2-digit'}));
    const cost = licenses
      .filter(l => {
        const purchased = new Date(l.purchaseDate||0);
        const expiry = l.expiry ? new Date(l.expiry) : new Date(9999,0);
        return purchased <= next && expiry >= d;
      })
      .reduce((s,l) => s + (l.pricePerMonth||0)*(l.seats||1), 0);
    data.push(cost);
  }
  licTrendChart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets:[{ label:'Monthly Cost', data, borderColor:'#185FA5', backgroundColor:'rgba(24,95,165,.1)', tension:.28, fill:true, pointRadius:3 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{ ticks:{ callback:v=>money(v) }, beginAtZero:true } } }
  });
}

// ── Main render ──
function renderLicense() {
  const allLicenses = getAllLicenses();
  const search     = (document.getElementById('lic-search')?.value||'').toLowerCase();
  const filterSt   = document.getElementById('lic-filter-status')?.value || 'all';
  const filterProj = document.getElementById('lic-filter-project')?.value || 'all';
  const sort       = document.getElementById('lic-sort')?.value || 'expiry-asc';

  // Metrics
  let activeCount=0, renewSoonCount=0, expiredCount=0, monthlyCost=0, annualCost=0;
  allLicenses.forEach(lic => {
    const s = getLicenseStatus(lic);
    if(s.key==='active')                                              { activeCount++; monthlyCost += (lic.pricePerMonth||0)*(lic.seats||1); }
    if(s.key==='expiring-7'||s.key==='expiring-15'||s.key==='expiring-30') { renewSoonCount++; monthlyCost += (lic.pricePerMonth||0)*(lic.seats||1); }
    if(s.key==='expired')    expiredCount++;
  });
  annualCost = monthlyCost * 12;

  // Renewal cost next 3 months
  const in3m = new Date(); in3m.setMonth(in3m.getMonth()+3);
  const renewal3m = allLicenses
    .filter(l => { if(!l.expiry) return false; const e = new Date(l.expiry); return e >= new Date() && e <= in3m; })
    .reduce((s,l) => s+(l.pricePerMonth||0)*(l.seats||1)*((l.months)||12), 0);

  document.getElementById('lic-active').textContent   = activeCount;
  document.getElementById('lic-active-cost').textContent = monthlyCost ? money(monthlyCost)+'/เดือน' : '';
  document.getElementById('lic-expiring').textContent = renewSoonCount;
  document.getElementById('lic-expired').textContent  = expiredCount;
  document.getElementById('lic-monthly').textContent  = money(monthlyCost);
  document.getElementById('lic-annual').textContent   = money(annualCost);
  document.getElementById('lic-renewal-3m').textContent = renewal3m ? `Renewal 3m: ${money(renewal3m)}` : 'ไม่มี renewal ใน 3 เดือน';

  // Trend chart
  renderLicenseTrend(allLicenses);

  // Filter + search
  let filtered = allLicenses.filter(lic => {
    const s = getLicenseStatus(lic);
    if(filterSt !== 'all') {
      if(filterSt === 'expiring' && !['expiring-7','expiring-15','expiring-30'].includes(s.key)) return false;
      if(filterSt !== 'expiring' && s.key !== filterSt) return false;
    }
    if(filterProj !== 'all' && lic.project !== filterProj) return false;
    if(search) {
      const hay = `${lic.name} ${lic.project} ${lic.owner} ${lic.vendor} ${lic.department}`.toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });

  // Sort
  const EXPIRING_KEYS = new Set(['expiring-7','expiring-15','expiring-30']);
  filtered.sort((a,b) => {
    if(sort==='cost-desc')     return ((b.pricePerMonth||0)*(b.seats||1)) - ((a.pricePerMonth||0)*(a.seats||1));
    if(sort==='seats-desc')    return (b.seats||1)-(a.seats||1);
    if(sort==='purchase-desc') return new Date(b.purchaseDate||0)-new Date(a.purchaseDate||0);
    // expiry-asc default: expired last, active by date
    const sa = getLicenseStatus(a), sb = getLicenseStatus(b);
    if(sa.key==='expired' && sb.key!=='expired') return 1;
    if(sb.key==='expired' && sa.key!=='expired') return -1;
    if(!a.expiry) return 1; if(!b.expiry) return -1;
    return new Date(a.expiry)-new Date(b.expiry);
  });

  const tbody = document.getElementById('lic-table-body');
  if(!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:34px 16px;color:var(--text-3)">ยังไม่มีข้อมูล${search?' ที่ตรงกับการค้นหา':''} — Approve SL Memo หรือกด Add License</td></tr>`;
    return;
  }

  window._licFiltered = filtered;
  tbody.innerHTML = filtered.map((lic, _idx) => {
    const s = getLicenseStatus(lic);
    const monthlyCostLic = (lic.pricePerMonth||0)*(lic.seats||1);
    return `<tr>
      <td style="padding-left:16px;font-weight:600">
        ${esc(lic.name)}
        ${lic.vendor?`<div style="font-size:10px;color:var(--text-3);font-weight:400">${esc(lic.vendor)}</div>`:''}
        ${lic.memoNo?`<div style="font-size:10px;color:var(--blue);font-weight:400;cursor:pointer" onclick="openMemoPdf('${esc(lic.memoNo)}')">${esc(lic.memoNo)}</div>`:''}
      </td>
      <td>${esc(lic.seats||1)}</td>
      <td class="mono">${esc(money(monthlyCostLic))}</td>
      <td style="font-size:12px">${esc(lic.owner||'—')}</td>
      <td style="font-size:12px">${esc(lic.department||'—')}</td>
      <td style="font-size:12px">${esc(lic.project||'—')}</td>
      <td style="font-size:11px">${esc(shortDate(lic.purchaseDate))}</td>
      <td style="font-size:11px">${esc(shortDate(lic.expiry))}</td>
      <td style="text-align:center"><span class="badge ${s.badge}">${esc(s.label)}</span></td>
      <td style="text-align:center;white-space:nowrap">
        <button class="btn-sm" data-action="edit" data-idx="${_idx}" style="padding:3px 7px;font-size:11px" title="Edit">✎</button>
        ${lic.source!=='memo'?`<button class="btn-sm" data-action="delete" data-idx="${_idx}" style="padding:3px 7px;font-size:11px;color:var(--red)" title="Delete">✕</button>`:''}
      </td>
    </tr>`;
  }).join('');

  tbody.onclick = function(e) {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const idx = Number(btn.dataset.idx);
    const lic = window._licFiltered?.[idx];
    if(!lic) return;
    if(btn.dataset.action==='edit')   openLicenseModal(String(lic.id));
    if(btn.dataset.action==='delete') deleteLicense(String(lic.id));
  };

}


// ── Modal ──
function openLicenseModal(id) {
  const modal = document.getElementById('license-modal');
  modal.style.display = 'flex';
  if(id) {
    const lic = getAllLicenses().find(l => String(l.id)===String(id));
    if(!lic) { closeLicenseModal(); return; }
    document.getElementById('lic-modal-title').textContent = 'Edit License';
    document.getElementById('lic-edit-id').value    = lic.id;
    document.getElementById('lic-name').value       = lic.name||'';
    document.getElementById('lic-vendor').value     = lic.vendor||'';
    document.getElementById('lic-seats').value      = lic.seats||1;
    document.getElementById('lic-price').value      = lic.pricePerMonth||0;
    document.getElementById('lic-owner').value      = lic.owner||'';
    document.getElementById('lic-dept').value       = lic.department||'';
    document.getElementById('lic-project').value    = lic.project||'';
    document.getElementById('lic-type-field').value = lic.licenseType||'subscription';
    document.getElementById('lic-purchase-date').value = lic.purchaseDate?.slice(0,10)||'';
    document.getElementById('lic-expiry-date').value   = lic.expiry?.slice(0,10)||'';
    document.getElementById('lic-billing').value    = lic.billingFreq||'monthly';
    document.getElementById('lic-status-field').value = lic.statusOverride||'active';
    document.getElementById('lic-memo-ref').value   = lic.memoNo||'';
    document.getElementById('lic-note').value       = lic.note||'';
  } else {
    document.getElementById('lic-modal-title').textContent = 'Add License';
    document.getElementById('lic-edit-id').value = '';
    ['lic-name','lic-vendor','lic-owner','lic-dept','lic-note','lic-memo-ref'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('lic-seats').value = 1;
    document.getElementById('lic-price').value = 0;
    document.getElementById('lic-purchase-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('lic-expiry-date').value = '';
    document.getElementById('lic-project').value = '';
    document.getElementById('lic-type-field').value = 'subscription';
    document.getElementById('lic-billing').value = 'monthly';
    document.getElementById('lic-status-field').value = 'active';
  }
}
function closeLicenseModal() { document.getElementById('license-modal').style.display='none'; }

function saveLicenseManual() {
  const name = document.getElementById('lic-name').value.trim();
  if(!name) { alert('กรุณากรอก Software Name'); return; }
  const editId = document.getElementById('lic-edit-id').value;
  const licenses = loadManualLicenses();
  const now = new Date().toISOString();
  const data = {
    name,
    vendor:       document.getElementById('lic-vendor').value.trim(),
    seats:        Number(document.getElementById('lic-seats').value)||1,
    pricePerMonth:Number(document.getElementById('lic-price').value)||0,
    owner:        document.getElementById('lic-owner').value.trim(),
    department:   document.getElementById('lic-dept').value.trim(),
    project:      document.getElementById('lic-project').value,
    licenseType:  document.getElementById('lic-type-field').value,
    purchaseDate: document.getElementById('lic-purchase-date').value||now.slice(0,10),
    expiry:       document.getElementById('lic-expiry-date').value ? new Date(document.getElementById('lic-expiry-date').value+'T00:00:00').toISOString() : null,
    billingFreq:  document.getElementById('lic-billing').value,
    statusOverride: document.getElementById('lic-status-field').value === 'active' ? null : document.getElementById('lic-status-field').value,
    memoNo:       document.getElementById('lic-memo-ref').value.trim(),
    note:         document.getElementById('lic-note').value.trim(),
    source:       'manual',
    updatedAt:    now,
  };
  if(editId) {
    const idx = licenses.findIndex(l => String(l.id)===String(editId));
    if(idx>=0) licenses[idx] = { ...licenses[idx], ...data };
    else licenses.push({ id: nextLicenseId(), ...data, createdAt: now });
  } else {
    licenses.push({ id: nextLicenseId(), ...data, createdAt: now });
  }
  storeManualLicenses(licenses);
  closeLicenseModal();
  renderLicense();
}

function deleteLicense(id) {
  const lic = getAllLicenses().find(l => String(l.id)===String(id));
  if(!lic) return;
  if(lic.source === 'memo') { alert('ไม่สามารถลบ License ที่มาจาก Memo ได้'); return; }
  if(!confirm(`ลบ "${lic.name}" ออกจากระบบ?`)) return;
  storeManualLicenses(loadManualLicenses().filter(l => String(l.id)!==String(id)));
  renderLicense();
}

// Close modal on backdrop
document.addEventListener('click', function(e) {
  if(e.target === document.getElementById('license-modal')) closeLicenseModal();
});
