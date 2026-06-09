// ── SL+Infra sidebar nav ──
function switchSLNav(panel, btn) {
  ['cost','forecast','infra','bva'].forEach(p => {
    const panelEl = document.getElementById('sl-panel-' + p);
    const navEl   = document.getElementById('sl-nav-' + p);
    if(panelEl) panelEl.style.display = p === panel ? '' : 'none';
    if(navEl) {
      navEl.style.borderLeft = p === panel ? '2px solid var(--blue)' : '2px solid transparent';
      navEl.style.background = p === panel ? 'var(--blue-50)' : '';
      const span = navEl.querySelector('span');
      if(span) {
        span.style.color      = p === panel ? 'var(--blue)' : 'var(--text-2)';
        span.style.fontWeight = p === panel ? '600' : '400';
      }
      const svg = navEl.querySelector('svg');
      if(svg) svg.setAttribute('stroke', p === panel ? '#185FA5' : 'currentColor');
    }
  });
}

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
  const rangeVal  = val('#ov-range') || '12';
  const projVal   = val('#ov-project') || 'all';
  const typeVal   = val('#ov-type') || 'all';

  // Populate project dropdown once
  const projSel = document.getElementById('ov-project');
  if(projSel && projSel.options.length <= 1) {
    const allP = [...new Set(loadMemos().filter(m=>memoStatusKey(m)==='completed').map(m=>m.project||'ไม่ระบุ'))].sort();
    allP.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; projSel.appendChild(o); });
  }

  let approved = loadMemos().filter(m => memoStatusKey(m) === 'completed');

  // Apply range filter
  if(rangeVal !== 'all') {
    const months = parseInt(rangeVal);
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - months);
    approved = approved.filter(m => new Date(m.updatedAt||m.createdAt) >= cutoff);
  }
  // Apply project filter
  if(projVal !== 'all') approved = approved.filter(m => (m.project||'ไม่ระบุ') === projVal);
  // Apply type filter
  if(typeVal !== 'all') approved = approved.filter(m => m.type === typeVal);

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

  // ── Budget vs Actual ──
  _renderBudgetVsActual(allProjects, infraCosts, licByProj);
}


// ── Parse Thai date string to JS Date ──
function parseThaiDate(str) {
  if(!str) return null;
  // Try ISO first
  const d = new Date(str);
  if(!isNaN(d)) return d;
  // Thai format: "27 พฤษภาคม 2569" or "26/05/69"
  const THAI_MONTHS = {'มกราคม':0,'กุมภาพันธ์':1,'มีนาคม':2,'เมษายน':3,'พฤษภาคม':4,'มิถุนายน':5,'กรกฎาคม':6,'สิงหาคม':7,'กันยายน':8,'ตุลาคม':9,'พฤศจิกายน':10,'ธันวาคม':11};
  const m1 = str.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
  if(m1) {
    const mo = THAI_MONTHS[m1[2]];
    const yr = parseInt(m1[3]) - 543; // Buddhist Era to CE
    if(mo !== undefined && yr > 1900) return new Date(yr, mo, parseInt(m1[1]));
  }
  // dd/mm/yy or dd/mm/yyyy
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m2) {
    let yr = parseInt(m2[3]);
    if(yr < 100) yr += 2500; // treat as Buddhist Era short
    if(yr > 2100) yr -= 543;
    return new Date(yr, parseInt(m2[2])-1, parseInt(m2[1]));
  }
  return null;
}

