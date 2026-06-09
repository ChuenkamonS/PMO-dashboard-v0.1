// ─────────────────────────────────────────
// views/budget.js — Budget & Spend (merged)
// Sub-tabs: Overview | SL+Infra | Others
// ─────────────────────────────────────────

// ── Constants ──
const BGT_TYPE_COLORS = { sl:'#185FA5', hw:'#3B6D11', int:'#854F0B', ent:'#3C3489', dep:'#A32D2D' };
const BGT_TYPE_LABELS = { sl:'Software License', hw:'Hardware', int:'Team Activity', ent:'Client Expense', dep:'Deployment' };
const BGT_PROJ_COLORS = ['#185FA5','#3B6D11','#854F0B','#3C3489','#A32D2D','#5F5E5A','#0F6E56','#8B4513'];
const INFRA_KEY = 'orbit-pmo-infra-v1';

// ── Infra Storage ──
function loadInfraCosts() {
  try { return JSON.parse(localStorage.getItem(INFRA_KEY)||'{}') || {}; } catch(e) { return {}; }
}
function storeInfraCosts(d) {
  try { localStorage.setItem(INFRA_KEY, JSON.stringify(d)); } catch(e) {}
}

// ── License cost by project (from license monitor) ──
function getLicenseCostByProject() {
  if(typeof getAllLicenses !== 'function') return {};
  const result = {};
  getAllLicenses().forEach(l => {
    const proj = l.project || '(ไม่ระบุ)';
    result[proj] = (result[proj]||0) + (l.pricePerMonth||0) * (l.seats||1);
  });
  return result;
}

// ── Sub-tab switching ──
let _bgtCurrentTab = 'overview';
function switchBudgetTab(tab, btn) {
  _bgtCurrentTab = tab;
  // Hide all budget sub-tab panels
  ['overview','sl-infra','others'].forEach(t => {
    const p = document.getElementById('bgt-tab-' + t);
    if(p) p.style.display = 'none';
  });
  // Remove active from all budget tab buttons
  document.querySelectorAll('#view-budget .cost-stab').forEach(b => {
    b.classList.remove('active');
    b.style.background = '';
    b.style.color = '';
  });
  // Show selected panel
  const panel = document.getElementById('bgt-tab-' + tab);
  if(panel) panel.style.display = '';
  if(btn) btn.classList.add('active');
  // Render content
  if(tab === 'overview')  renderBudgetOverview();
  if(tab === 'sl-infra')  renderBudgetSLInfra();
}

// ── Main entry ──
function renderBudget() {
  if(_bgtCurrentTab === 'overview')  renderBudgetOverview();
  if(_bgtCurrentTab === 'sl-infra')  renderBudgetSLInfra();
}

// ══════════════════════════════════════════
// SUB-TAB 1: OVERVIEW
// ══════════════════════════════════════════
function renderBudgetOverview() {
  const approved = loadMemos().filter(m => memoStatusKey(m) === 'completed');

  // ── KPIs ──
  const total    = approved.reduce((s,m) => s+(Number(m.total)||0), 0);
  const slInfra  = approved.filter(m => m.type === 'sl').reduce((s,m) => s+(Number(m.total)||0), 0)
                 + Object.values(loadInfraCosts()).reduce((s,p) => s+Object.values(p).reduce((ss,v)=>ss+v,0), 0);
  const others   = approved.filter(m => ['hw','int','ent','dep'].includes(m.type)).reduce((s,m) => s+(Number(m.total)||0), 0);

  const setKpi = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = money(val); };
  setKpi('bgt-kpi-total', total);
  setKpi('bgt-kpi-sl-infra', slInfra);
  setKpi('bgt-kpi-others', others);

  // ── Trend chart ──
  _renderOvTrendChart(approved);

  // ── Stacked bar by project ──
  _renderOvProjBarChart(approved);
}

// ── Overview: Trend (reuses existing logic, migrated to new IDs) ──
let _ovProjSelected = new Set();
let _ovTypeSelected = new Set(['sl','hw','int','ent','dep']);