// ── Forecast vs Actual ──
function _renderForecastTable(allProjects, infraCosts, licByProj) {
  const body   = document.getElementById('sl-forecast-body');
  const thead  = document.getElementById('sl-forecast-thead');
  if(!body || !thead) return;

  // Project dropdown
  const projSel = document.getElementById('sl-forecast-proj');
  if(projSel && projSel.options.length <= 1) {
    allProjects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = p;
      projSel.appendChild(opt);
    });
  }
  const selProj = projSel?.value || 'all';
  const showProjects = selProj === 'all' ? allProjects : [selProj];

  // Month range: past N + 3 future
  const monthCount = parseInt(document.getElementById('sl-forecast-months')?.value || '6');
  const now = new Date();
  const months = [];
  for(let i = monthCount - 1; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
  }
  for(let i = 1; i <= 6; i++) {
    months.push(new Date(now.getFullYear(), now.getMonth() + i, 1));
  }

  const isFuture  = m => m > now;
  const monthKey  = m => `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`;
  const monthLbl  = m => m.toLocaleString('th-TH', { month:'short', year:'2-digit' });

  // Build actual per project/program per month
  const actualByProjProg = {}; // { proj: { prog: { 'YYYY-MM': amount } } }
  const approved = loadMemos().filter(m => memoStatusKey(m)==='completed' && m.type==='sl');

  approved.forEach(memo => {
    const proj = memo.project || '(ไม่ระบุ)';
    const startDate = parseThaiDate(memo.date) || parseThaiDate(memo.createdAt) || new Date();
    const startMo = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const slItems = memo.slItems || [];
    const parsedItems = !slItems.length
      ? _parseSLSectionHTML((memo.sections||[]).find(s=>s.title?.includes('Software'))?.html || '')
      : slItems;

    if(!parsedItems.length) {
      const mo = 12;
      const monthly = (Number(memo.total)||0) / mo;
      if(monthly > 0) {
        const prog = 'SL รวม';
        for(let i = 0; i < mo; i++) {
          const d = new Date(startMo.getFullYear(), startMo.getMonth() + i, 1);
          const key = monthKey(d);
          if(!actualByProjProg[proj]) actualByProjProg[proj] = {};
          if(!actualByProjProg[proj][prog]) actualByProjProg[proj][prog] = {};
          actualByProjProg[proj][prog][key] = (actualByProjProg[proj][prog][key]||0) + monthly;
        }
      }
      return;
    }
    parsedItems.forEach(item => {
      const prog = item.name || 'SL';
      const mo   = item.months || 12;
      const monthly = (item.price||0) * (item.qty||1);
      for(let i = 0; i < mo; i++) {
        const d = new Date(startMo.getFullYear(), startMo.getMonth() + i, 1);
        const key = monthKey(d);
        if(!actualByProjProg[proj]) actualByProjProg[proj] = {};
        if(!actualByProjProg[proj][prog]) actualByProjProg[proj][prog] = {};
        actualByProjProg[proj][prog][key] = (actualByProjProg[proj][prog][key]||0) + monthly;
      }
    });
  });

  // Build thead
  const thBg = 'background:var(--bg)';
  const thS  = `padding:7px 8px;font-size:10px;font-weight:600;color:var(--text-3);border-bottom:1px solid var(--border);text-align:right;white-space:nowrap`;
  const thFS = `padding:7px 8px;font-size:10px;font-weight:600;color:#0C447C;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;background:#EEF5FF`;
  thead.innerHTML = `<tr>
    <th style="${thS};text-align:left;min-width:90px">Project</th>
    <th style="${thS};text-align:left;min-width:80px">Program</th>
    <th style="${thS};text-align:center;min-width:60px">Type</th>
    ${months.map(m => `<th style="${isFuture(m) ? thFS : thS}">${esc(monthLbl(m))}${isFuture(m) ? '<br><span style="font-size:9px;opacity:.7">F</span>' : ''}</th>`).join('')}
    <th style="${thS};color:var(--blue)">Total</th>
  </tr>`;

  const tdS  = 'padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;text-align:right';
  const tdFS = 'padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;text-align:right;background:#EEF5FF;color:#185FA5';
  const subS = 'padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;font-weight:600;text-align:right;background:var(--bg)';
  const subFS= 'padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;font-weight:600;text-align:right;background:#EEF5FF;color:#185FA5';

  let rows = '';
  showProjects.forEach(proj => {
    const infraProg = infraCosts[proj] || {};
    const licProgs  = actualByProjProg[proj] || {};
    const allProgs  = [...new Set([...Object.keys(licProgs), ...Object.keys(infraProg)])];

    if(!allProgs.length) return;

    // Forecast baseline per project = avg of past months
    const pastTotals = months.filter(m => !isFuture(m)).map(m => {
      const key = monthKey(m);
      const licTotal = Object.values(licProgs).reduce((s,d)=>s+(d[key]||0),0);
      const infTotal = Object.values(infraProg).reduce((s,v)=>s+v,0);
      return licTotal + infTotal;
    }).filter(v=>v>0);
    const forecastBase = pastTotals.length ? pastTotals.reduce((s,v)=>s+v,0)/pastTotals.length
      : Object.values(licProgs).reduce((s,d)=>s+Object.values(d).reduce((ss,v)=>ss+v,0)/Math.max(Object.keys(d).length,1),0)
        + Object.values(infraProg).reduce((s,v)=>s+v,0);

    let projTotal = 0;
    const projMonthTotals = months.map(() => 0);

    // License rows
    Object.entries(licProgs).forEach(([prog, monthData]) => {
      // Forecast per program = avg of its own past actual months
      const pastVals = months.filter(m => !isFuture(m)).map(m => monthData[monthKey(m)]||0).filter(v=>v>0);
      const progForecast = pastVals.length ? pastVals.reduce((s,v)=>s+v,0)/pastVals.length : 0;

      let rowTotal = 0;
      const cells = months.map((m, mi) => {
        const key = monthKey(m);
        if(isFuture(m)) {
          const fv = progForecast;
          rowTotal += fv; projMonthTotals[mi] += fv; projTotal += fv;
          return `<td style="${tdFS}">${fv > 0 ? money(Math.round(fv)) : '<span style=\"color:var(--text-3)\">—</span>'}</td>`;
        }
        const v = monthData[key]||0;
        rowTotal += v; projMonthTotals[mi] += v; projTotal += v;
        if(v > 0) return `<td style="${tdS};cursor:pointer;color:var(--blue);text-decoration:underline;text-decoration-color:var(--blue)" onclick="showMemoBreakdown('${esc(proj)}','${esc(key)}')">${money(Math.round(v))}</td>`;
        return `<td style="${tdS};color:var(--text-3)">—</td>`;
      }).join('');
      rows += `<tr>
        <td style="${tdS};text-align:left;font-weight:500">${esc(proj)}</td>
        <td style="${tdS};text-align:left">${esc(prog)}</td>
        <td style="${tdS};text-align:center"><span style="font-size:10px;background:#E6F1FB;color:#0C447C;padding:1px 6px;border-radius:3px">License</span></td>
        ${cells}
        <td style="${tdS};font-weight:600;color:var(--blue)">${money(Math.round(rowTotal))}</td>
      </tr>`;
    });

    // Infra rows
    Object.entries(infraProg).forEach(([prog, cost]) => {
      let rowTotal = 0;
      const cells = months.map((m, mi) => {
        rowTotal += cost; projMonthTotals[mi] += cost; projTotal += cost;
        return `<td style="${isFuture(m) ? tdFS : tdS}">${money(cost)}</td>`;
      }).join('');
      rows += `<tr>
        <td style="${tdS};text-align:left;color:var(--text-3);font-size:11px">${esc(proj)}</td>
        <td style="${tdS};text-align:left;color:var(--text-3);font-size:11px">${esc(prog)}</td>
        <td style="${tdS};text-align:center"><span style="font-size:10px;background:#FAEEDA;color:#633806;padding:1px 6px;border-radius:3px">Infra</span></td>
        ${cells}
        <td style="${tdS};font-weight:600;color:var(--amber)">${money(Math.round(rowTotal))}</td>
      </tr>`;
    });

    // Subtotal row
    rows += `<tr style="background:var(--bg)">
      <td style="${subS};text-align:left" colspan="2">${esc(proj)} — Subtotal</td>
      <td style="${subS}"></td>
      ${projMonthTotals.map((v, mi) => `<td style="${isFuture(months[mi]) ? subFS : subS}">${money(Math.round(v))}</td>`).join('')}
      <td style="${subS};color:var(--blue)">${money(Math.round(projTotal))}</td>
    </tr>
    <tr style="height:6px"><td colspan="${months.length+4}" style="background:var(--color-background-tertiary,#F4F3EF)"></td></tr>`;
  });

  body.innerHTML = rows || `<tr><td colspan="${months.length+4}" style="padding:24px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูล</td></tr>`;
}