function _renderOvTrendChart(allMemos) {
  const allProjects = [...new Set(allMemos.map(m => m.project||'ไม่ระบุ'))].sort();
  if(!_ovProjSelected.size) allProjects.forEach(p => _ovProjSelected.add(p));

  // Project checkboxes
  const projBox = document.getElementById('ov-proj-checkboxes');
  if(projBox && !projBox.children.length) {
    projBox.innerHTML = allProjects.map(p => `
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap">
        <input type="checkbox" ${_ovProjSelected.has(p)?'checked':''} onchange="toggleOvProj('${esc(p)}',this.checked)">
        ${esc(p)}
      </label>`).join('');
  }

  // Type checkboxes
  const typeBox = document.getElementById('ov-type-checkboxes');
  if(typeBox && !typeBox.children.length) {
    typeBox.innerHTML = ['sl','hw','int','ent','dep'].map(t => `
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer">
        <input type="checkbox" ${_ovTypeSelected.has(t)?'checked':''} onchange="toggleOvType('${t}',this.checked)">
        ${t.toUpperCase()}
      </label>`).join('');
  }

  _drawTrendChart('ov-trend-chart', allMemos, _ovProjSelected, _ovTypeSelected);
}

function toggleOvProj(proj, checked) {
  if(checked) _ovProjSelected.add(proj); else _ovProjSelected.delete(proj);
  _drawTrendChart('ov-trend-chart', loadMemos().filter(m=>memoStatusKey(m)==='completed'), _ovProjSelected, _ovTypeSelected);
}
function toggleOvType(type, checked) {
  if(checked) _ovTypeSelected.add(type); else _ovTypeSelected.delete(type);
  _drawTrendChart('ov-trend-chart', loadMemos().filter(m=>memoStatusKey(m)==='completed'), _ovProjSelected, _ovTypeSelected);
}

function _drawTrendChart(canvasId, allMemos, projSet, typeSet) {
  const canvas = document.getElementById(canvasId);
  if(!canvas || typeof Chart === 'undefined') return;
  if(canvas._chart) canvas._chart.destroy();

  const now = new Date();
  const labels = [], months = [];
  for(let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    labels.push(d.toLocaleString('th-TH', { month:'short', year:'2-digit' }));
    months.push(d);
  }

  const datasets = [...projSet].sort().map((proj, pi) => {
    const data = months.map(m =>
      allMemos.filter(memo => {
        const d = new Date(memo.updatedAt||memo.createdAt);
        return (memo.project||'ไม่ระบุ') === proj
          && typeSet.has(memo.type)
          && d.getFullYear() === m.getFullYear()
          && d.getMonth() === m.getMonth();
      }).reduce((s,memo) => s+(Number(memo.total)||0), 0)
    );
    const anomaly = data.map((v,i) => {
      if(i < 3) return false;
      const avg = (data[i-1]+data[i-2]+data[i-3])/3;
      return avg > 0 && v > avg * 1.5;
    });
    const color = BGT_PROJ_COLORS[pi % BGT_PROJ_COLORS.length];
    return {
      label: proj, data, borderColor: color, backgroundColor: color+'22',
      borderWidth: 2, tension: 0.3, fill: false,
      pointBackgroundColor: data.map((_,i) => anomaly[i] ? '#A32D2D' : color),
      pointRadius: data.map((_,i) => anomaly[i] ? 7 : 3),
    };
  });

  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position:'bottom', labels:{ font:{size:11} } },
        tooltip: { callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${money(ctx.raw)}`,
          afterLabel: ctx => {
            const d = ctx.dataIndex, data = ctx.dataset.data;
            if(d >= 3) {
              const avg = (data[d-1]+data[d-2]+data[d-3])/3;
              if(avg > 0 && ctx.raw > avg*1.5) return '⚠ Spike > 150% avg';
            }
            return '';
          }
        }}
      },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:10}} },
        y: { ticks:{ callback: v => '฿'+Number(v).toLocaleString('th-TH'), font:{size:10} } }
      }
    }
  });
}

// ── Overview: Stacked horizontal bar by project ──
function _renderOvProjBarChart(allMemos) {
  const canvas = document.getElementById('ov-proj-bar-chart');
  if(!canvas || typeof Chart === 'undefined') return;
  if(canvas._chart) canvas._chart.destroy();

  const types = ['sl','hw','int','ent','dep'];
  const byProj = {};
  allMemos.forEach(m => {
    const p = m.project||'ไม่ระบุ';
    if(!byProj[p]) byProj[p] = { total:0, sl:0, hw:0, int:0, ent:0, dep:0 };
    byProj[p][m.type] = (byProj[p][m.type]||0) + (Number(m.total)||0);
    byProj[p].total  += Number(m.total)||0;
  });

  const sorted  = Object.entries(byProj).sort((a,b) => b[1].total - a[1].total);
  const labels  = sorted.map(([p]) => p);

  const datasets = types.map(t => ({
    label: BGT_TYPE_LABELS[t] || t.toUpperCase(),
    data: sorted.map(([,v]) => v[t]||0),
    backgroundColor: BGT_TYPE_COLORS[t],
    borderRadius: 2,
    borderSkipped: false,
  }));

  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position:'bottom', labels:{ font:{size:11} } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${money(ctx.raw)}` } }
      },
      scales: {
        x: { stacked: true, ticks:{ callback: v => '฿'+Number(v).toLocaleString('th-TH'), font:{size:10} } },
        y: { stacked: true, ticks:{ font:{size:11} } }
      }
    }
  });
}

// ══════════════════════════════════════════
// SUB-TAB 2: SL + INFRA
// ══════════════════════════════════════════
function renderBudgetSLInfra() {
  const infraCosts = loadInfraCosts();
  const licByProj  = getLicenseCostByProject();

  const allProjects = [...new Set([
    ...Object.keys(licByProj),
    ...Object.keys(infraCosts),
  ])].sort();

  let totalLicense = 0, totalInfra = 0;
  const projData = allProjects.map(proj => {
    const lic   = licByProj[proj] || 0;
    const infra = Object.values(infraCosts[proj]||{}).reduce((s,v)=>s+v,0);
    totalLicense += lic;
    totalInfra   += infra;
    return { proj, lic, infra, total: lic+infra };
  });

  // ── KPIs ──
  const setKpi = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = money(val); };
  setKpi('sl-kpi-total',   totalLicense + totalInfra);
  setKpi('sl-kpi-license', totalLicense);
  setKpi('sl-kpi-infra',   totalInfra);

  // ── Forecast vs Actual Table ──
  _renderForecastTable(allProjects, infraCosts, licByProj);

  // ── Cost by Project Table ──
  const projBody = document.getElementById('sl-proj-body');
  if(projBody) {
    if(!projData.length) {
      projBody.innerHTML = `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูล — กรอก Infra Cost หรือเพิ่ม License ก่อน</td></tr>`;
    } else {
      projBody.innerHTML = projData.map(d => `<tr>
        <td style="padding-left:14px;font-weight:500">${esc(d.proj)}</td>
        <td class="mono">${money(d.lic)}</td>
        <td class="mono">${money(d.infra)}</td>
        <td class="mono" style="font-weight:700">${money(d.total)}</td>
      </tr>`).join('') + `<tr style="background:var(--bg);font-weight:600">
        <td style="padding-left:14px">Total</td>
        <td class="mono">${money(totalLicense)}</td>
        <td class="mono">${money(totalInfra)}</td>
        <td class="mono" style="color:var(--blue)">${money(totalLicense+totalInfra)}</td>
      </tr>`;
    }
  }

  // ── Infra Matrix ──
  _renderInfraMatrix(infraCosts);
}