// ── Parse SL section HTML to extract items ──
function _parseSLSectionHTML(html) {
  try {
    const div = document.createElement('div');
    div.innerHTML = html;
    const rows = div.querySelectorAll('tbody tr');
    const items = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if(cells.length < 5) return;
      const name  = cells[1]?.textContent?.trim();
      const price = parseFloat((cells[2]?.textContent||'').replace(/[^0-9.]/g,''))||0;
      const months= parseInt((cells[3]?.textContent||'').replace(/[^0-9]/g,''))||12;
      const qty   = parseInt((cells[4]?.textContent||'').replace(/[^0-9]/g,''))||1;
      if(name && price) items.push({ name, price, months, qty });
    });
    return items;
  } catch(e) { return []; }
}

// ── Memo breakdown popup ──
function showMemoBreakdown(proj, monthKey) {
  const approved = loadMemos().filter(m => memoStatusKey(m)==='completed' && m.type==='sl' && (m.project||'(ไม่ระบุ)')=== proj);
  const [yr, mo] = monthKey.split('-').map(Number);
  const label = new Date(yr, mo-1, 1).toLocaleString('th-TH',{month:'long',year:'2-digit'});

  const items = [];
  approved.forEach(memo => {
    const startDate = parseThaiDate(memo.date) || parseThaiDate(memo.createdAt) || new Date();
    const slItems = memo.slItems || [];
    if(!slItems.length) {
      // Try parse from sections HTML
      const slSection = (memo.sections||[]).find(s => s.title && s.title.includes('Software'));
      const parsedItems = slSection ? _parseSLSectionHTML(slSection.html) : [];
      const moCount = parsedItems.length ? (parsedItems[0].months||12) : 12;
      const endMo = new Date(startDate.getFullYear(), startDate.getMonth() + moCount, 1);
      const target = new Date(yr, mo-1, 1);
      const startMo = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      if(target >= startMo && target < endMo) {
        if(parsedItems.length) {
          parsedItems.forEach(item => {
            items.push({ memoNo: memo.memoNo, name: item.name, price: item.price, qty: item.qty, monthly: item.price * item.qty });
          });
        } else {
          items.push({ memoNo: memo.memoNo, name: 'SL รวม', monthly: (Number(memo.total)||0)/moCount });
        }
      }
      return;
    }
    slItems.forEach(item => {
      const endMo = new Date(startDate.getFullYear(), startDate.getMonth()+(item.months||12), 1);
      const target = new Date(yr, mo-1, 1);
      const startMo2 = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      if(target >= startMo2 && target < endMo) {
        items.push({ memoNo: memo.memoNo, name: item.name||'-', price: item.price, qty: item.qty||1, monthly: (item.price||0)*(item.qty||1) });
      }
    });
  });

  const panel = document.getElementById('sl-memo-breakdown');
  const title = document.getElementById('sl-breakdown-title');
  if(!panel || !title) return;

  title.textContent = `${proj} · ${label}`;
  const tbody = document.getElementById('sl-breakdown-body');
  const total = items.reduce((s,i)=>s+i.monthly,0);

  tbody.innerHTML = !items.length
    ? `<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--text-3)">ไม่มี SL memo ในเดือนนี้</td></tr>`
    : items.map(i => `<tr>
        <td style="padding:7px 12px;border-bottom:1px solid var(--border);color:var(--blue);font-weight:500">${esc(i.memoNo)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid var(--border)">${esc(i.name)}</td>
        <td style="padding:7px 12px;border-bottom:1px solid var(--border);text-align:right">${i.price ? money(i.price) : '—'}</td>
        <td style="padding:7px 12px;border-bottom:1px solid var(--border);text-align:right">${i.qty || '—'}</td>
        <td style="padding:7px 12px;border-bottom:1px solid var(--border);text-align:right;font-weight:500">${money(i.monthly)}</td>
      </tr>`).join('')
    + `<tr style="background:var(--bg)"><td colspan="4" style="padding:7px 12px;font-weight:600">Total</td><td style="padding:7px 12px;text-align:right;font-weight:600;color:var(--blue)">${money(total)}</td></tr>`;

  panel.style.display = '';
  panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
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

// ── Budget vs Actual ──
function _renderBudgetVsActual(allProjects, infraCosts, licByProj) {
  const summary = document.getElementById('sl-bva-summary');
  const body    = document.getElementById('sl-bva-body');
  if(!body) return;

  const rangeVal  = parseInt(document.getElementById('sl-bva-range')?.value || '6');
  const now       = new Date();
  const cutoff    = new Date(now.getFullYear(), now.getMonth() - rangeVal, 1);

  const monthKey  = m => `${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`;
  const months    = [];
  for(let i = rangeVal - 1; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));

  // Build actual per project from SL memos
  const approved = loadMemos().filter(m => memoStatusKey(m)==='completed' && m.type==='sl');
  const actualByProj = {};
  approved.forEach(memo => {
    const proj = memo.project || '(ไม่ระบุ)';
    const startDate = parseThaiDate(memo.date) || parseThaiDate(memo.createdAt) || new Date();
    const startMo = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const slItems = memo.slItems || [];
    const parsedItems = !slItems.length
      ? _parseSLSectionHTML((memo.sections||[]).find(s=>s.title?.includes('Software'))?.html||'')
      : slItems;

    const processItem = (monthly, moCount) => {
      for(let i = 0; i < moCount; i++) {
        const d = new Date(startMo.getFullYear(), startMo.getMonth()+i, 1);
        if(d >= cutoff && d <= now) {
          if(!actualByProj[proj]) actualByProj[proj] = 0;
          actualByProj[proj] += monthly;
        }
      }
    };
    if(!parsedItems.length) { processItem((Number(memo.total)||0)/12, 12); }
    else parsedItems.forEach(item => processItem((item.price||0)*(item.qty||1), item.months||12));
  });

  // Budget per project = forecast avg × rangeVal months + infra × rangeVal
  const projData = allProjects.map(proj => {
    const licProgs  = {};
    approved.forEach(memo => {
      if((memo.project||'(ไม่ระบุ)') !== proj) return;
      const startDate = parseThaiDate(memo.date) || parseThaiDate(memo.createdAt) || new Date();
      const startMo = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      const slItems = memo.slItems || [];
      const parsedItems = !slItems.length
        ? _parseSLSectionHTML((memo.sections||[]).find(s=>s.title?.includes('Software'))?.html||'')
        : slItems;
      parsedItems.forEach(item => {
        const prog = item.name || 'SL';
        const mo   = item.months || 12;
        const monthly = (item.price||0)*(item.qty||1);
        for(let i = 0; i < mo; i++) {
          const d = new Date(startMo.getFullYear(), startMo.getMonth()+i, 1);
          const key = monthKey(d);
          if(!licProgs[prog]) licProgs[prog] = {};
          licProgs[prog][key] = (licProgs[prog][key]||0) + monthly;
        }
      });
    });

    // Forecast per prog = avg past actual
    let licForecast = 0;
    Object.values(licProgs).forEach(monthData => {
      const past = Object.values(monthData).filter(v=>v>0);
      licForecast += past.length ? past.reduce((s,v)=>s+v,0)/past.length : 0;
    });

    const infraMo = Object.values(infraCosts[proj]||{}).reduce((s,v)=>s+v,0);
    const budget  = (licForecast + infraMo) * rangeVal;
    const actual  = (actualByProj[proj]||0) + infraMo * rangeVal;
    const pct     = budget > 0 ? Math.round(actual/budget*100) : 0;
    const color   = pct > 100 ? 'var(--red)' : pct >= 90 ? 'var(--amber)' : 'var(--green)';
    const barW    = Math.min(pct, 100);

    return { proj, budget, actual, remaining: budget-actual, pct, color, barW };
  }).filter(d => d.budget > 0 || d.actual > 0);

  const totalBudget  = projData.reduce((s,d)=>s+d.budget,0);
  const totalActual  = projData.reduce((s,d)=>s+d.actual,0);
  const totalPct     = totalBudget > 0 ? Math.round(totalActual/totalBudget*100) : 0;
  const totalColor   = totalPct > 100 ? 'var(--red)' : totalPct >= 90 ? 'var(--amber)' : 'var(--green)';

  // Summary cards
  if(summary) summary.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--r-sm);padding:10px 12px">
      <div style="font-size:11px;color:var(--text-3);margin-bottom:3px">Budget (Forecast)</div>
      <div style="font-size:18px;font-weight:600">${money(Math.round(totalBudget))}</div>
      <div style="font-size:11px;color:var(--text-3)">${rangeVal} เดือน รวม</div>
    </div>
    <div style="background:var(--bg);border-radius:var(--r-sm);padding:10px 12px">
      <div style="font-size:11px;color:var(--text-3);margin-bottom:3px">Actual Spend</div>
      <div style="font-size:18px;font-weight:600;color:var(--blue)">${money(Math.round(totalActual))}</div>
      <div style="font-size:11px;color:var(--text-3)">SL memo + Infra</div>
    </div>
    <div style="background:${totalPct>100?'var(--red-50)':totalPct>=90?'var(--amber-50)':'var(--green-50)'};border-radius:var(--r-sm);padding:10px 12px">
      <div style="font-size:11px;color:${totalColor};margin-bottom:3px">Remaining</div>
      <div style="font-size:18px;font-weight:600;color:${totalColor}">${money(Math.round(totalBudget-totalActual))}</div>
      <div style="font-size:11px;color:${totalColor}">${totalPct}% utilized</div>
    </div>`;

  // Table rows
  if(!projData.length) {
    body.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูลเพียงพอสำหรับ Budget vs Actual</td></tr>`;
    return;
  }

  body.innerHTML = projData.map(d => `<tr>
    <td style="padding:9px 14px;border-bottom:1px solid var(--border);font-weight:500">${esc(d.proj)}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:right">${money(Math.round(d.budget))}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:right;color:var(--blue);font-weight:500">${money(Math.round(d.actual))}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:right;color:${d.color}">${d.remaining >= 0 ? '' : '-'}${money(Math.abs(Math.round(d.remaining)))}</td>
    <td style="padding:9px 14px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="flex:1;background:var(--border);border-radius:4px;height:6px;overflow:hidden">
          <div style="width:${d.barW}%;height:100%;background:${d.color};border-radius:4px"></div>
        </div>
        <span style="font-size:11px;font-weight:500;color:${d.color};min-width:36px">${d.pct}%</span>
      </div>
    </td>
  </tr>`).join('');
}