// ── Forecast vs Actual ──
function _renderForecastTable(allProjects, infraCosts, licByProj) {
  const body = document.getElementById('sl-forecast-body');
  if(!body) return;

  const approved = loadMemos().filter(m => memoStatusKey(m)==='completed' && m.type==='sl');
  const now = new Date();

  // Build monthly actual per project (from SL memos)
  const monthlyActual = {}; // { proj: { 'YYYY-MM': amount } }
  approved.forEach(m => {
    const d = new Date(m.updatedAt||m.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const proj = m.project||'ไม่ระบุ';
    if(!monthlyActual[proj]) monthlyActual[proj] = {};
    monthlyActual[proj][key] = (monthlyActual[proj][key]||0) + (Number(m.total)||0);
  });

  // Forecast = avg of past months per project (license + infra)
  const rows = [];
  allProjects.forEach(proj => {
    const licMo  = licByProj[proj] || 0;
    const infraMo = Object.values(infraCosts[proj]||{}).reduce((s,v)=>s+v,0);
    const baseline = licMo + infraMo;

    // Past 6 months actual
    const past = [];
    for(let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const actual = (monthlyActual[proj]?.[key]||0) + infraMo;
      past.push({ key, label: d.toLocaleString('th-TH',{month:'short',year:'2-digit'}), actual });
    }
    const avg = past.reduce((s,p)=>s+p.actual,0) / (past.filter(p=>p.actual>0).length||1);
    const forecast = avg || baseline;

    // Next 6 months (forecast only)
    for(let i = 1; i <= 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth()+i, 1);
      const label = d.toLocaleString('th-TH',{month:'short',year:'2-digit'});
      rows.push({ proj, label, forecast, actual: null, isFuture: true });
    }
    // Past months
    past.forEach(p => {
      rows.push({ proj, label: p.label, forecast, actual: p.actual || null, isFuture: false });
    });
  });

  // Sort: past first (by project then month)
  const pastRows   = rows.filter(r => !r.isFuture);
  const futureRows = rows.filter(r => r.isFuture);

  if(!pastRows.length && !futureRows.length) {
    body.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูลเพียงพอสำหรับ Forecast</td></tr>`;
    return;
  }

  const buildRow = r => {
    const variance = r.actual !== null ? r.actual - r.forecast : null;
    const varClass = variance === null ? '' : variance > 0 ? 'color:#A32D2D' : 'color:#3B6D11';
    const varTxt   = variance === null ? '—' : (variance > 0 ? '+' : '') + money(variance);
    return `<tr style="${r.isFuture ? 'background:var(--blue-50,#EEF5FF)' : ''}">
      <td style="padding-left:14px;font-weight:500">${esc(r.proj)}</td>
      <td>${esc(r.label)}${r.isFuture ? ' <span style="font-size:9px;color:var(--blue);font-weight:600">F</span>' : ''}</td>
      <td class="mono">${money(r.forecast)}</td>
      <td class="mono">${r.actual !== null ? money(r.actual) : '—'}</td>
      <td class="mono" style="${varClass}">${varTxt}</td>
      <td style="text-align:center">
        <label style="display:flex;align-items:center;justify-content:center;gap:4px;font-size:11px;cursor:pointer">
          <input type="checkbox" onchange="togglePerfTest('${esc(r.proj)}','${esc(r.label)}',this.checked)"
            ${_isPerfTest(r.proj, r.label) ? 'checked' : ''}>
          Perf
        </label>
      </td>
    </tr>`;
  };

  body.innerHTML = [...pastRows, ...futureRows].map(buildRow).join('');
}

// ── Perf Test flag storage ──
function _isPerfTest(proj, month) {
  try { const d = JSON.parse(localStorage.getItem('orbit-pmo-perf-flags')||'{}'); return !!(d[proj]?.[month]); }
  catch(e) { return false; }
}
function togglePerfTest(proj, month, checked) {
  try {
    const d = JSON.parse(localStorage.getItem('orbit-pmo-perf-flags')||'{}');
    if(!d[proj]) d[proj] = {};
    if(checked) d[proj][month] = true; else delete d[proj][month];
    localStorage.setItem('orbit-pmo-perf-flags', JSON.stringify(d));
  } catch(e) {}
}

// ── Infra Matrix ──
function _renderInfraMatrix(infraCosts) {
  const infraThead = document.getElementById('sl-infra-thead');
  const infraBody  = document.getElementById('sl-infra-body');
  if(!infraThead || !infraBody) return;

  const allProgs = [...new Set(Object.values(infraCosts).flatMap(p => Object.keys(p)))].sort();
  const allProjs = [...new Set(Object.keys(infraCosts))].sort();

  if(!allProgs.length) {
    infraThead.innerHTML = '';
    infraBody.innerHTML  = `<tr><td colspan="3" style="padding:24px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูล Infra — กด "+ Add Infra Cost" เพื่อเพิ่ม</td></tr>`;
    return;
  }

  const thS = 'padding:8px 12px;font-size:11px;font-weight:600;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap';
  infraThead.innerHTML = `<tr>
    <th style="${thS};text-align:left;padding-left:14px">Program</th>
    ${allProjs.map(p => `<th style="${thS}">${esc(p)}</th>`).join('')}
    <th style="${thS}">Total/Mo</th>
    <th style="${thS}">Actions</th>
  </tr>`;

  const tdS = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:12px;text-align:right';
  infraBody.innerHTML = allProgs
    .sort((a,b) => {
      const ta = allProjs.reduce((s,p)=>s+(infraCosts[p]?.[a]||0),0);
      const tb = allProjs.reduce((s,p)=>s+(infraCosts[p]?.[b]||0),0);
      return tb - ta;
    })
    .map(prog => {
      const rowTotal = allProjs.reduce((s,p)=>s+(infraCosts[p]?.[prog]||0),0);
      return `<tr>
        <td style="${tdS};text-align:left;padding-left:14px;font-weight:500">${esc(prog)}</td>
        ${allProjs.map(proj => {
          const v = infraCosts[proj]?.[prog];
          return v
            ? `<td style="${tdS};cursor:pointer" onclick="openInfraModal('${esc(proj)}','${esc(prog)}')" title="Click to edit">${money(v)}</td>`
            : `<td style="${tdS};color:var(--text-3)">—</td>`;
        }).join('')}
        <td style="${tdS};font-weight:700;color:var(--blue)">${money(rowTotal)}</td>
        <td style="${tdS};text-align:center;white-space:nowrap">
          <button class="btn-sm" style="padding:2px 7px;font-size:11px" onclick="openInfraModalForProgram('${esc(prog)}')">✎</button>
          <button class="btn-sm" style="padding:2px 7px;font-size:11px;color:var(--red)" onclick="deleteInfraProgram('${esc(prog)}')">✕</button>
        </td>
      </tr>`;
    }).join('')
    + `<tr style="background:var(--bg)">
      <td style="${tdS};text-align:left;padding-left:14px;font-weight:600;color:var(--text-2)">Total</td>
      ${allProjs.map(proj => {
        const t = allProgs.reduce((s,prog)=>s+(infraCosts[proj]?.[prog]||0),0);
        return `<td style="${tdS};font-weight:600">${t ? money(t) : '—'}</td>`;
      }).join('')}
      <td style="${tdS};font-weight:700;color:var(--blue)">${money(allProgs.reduce((s,prog)=>s+allProjs.reduce((ss,p)=>ss+(infraCosts[p]?.[prog]||0),0),0))}</td>
      <td></td>
    </tr>`;
}

// ══════════════════════════════════════════
// INFRA MODAL (shared)
// ══════════════════════════════════════════
function openInfraModal(project, program) {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const infraCosts = loadInfraCosts();

  document.getElementById('infra-modal').style.display = 'flex';
  document.getElementById('infra-form').innerHTML = `
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Project *</label>
        <select id="inf-project" class="ri">
          <option value="">— เลือกโครงการ —</option>
          ${projects.map(p=>`<option value="${esc(p)}" ${p===project?'selected':''}>${esc(p)}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Program *</label>
        <input id="inf-program" class="ri" placeholder="เช่น AWS, DataDog" value="${esc(program||'')}">
      </div>
      <div class="fg"><label>Monthly Cost (THB) *</label>
        <input id="inf-monthly" class="ri" type="number" min="0" placeholder="0"
          value="${project && program ? (infraCosts[project]?.[program]||'') : ''}">
      </div>
    </div>`;
}

function openInfraModalForProgram(prog) {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const infraCosts = loadInfraCosts();
  const existingProjs = Object.keys(infraCosts).filter(p => infraCosts[p]?.[prog] !== undefined);
  const allP = [...new Set([...projects, ...existingProjs])].sort();

  document.getElementById('infra-modal').style.display = 'flex';
  document.getElementById('infra-form').innerHTML = `
    <p style="font-size:12px;color:var(--text-2);margin-bottom:12px">แก้ค่า <strong>${esc(prog)}</strong> ต่อโครงการ (THB/เดือน)</p>
    <input type="hidden" id="inf-program" value="${esc(prog)}">
    <input type="hidden" id="inf-project" value="__multi__">
    ${allP.map(p => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:130px;font-size:12px;font-weight:500">${esc(p)}</div>
        <input class="ri" type="number" min="0" placeholder="0 = ลบ"
          data-proj="${esc(p)}" style="flex:1" value="${infraCosts[p]?.[prog]||''}">
      </div>`).join('')}`;
}

function closeInfraModal() { document.getElementById('infra-modal').style.display = 'none'; }

function deleteInfraProgram(prog) {
  if(!confirm(`ลบ "${prog}" ออกจากทุกโครงการ?`)) return;
  const costs = loadInfraCosts();
  Object.keys(costs).forEach(proj => { delete costs[proj][prog]; });
  storeInfraCosts(costs);
  renderBudgetSLInfra();
}

function saveInfraCost() {
  const projectVal = document.getElementById('inf-project')?.value;
  const program    = document.getElementById('inf-program')?.value?.trim();
  if(!program) { alert('กรุณากรอก Program'); return; }

  const costs = loadInfraCosts();

  if(projectVal === '__multi__') {
    document.querySelectorAll('#infra-form input[data-proj]').forEach(inp => {
      const proj = inp.dataset.proj;
      const val  = parseFloat(inp.value)||0;
      if(!costs[proj]) costs[proj] = {};
      if(val > 0) costs[proj][program] = val;
      else delete costs[proj][program];
    });
  } else {
    const project = projectVal;
    const monthly = parseFloat(document.getElementById('inf-monthly')?.value)||0;
    if(!project) { alert('กรุณากรอก Project'); return; }
    if(!costs[project]) costs[project] = {};
    if(monthly > 0) costs[project][program] = monthly;
    else delete costs[project][program];
  }

  storeInfraCosts(costs);
  closeInfraModal();
  renderBudgetSLInfra();
}

// ── Infra Bulk Upload ──
function handleInfraBulkUpload(event) {
  const file = event.target.files?.[0];
  if(!file) return;
  if(typeof XLSX === 'undefined') { alert('ไม่พบ SheetJS library'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type:'binary' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval:'' });

      const costs = loadInfraCosts();
      let added = 0;
      rows.forEach(row => {
        const proj = String(row['Project']||row['project']||'').trim();
        const prog = String(row['Program']||row['program']||row['Program Name']||'').trim();
        const amt  = parseFloat(row['Monthly Cost']||row['monthly_cost']||row['Cost']||0)||0;
        if(!proj || !prog || !amt) return;
        if(!costs[proj]) costs[proj] = {};
        costs[proj][prog] = amt;
        added++;
      });

      storeInfraCosts(costs);
      renderBudgetSLInfra();
      alert(`✓ Import Infra สำเร็จ — อัปเดต ${added} รายการ`);
    } catch(err) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };
  reader.readAsBinaryString(file);
  event.target.value = '';
}
