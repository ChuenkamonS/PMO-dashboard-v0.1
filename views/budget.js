// ── SL+Infra sidebar nav ──
function switchSLNav(panel, btn) {
  ['forecast','infra','bva','budgetsettings'].forEach(p => {
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
  // Trigger render for panels that need it
  if(panel === 'budgetsettings') renderBudgetSettings();
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
// NEW structure: array of entry objects
// JS:  [ { id, project, program, monthly_cost, start_month, end_month } ]
// DB:  infra_costs table with same columns (start_month, end_month as "YYYY-MM" text)
//
// Helper: monthKey for a Date → "YYYY-MM"
const infraMonthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;

// Get months that overlap between an entry's [start,end] and a query [from,to]
// All args are "YYYY-MM" strings. Returns count of overlapping months.
function infraOverlapMonths(start, end, rangeFrom, rangeTo) {
  const s = start || '2000-01';
  const e = end   || '2099-12';
  const from = s > rangeFrom ? s : rangeFrom;
  const to   = e < rangeTo   ? e : rangeTo;
  if (from > to) return 0;
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

// Check if an infra entry is active in a given month ("YYYY-MM")
function infraActiveInMonth(entry, monthStr) {
  const s = entry.start_month || '2000-01';
  const e = entry.end_month   || '2099-12';
  return monthStr >= s && monthStr <= e;
}

let _infraCache = null;

// Load: returns array of entry objects
async function loadInfraCostsAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('infra_costs', 'GET', null, '?order=project.asc');
      _infraCache = (rows || []).map(r => ({
        id:           r.id,
        project:      r.project,
        program:      r.program,
        monthly_cost: Number(r.monthly_cost) || 0,
        start_month:  r.start_month || null,
        end_month:    r.end_month   || null,
      }));
      try { localStorage.setItem(INFRA_KEY, JSON.stringify(_infraCache)); } catch(e) {}
      return _infraCache;
    } catch(e) {
      console.warn('Supabase infra_costs read failed, fallback', e.message);
    }
  }
  return loadInfraCosts();
}

// Save single entry to Supabase + localStorage
async function saveInfraEntryAsync(entry) {
  const all = loadInfraCosts();
  const idx = all.findIndex(e => e.id === entry.id);
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  storeInfraCosts(all);
  _infraCache = all;
  if (await checkSupa()) {
    try {
      await supaFetch('infra_costs', 'POST', entry, '?on_conflict=id');
      _infraCache = null;
    } catch(e) { console.warn('Supabase infra save failed', e.message); }
  }
}

// Delete single entry
async function deleteInfraEntryAsync(id) {
  const all = loadInfraCosts().filter(e => e.id !== id);
  storeInfraCosts(all);
  _infraCache = all;
  if (await checkSupa()) {
    try {
      await supaFetch('infra_costs', 'DELETE', null, '?id=eq.' + encodeURIComponent(id));
      _infraCache = null;
    } catch(e) { console.warn('Supabase infra delete failed', e.message); }
  }
}

// localStorage fallback — returns array
function loadInfraCosts() {
  if (_infraCache !== null) return _infraCache;
  try {
    const d = JSON.parse(localStorage.getItem(INFRA_KEY) || '[]');
    // Migrate old flat-object format → array
    if (d && !Array.isArray(d)) {
      const migrated = [];
      Object.entries(d).forEach(([project, progs]) => {
        Object.entries(progs).forEach(([program, cost]) => {
          migrated.push({ id: `${project}__${program}`, project, program, monthly_cost: Number(cost)||0, start_month: null, end_month: null });
        });
      });
      storeInfraCosts(migrated);
      return migrated;
    }
    return Array.isArray(d) ? d : [];
  } catch(e) { return []; }
}
function storeInfraCosts(arr) {
  _infraCache = Array.isArray(arr) ? arr : [];
  try { localStorage.setItem(INFRA_KEY, JSON.stringify(_infraCache)); } catch(e) {}
}

// Helper: stable deterministic entry id (project + program, no timestamp)
function infraEntryId(project, program) {
  return `${project}__${program}`.replace(/[^a-zA-Z0-9_\-ก-๙]/g, '_');
}

// Get infra cost for a project in a specific month — used by Forecast + BvA
function getInfraCostForMonth(infraEntries, project, monthStr) {
  return infraEntries
    .filter(e => e.project === project && infraActiveInMonth(e, monthStr))
    .reduce((s, e) => s + (e.monthly_cost || 0), 0);
}

// Get all projects that appear in infra entries
function getInfraProjects(infraEntries) {
  return [...new Set(infraEntries.map(e => e.project))].sort();
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
  if(tab === 'overview')  { _ov.initialized = false; renderBudgetOverview(); }
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

const OV_PROJ_COLORS = ['#185FA5','#1D9E75','#EF9F27','#7F77DD','#5DCAA5','#D85A30','#888780','#3C3489','#639922'];
const OV_TYPE_COLORS = { sl:'#185FA5', hw:'#1D9E75', int:'#EF9F27', ent:'#7F77DD', dep:'#D85A30' };

const _ov = {
  groupBy: 'type',
  preset: 12,
  fromIdx: 0,
  toIdx: 11,
  allMonths: [],
  activeProjKeys: new Set(),
  activeTypeKeys: new Set(),
  initialized: false,
};

function renderBudgetOverview() {
  _ovBuildMonths();
  _ovInitState();
  _ovUpdateKPIs();
  _ovRenderChips();
  _ovRenderChart();
  _ovRenderBvA();
}

function _ovBuildMonths() {
  const now = new Date();
  _ov.allMonths = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    _ov.allMonths.push({
      key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,
      label: d.toLocaleString('th-TH', { month:'short', year:'2-digit' }),
    });
  }
  const fromSel = document.getElementById('ov-from-sel');
  const toSel   = document.getElementById('ov-to-sel');
  if (fromSel && !fromSel.options.length) {
    _ov.allMonths.forEach((m, i) => {
      const o1 = document.createElement('option'); o1.value = i; o1.textContent = m.label; fromSel.appendChild(o1);
      const o2 = document.createElement('option'); o2.value = i; o2.textContent = m.label; toSel.appendChild(o2);
    });
    toSel.value = _ov.allMonths.length - 1;
  }
}

function _ovInitState() {
  if (_ov.initialized) return;
  _ov.initialized = true;
  const approved = loadMemos().filter(m => memoStatusKey(m) === 'completed');
  const projKeys  = [...new Set(approved.map(m => m.project || '(ไม่ระบุ)'))].sort();
  _ov.activeProjKeys = new Set(projKeys);
  _ov.activeTypeKeys = new Set(['sl','hw','int','ent','dep']);
  _ovApplyPresetIdxs(12);
}

function _ovApplyPresetIdxs(n) {
  _ov.toIdx   = _ov.allMonths.length - 1;
  _ov.fromIdx = Math.max(0, _ov.toIdx - n + 1);
  _ovUpdatePeriodLabels();
}

function _ovUpdatePeriodLabels() {
  if (!_ov.allMonths.length) return;
  const from = _ov.allMonths[_ov.fromIdx];
  const to   = _ov.allMonths[_ov.toIdx];
  const n    = _ov.toIdx - _ov.fromIdx + 1;
  const txt  = `${from?.label} – ${to?.label} · ${n} เดือน`;
  ['ov-period-label','ov-period-label-a','ov-bva-period-label'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  });
  // Update donut title
  const dt = document.getElementById('ov-donut-title');
  if (dt) dt.textContent = `สัดส่วนรวม ${n} เดือน`;
}

// ── Period controls ──
function ovSetPreset(n) {
  _ov.preset = n;
  document.querySelectorAll('.ov-preset-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('ov-pbtn-' + n)?.classList.add('active');
  const cr = document.getElementById('ov-custom-range');
  if (n === 0) {
    if (cr) cr.style.display = 'flex';
  } else {
    if (cr) cr.style.display = 'none';
    // Cap at 12 months
    _ovApplyPresetIdxs(Math.min(n, 12));
    _ovUpdateKPIs();
    _ovRenderChart();
    _ovRenderBvA();
  }
}

function ovApplyCustomRange() {
  const f = parseInt(document.getElementById('ov-from-sel')?.value ?? 0);
  const t = parseInt(document.getElementById('ov-to-sel')?.value ?? _ov.allMonths.length - 1);
  // Cap range at 12 months
  const cappedT = Math.min(Math.max(f, t), f + 11);
  _ov.fromIdx = f;
  _ov.toIdx   = cappedT;
  // Sync to-sel if capped
  const toSel = document.getElementById('ov-to-sel');
  if (toSel) toSel.value = cappedT;
  _ovUpdatePeriodLabels();
  _ovUpdateKPIs();
  _ovRenderChart();
  _ovRenderBvA();
}

// ── Group by ──
function ovSetGroup(g) {
  _ov.groupBy = g;
  document.querySelectorAll('.ov-group-btn').forEach(b => {
    const active = b.id === 'ov-gbtn-' + g;
    b.style.background = active ? 'var(--blue)' : 'transparent';
    b.style.color      = active ? '#fff' : 'var(--text-2)';
  });
  // Hide type chips when grouping by project
  const typeCol = document.getElementById('ov-type-col');
  if (typeCol) typeCol.style.display = g === 'type' ? '' : 'none';
  _ovRenderChart();
}

// ── Chip toggles ──
function ovToggleProj(k) {
  if (_ov.activeProjKeys.has(k)) { if (_ov.activeProjKeys.size > 1) _ov.activeProjKeys.delete(k); }
  else _ov.activeProjKeys.add(k);
  _ovRenderChips(); _ovUpdateKPIs(); _ovRenderChart(); _ovRenderBvA();
}
function ovToggleType(k) {
  if (_ov.activeTypeKeys.has(k)) { if (_ov.activeTypeKeys.size > 1) _ov.activeTypeKeys.delete(k); }
  else _ov.activeTypeKeys.add(k);
  _ovRenderChips(); _ovUpdateKPIs(); _ovRenderChart();
}

// ── Chips ──
function _ovRenderChips() {
  const approved = loadMemos().filter(m => memoStatusKey(m) === 'completed');
  const projKeys = [...new Set(approved.map(m => m.project || '(ไม่ระบุ)'))].sort();
  const typeKeys = ['sl','hw','int','ent','dep'];
  const chip = (label, on, onclick) =>
    `<span onclick="${onclick}" style="display:inline-flex;align-items:center;font-size:11px;padding:4px 11px;border-radius:20px;cursor:pointer;user-select:none;margin-bottom:3px;transition:all 0.12s;border:0.5px solid ${on ? 'transparent' : 'var(--border)'};background:${on ? 'var(--blue)' : 'transparent'};color:${on ? '#fff' : 'var(--text-2)'}">${label}</span>`;

  const projChips = document.getElementById('ov-proj-chips');
  if (projChips) projChips.innerHTML = projKeys.map(k => chip(esc(k), _ov.activeProjKeys.has(k), `ovToggleProj('${esc(k)}')`)).join('');

  const typeChips = document.getElementById('ov-type-chips');
  if (typeChips) typeChips.innerHTML = typeKeys.map(k => chip(BGT_TYPE_LABELS[k], _ov.activeTypeKeys.has(k), `ovToggleType('${k}')`)).join('');

  const tc = document.getElementById('ov-type-count');
  if (tc) tc.textContent = _ov.activeTypeKeys.size === typeKeys.length ? '(all)' : `(${_ov.activeTypeKeys.size}/${typeKeys.length})`;
}

// ── KPIs ──
function _ovUpdateKPIs() {
  const months    = _ov.allMonths.slice(_ov.fromIdx, _ov.toIdx + 1);
  const numMonths = months.length;
  const fromKey   = months[0]?.key;
  const toKey     = months[months.length - 1]?.key;
  const projArr   = [..._ov.activeProjKeys];
  const typeArr   = [..._ov.activeTypeKeys];

  // Actual: distribute SL by month, lump-sum others
  let total = 0;
  projArr.forEach(proj => {
    const byMonth = buildActualByMonth(proj);
    Object.entries(byMonth).forEach(([k, v]) => { if (k >= fromKey && k <= toKey) total += v.total; });
  });
  const nonSLTypes = typeArr.filter(t => t !== 'sl');
  if (nonSLTypes.length) {
    loadMemos().filter(m => memoStatusKey(m) === 'completed' && nonSLTypes.includes(m.type) && projArr.includes(m.project || '(ไม่ระบุ)')).forEach(m => {
      const d = parseThaiDate(m.date) || new Date(m.updatedAt || m.createdAt);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (k >= fromKey && k <= toKey) total += Number(m.total) || 0;
    });
  }

  const currentYear  = String(new Date().getFullYear() + 543);
  const slBudgets    = loadSLBudgets()?.[currentYear] || {};
  const annualBudget = projArr.reduce((s, p) => s + (slBudgets[p] || 0), 0);
  const budgetTotal  = annualBudget > 0 ? (annualBudget / 12) * numMonths : 0;

  const now = new Date();
  const smooth3Keys = [];
  for (let i = 3; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    smooth3Keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  let smooth3Total = 0;
  projArr.forEach(proj => {
    const byMonth = buildActualByMonth(proj);
    smooth3Keys.forEach(k => { smooth3Total += byMonth[k]?.total || 0; });
  });
  const smoothMonthlyRate = smooth3Total / 3;
  const monthsLeft        = 12 - now.getMonth();
  const ytdStart = `${now.getFullYear()}-01`;
  const ytdEnd   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  let ytdTotal = 0;
  projArr.forEach(proj => {
    const byMonth = buildActualByMonth(proj);
    Object.entries(byMonth).forEach(([k, v]) => { if (k >= ytdStart && k <= ytdEnd) ytdTotal += v.total; });
  });
  const forecastTotal = ytdTotal + smoothMonthlyRate * monthsLeft;

  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('bgt-kpi-total', money(Math.round(total)));
  setText('bgt-kpi-actual-sub', `กระจายตาม duration (${numMonths} เดือน)`);

  if (budgetTotal > 0) {
    const pct      = Math.round(total / budgetTotal * 100);
    const rem      = budgetTotal - total;
    const remColor = total > budgetTotal ? 'var(--red)' : pct >= 90 ? 'var(--amber)' : 'var(--green)';
    setText('bgt-kpi-budget', money(Math.round(budgetTotal)));
    setText('bgt-kpi-budget-sub', `ตั้งไว้ ${numMonths} เดือน`);
    const remEl = document.getElementById('bgt-kpi-remaining');
    if (remEl) { remEl.textContent = money(Math.round(rem)); remEl.style.color = remColor; }
    setText('bgt-kpi-remaining-sub', `${pct}% utilized`);
    const fColor = forecastTotal > annualBudget ? 'var(--red)' : forecastTotal / annualBudget >= 0.9 ? 'var(--amber)' : 'var(--green)';
    const fEl = document.getElementById('bgt-kpi-forecast');
    if (fEl) { fEl.textContent = money(Math.round(forecastTotal)); fEl.style.color = fColor; }
    setText('bgt-kpi-forecast-sub', 'avg 3 เดือนล่าสุด');
  } else {
    setText('bgt-kpi-budget', '—');
    const budEl = document.getElementById('bgt-kpi-budget-sub');
    if (budEl) budEl.innerHTML = `ยังไม่ได้ตั้งงบ — <span style="color:var(--blue);cursor:pointer;text-decoration:underline" onclick="switchSLNav('budgetsettings')">ตั้งค่าที่นี่</span>`;
    setText('bgt-kpi-remaining', '—');
    setText('bgt-kpi-remaining-sub', 'ต้องตั้งงบก่อน');
    const fEl = document.getElementById('bgt-kpi-forecast');
    if (fEl) { fEl.textContent = money(Math.round(forecastTotal)); fEl.style.color = 'var(--amber)'; }
    setText('bgt-kpi-forecast-sub', 'avg 3 เดือนล่าสุด (ไม่มีงบอ้างอิง)');
  }
}

// ── Bar chart ──
function _ovRenderChart() {
  const canvas = document.getElementById('ov-main-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }

  const months   = _ov.allMonths.slice(_ov.fromIdx, _ov.toIdx + 1);
  const labels   = months.map(m => m.label);
  const approved = loadMemos().filter(m => memoStatusKey(m) === 'completed');
  const typeKeys = [..._ov.activeTypeKeys];
  const projKeys = [..._ov.activeProjKeys];

  const getVal = (memo, monthKey) => {
    const d = parseThaiDate(memo.date) || new Date(memo.updatedAt || memo.createdAt);
    const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    return k === monthKey ? (Number(memo.total) || 0) : 0;
  };

  let datasets;
  if (_ov.groupBy === 'type') {
    datasets = typeKeys.map(tk => ({
      label: BGT_TYPE_LABELS[tk] || tk.toUpperCase(),
      backgroundColor: OV_TYPE_COLORS[tk],
      borderRadius: 3, borderSkipped: false,
      data: months.map(m => approved
        .filter(memo => projKeys.includes(memo.project || '(ไม่ระบุ)') && memo.type === tk)
        .reduce((s, memo) => s + getVal(memo, m.key), 0)),
    }));
  } else {
    datasets = projKeys.map((pk, pi) => ({
      label: pk,
      backgroundColor: OV_PROJ_COLORS[pi % OV_PROJ_COLORS.length],
      borderRadius: 3, borderSkipped: false,
      data: months.map(m => approved
        .filter(memo => (memo.project || '(ไม่ระบุ)') === pk && typeKeys.includes(memo.type))
        .reduce((s, memo) => s + getVal(memo, m.key), 0)),
    }));
  }

  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.raw || 0; if (!val) return null;
              const mIdx = ctx.dataIndex;
              const monthTotal = datasets.reduce((s, ds) => s + (ds.data[mIdx] || 0), 0);
              const pct = monthTotal > 0 ? Math.round(val / monthTotal * 100) : 0;
              return ` ${ctx.dataset.label}: ${money(Math.round(val))} (${pct}%)`;
            },
            footer: ctx => {
              if (!ctx.length) return '';
              const mIdx = ctx[0].dataIndex;
              const t = datasets.reduce((s, ds) => s + (ds.data[mIdx] || 0), 0);
              return t > 0 ? `Total: ${money(Math.round(t))}` : '';
            },
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { stacked: true, ticks: { callback: v => '฿' + Number(v).toLocaleString('th-TH'), font: { size: 10 } } },
      },
    },
  });

  _ovRenderDonut(datasets);
}

function _ovRenderDonut(datasets) {
  const donutCanvas = document.getElementById('ov-donut-chart');
  const legendEl    = document.getElementById('ov-donut-legend');
  if (!donutCanvas || typeof Chart === 'undefined') return;
  if (donutCanvas._chart) { donutCanvas._chart.destroy(); donutCanvas._chart = null; }

  const totals = datasets.map(ds => ds.data.reduce((s, v) => s + (v || 0), 0));
  const grand  = totals.reduce((s, v) => s + v, 0);

  // Show ALL active datasets in legend, even if zero — only hide from chart slices if truly 0
  const allItems = datasets.map((ds, i) => ({ label: ds.label, color: ds.backgroundColor, total: totals[i] }));
  const chartItems = grand > 0 ? allItems.filter(d => d.total > 0) : allItems;

  if (donutCanvas._chart) { donutCanvas._chart.destroy(); donutCanvas._chart = null; }

  if (grand > 0) {
    donutCanvas._chart = new Chart(donutCanvas, {
      type: 'doughnut',
      data: {
        labels: chartItems.map(d => d.label),
        datasets: [{ data: chartItems.map(d => d.total), backgroundColor: chartItems.map(d => d.color), borderWidth: 1.5, borderColor: '#fff', hoverOffset: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${money(Math.round(ctx.raw))} (${Math.round(ctx.raw/grand*100)}%)` } },
        },
      },
    });
  }

  if (legendEl) {
    legendEl.innerHTML = allItems.map(d => `
      <div style="display:flex;align-items:center;gap:5px;font-size:10px;color:var(--text-2)">
        <span style="width:8px;height:8px;border-radius:2px;background:${d.color};flex-shrink:0"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.label}</span>
        <span style="font-weight:500;color:${d.total > 0 ? 'var(--text)' : 'var(--text-3)'}">${grand > 0 ? Math.round(d.total/grand*100) : 0}%</span>
      </div>`).join('');
  }
}

// ── Section B: Budget vs Actual rows ──
function _ovRenderBvA() {
  const container = document.getElementById('ov-bva-rows');
  if (!container) return;

  const months    = _ov.allMonths.slice(_ov.fromIdx, _ov.toIdx + 1);
  const fromKey   = months[0]?.key;
  const toKey     = months[months.length - 1]?.key;
  const numMonths = months.length;
  const projKeys  = [..._ov.activeProjKeys];
  const currentYear = String(new Date().getFullYear() + 543);
  const slBudgets   = loadSLBudgets()?.[currentYear] || {};

  // Render BvA project chips
  const approved = loadMemos().filter(m => memoStatusKey(m) === 'completed');
  const allProjKeys = [...new Set(approved.map(m => m.project || '(ไม่ระบุ)'))].sort();
  const bvaChips = document.getElementById('ov-bva-proj-chips');
  if (bvaChips) {
    bvaChips.innerHTML = allProjKeys.map(k => {
      const on = _ov.activeProjKeys.has(k);
      return `<span onclick="ovToggleProj('${esc(k)}')" style="display:inline-flex;align-items:center;font-size:11px;padding:3px 10px;border-radius:20px;cursor:pointer;user-select:none;border:0.5px solid ${on ? 'transparent' : 'var(--border)'};background:${on ? 'var(--blue)' : 'transparent'};color:${on ? '#fff' : 'var(--text-2)'}">${esc(k)}</span>`;
    }).join('');
  }

  const rows = projKeys.map(proj => {
    let actual = 0;
    const byMonth = buildActualByMonth(proj);
    Object.entries(byMonth).forEach(([k, v]) => { if (k >= fromKey && k <= toKey) actual += v.total; });

    const annualBgt = slBudgets[proj] || 0;
    const budget    = annualBgt > 0 ? (annualBgt / 12) * numMonths : null;
    const hasBudget = budget !== null && budget > 0;
    const pct       = hasBudget ? Math.round(actual / budget * 100) : null;
    const color     = pct === null ? 'var(--text-3)' : pct > 100 ? 'var(--red)' : pct >= 90 ? 'var(--amber)' : 'var(--blue)';
    const barW      = pct !== null ? Math.min(pct, 100) : 0;
    return { proj, actual, budget, hasBudget, pct, color, barW };
  }).filter(d => d.actual > 0 || d.hasBudget);

  if (!rows.length) {
    container.innerHTML = `<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-3)">ยังไม่มีข้อมูล — Approve SL Memo หรือตั้งงบประมาณก่อน</div>`;
    return;
  }

  // Formula note
  const noteEl = document.getElementById('ov-bva-formula');
  if (noteEl) {
    noteEl.innerHTML = `
      <span style="font-weight:500">Budget</span> = งบรายปีที่ตั้งใน Budget Settings ÷ 12 × ${numMonths} เดือน &nbsp;·&nbsp;
      <span style="font-weight:500">Actual</span> = SL memo แต่ละรายการกระจายตาม duration (price/seat/เดือน) รวม Infra ที่ active ในช่วงนั้น`;
  }

  container.innerHTML = rows.map(d => `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
        <span style="font-weight:500;color:var(--text)">${esc(d.proj)}</span>
        <span style="color:var(--text-2)">
          ${money(Math.round(d.actual))} / ${d.hasBudget ? money(Math.round(d.budget)) : '— (ไม่มีงบ)'}
          ${d.pct !== null ? `<span style="margin-left:6px;font-weight:500;color:${d.color}">${d.pct}%</span>` : ''}
        </span>
      </div>
      <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="width:${d.barW}%;height:100%;background:${d.color};border-radius:4px;transition:width .3s"></div>
      </div>
      ${d.hasBudget ? `<div style="font-size:10px;color:${d.color};margin-top:3px">${d.pct > 100 ? `เกินงบ ${money(Math.round(d.actual - d.budget))}` : d.pct >= 90 ? `เหลือ ${money(Math.round(d.budget - d.actual))} — ใกล้ limit` : `เหลือ ${money(Math.round(d.budget - d.actual))}`}</div>` : ''}
    </div>`).join('');
}

// Stubs kept for backward compat
function ovSetMode(m) { _ovUpdateKPIs(); _ovRenderChart(); _ovRenderBvA(); }
function ovSetStack(s) {}


// ══════════════════════════════════════════
// SUB-TAB 2: SL + INFRA
// ══════════════════════════════════════════
function renderBudgetSLInfra() {
  // Load fresh from Supabase then render
  loadInfraCostsAsync().then(infraCosts => _renderBudgetSLInfraWith(infraCosts)).catch(() => _renderBudgetSLInfraWith(loadInfraCosts()));
}

function _renderBudgetSLInfraWith(infraEntries) {
  const licByProj  = getLicenseCostByProject();
  const infraProjs = getInfraProjects(infraEntries);

  // Include Company-Wide + projects from SL memo budget sources
  const slBudgetProjects = Object.keys(loadSLBudgets()?.[String(new Date().getFullYear()+543)] || {});
  const memoSources = [...new Set(
    loadMemos().filter(m=>memoStatusKey(m)==='completed'&&m.type==='sl')
      .map(m => m.budgetSource || m.project || '(ไม่ระบุ)')
  )];
  const allProjects = [...new Set([
    ...Object.keys(licByProj),
    ...infraProjs,
    ...slBudgetProjects,
    ...memoSources,
  ])].sort();

  // Cost by Project table: show current monthly rate
  // For infra: sum entries that are active this month
  const thisMonth = infraMonthKey(new Date());
  let totalLicense = 0, totalInfra = 0;
  const projData = allProjects.map(proj => {
    const lic   = licByProj[proj] || 0;
    const infra = getInfraCostForMonth(infraEntries, proj, thisMonth);
    totalLicense += lic;
    totalInfra   += infra;
    return { proj, lic, infra, total: lic + infra };
  });

  // ── KPIs ──
  const setKpi = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = money(val); };
  setKpi('sl-kpi-total',   totalLicense + totalInfra);
  setKpi('sl-kpi-license', totalLicense);
  setKpi('sl-kpi-infra',   totalInfra);

  // ── Forecast vs Actual Table ──
  _renderForecastTable(allProjects, infraEntries, licByProj);

  // Cost by Project panel removed

  // ── Infra Matrix ──
  _renderInfraMatrix(infraEntries);

  // ── Budget vs Actual ──
  _renderBudgetVsActual(allProjects, infraEntries, licByProj);
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
  console.warn('[parseThaiDate] ไม่สามารถ parse วันที่ได้:', str, '— จะใช้ createdAt/approvedAt แทน');
  return null;
}


// ════════════════════════════════════════════════════
// SHARED HELPER — distributes SL memo amounts by month
// proj: project name, or null for all, or 'Company-Wide' for shared
// Respects budgetSource — auto = project, override = budgetSource
// ════════════════════════════════════════════════════
function getMemoBudgetSource(memo) {
  // If PMO overrode, use that; otherwise default to memo.project
  return memo.budgetSource || memo.project || '(ไม่ระบุ)';
}

function buildActualByMonth(proj) {
  const approved = loadMemos().filter(m =>
    memoStatusKey(m) === 'completed' &&
    m.type === 'sl' &&
    (proj === null || getMemoBudgetSource(m) === proj)
  );
  const result = {}; // { 'YYYY-MM': { total, memos: [] } }

  approved.forEach(memo => {
    const memoProj = memo.project || '(ไม่ระบุ)';
    const startDate = parseThaiDate(memo.date) || parseThaiDate(memo.createdAt) || new Date();
    const startMo = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const slItems = memo.slItems || [];
    const parsedItems = !slItems.length
      ? _parseSLSectionHTML((memo.sections||[]).find(s=>s.title?.includes('Software'))?.html||'')
      : slItems;

    const addEntry = (name, price, qty, moCount) => {
      const monthly = (price||0) * (qty||1);
      for(let i = 0; i < moCount; i++) {
        const d = new Date(startMo.getFullYear(), startMo.getMonth()+i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if(!result[key]) result[key] = { total: 0, memos: [] };
        result[key].total += monthly;
        const ex = result[key].memos.find(x => x.memoNo === memo.memoNo && x.name === name);
        if(ex) ex.monthly += monthly;
        else result[key].memos.push({ memoNo: memo.memoNo, proj: memoProj, name, price, qty: qty||1, monthly });
      }
    };

    if(!parsedItems.length) {
      addEntry('SL รวม', (Number(memo.total)||0)/12, 1, 12);
    } else {
      parsedItems.forEach(item => addEntry(item.name||'SL', item.price||0, item.qty||1, item.months||12));
    }
  });
  return result;
}

// Get actual spend for a project in a month range (inclusive YYYY-MM strings)
function getActualInRange(proj, fromKey, toKey) {
  const byMonth = buildActualByMonth(proj);
  return Object.entries(byMonth)
    .filter(([k]) => k >= fromKey && k <= toKey)
    .reduce((s, [, v]) => s + v.total, 0);
}

// ── Forecast vs Actual ──
function _renderForecastTable(allProjects, infraEntries, licByProj) {
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
      // Use item.startMonth if available, else fall back to memo.date
      const itemStart = item.startMonth
        ? new Date(item.startMonth + '-01')
        : startMo;
      for(let i = 0; i < mo; i++) {
        const d = new Date(itemStart.getFullYear(), itemStart.getMonth() + i, 1);
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
    const licProgs = actualByProjProg[proj] || {};
    const projInfraEntries = infraEntries.filter(e => e.project === proj);
    const infraProgNames   = [...new Set(projInfraEntries.map(e => e.program))];
    const allProgs = [...new Set([...Object.keys(licProgs), ...infraProgNames])];

    if(!allProgs.length) return;

    let projTotal = 0;
    const projMonthTotals = months.map(() => 0);

    // License rows
    Object.entries(licProgs).forEach(([prog, monthData]) => {
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

    // Infra rows — respect start/end month
    infraProgNames.forEach(prog => {
      let rowTotal = 0;
      const cells = months.map((m, mi) => {
        const key = monthKey(m);
        const cost = projInfraEntries
          .filter(e => e.program === prog && infraActiveInMonth(e, key))
          .reduce((s, e) => s + (e.monthly_cost || 0), 0);
        rowTotal += cost; projMonthTotals[mi] += cost; projTotal += cost;
        if(cost > 0) return `<td style="${isFuture(m) ? tdFS : tdS}">${money(cost)}</td>`;
        return `<td style="${isFuture(m) ? tdFS : tdS};color:var(--text-3)">—</td>`;
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
  const approved = loadMemos().filter(m => memoStatusKey(m)==='completed' && m.type==='sl' && getMemoBudgetSource(m) === proj);
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
function _renderInfraMatrix(infraEntries) {
  const infraThead = document.getElementById('sl-infra-thead');
  const infraBody  = document.getElementById('sl-infra-body');
  if(!infraThead || !infraBody) return;

  if(!infraEntries.length) {
    infraThead.innerHTML = '';
    infraBody.innerHTML  = `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูล Infra — กด "+ Add Infra Cost" เพื่อเพิ่ม</td></tr>`;
    return;
  }

  const thS = 'padding:8px 12px;font-size:11px;font-weight:600;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap';
  const thR = thS + ';text-align:right';
  infraThead.innerHTML = `<tr>
    <th style="${thS}">Project</th>
    <th style="${thS}">Program</th>
    <th style="${thR}">Monthly Cost</th>
    <th style="${thS}">Start</th>
    <th style="${thS}">End</th>
    <th style="${thS}">Actions</th>
  </tr>`;

  const tdS = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:12px';
  const tdR = tdS + ';text-align:right';
  infraBody.innerHTML = infraEntries.map(entry => `<tr>
    <td style="${tdS};font-weight:500">${esc(entry.project)}</td>
    <td style="${tdS}">${esc(entry.program)}</td>
    <td style="${tdR};font-weight:600">${money(entry.monthly_cost)}</td>
    <td style="${tdS};color:var(--text-2)">${entry.start_month || '—'}</td>
    <td style="${tdS};color:var(--text-2)">${entry.end_month || 'ongoing'}</td>
    <td style="${tdS};white-space:nowrap">
      <button class="btn-sm" style="padding:2px 7px;font-size:11px" onclick="openInfraModal('${esc(entry.id)}')">✎</button>
      <button class="btn-sm" style="padding:2px 7px;font-size:11px;color:var(--red)" onclick="deleteInfraEntry('${esc(entry.id)}')">✕</button>
    </td>
  </tr>`).join('');
}

// ══════════════════════════════════════════
// INFRA MODAL — Add / Edit entry
// ══════════════════════════════════════════
function openInfraModal(entryId) {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const entry = entryId ? loadInfraCosts().find(e => e.id === entryId) : null;

  document.getElementById('infra-modal').style.display = 'flex';
  document.getElementById('infra-form').innerHTML = `
    <input type="hidden" id="inf-entry-id" value="${esc(entry?.id||'')}">
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div class="fg"><label>Project *</label>
        <select id="inf-project" class="ri">
          <option value="">— เลือกโครงการ —</option>
          ${projects.map(p=>`<option value="${esc(p)}" ${p===(entry?.project||'')?'selected':''}>${esc(p)}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Program *</label>
        <input id="inf-program" class="ri" placeholder="เช่น AWS, DataDog" value="${esc(entry?.program||'')}">
      </div>
      <div class="fg"><label>Monthly Cost (THB) *</label>
        <input id="inf-monthly" class="ri" type="number" min="0" placeholder="0" value="${entry?.monthly_cost||''}">
      </div>
      <div class="fg"></div>
      <div class="fg"><label>Start Month (YYYY-MM)</label>
        <input id="inf-start" class="ri" type="month" value="${entry?.start_month||''}">
      </div>
      <div class="fg"><label>End Month (YYYY-MM) — ว่างไว้ = ongoing</label>
        <input id="inf-end" class="ri" type="month" value="${entry?.end_month||''}">
      </div>
    </div>`;
}

function closeInfraModal() { document.getElementById('infra-modal').style.display = 'none'; }

function deleteInfraEntry(id) {
  if(!confirm('ลบรายการนี้?')) return;
  deleteInfraEntryAsync(id).catch(e => console.warn('Supabase infra delete failed', e));
  renderBudgetSLInfra();
}

function saveInfraCost() {
  const project = document.getElementById('inf-project')?.value;
  const program = document.getElementById('inf-program')?.value?.trim();
  const monthly = parseFloat(document.getElementById('inf-monthly')?.value)||0;
  const start   = document.getElementById('inf-start')?.value || null;
  const end     = document.getElementById('inf-end')?.value   || null;
  const editId  = document.getElementById('inf-entry-id')?.value;

  if(!project) { alert('กรุณาเลือก Project'); return; }
  if(!program) { alert('กรุณากรอก Program'); return; }
  if(!monthly) { alert('กรุณากรอก Monthly Cost'); return; }

  // Generate stable id; if editing reuse existing id, if new ensure uniqueness
  let id = editId || infraEntryId(project, program);
  if (!editId) {
    // Avoid collision with existing entries for same project+program
    const existing = loadInfraCosts().filter(e => e.id.startsWith(infraEntryId(project, program)));
    if (existing.length > 0) id = `${infraEntryId(project, program)}_${existing.length + 1}`;
  }

  const entry = { id, project, program, monthly_cost: monthly, start_month: start, end_month: end };

  saveInfraEntryAsync(entry).catch(e => console.warn('Supabase infra save failed', e));
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
      const currentEntries = loadInfraCosts();
      rows.forEach(row => {
        const proj  = String(row['Project']||row['project']||'').trim();
        const prog  = String(row['Program']||row['program']||row['Program Name']||'').trim();
        const amt   = parseFloat(row['Monthly Cost']||row['monthly_cost']||row['Cost']||0)||0;
        const start = String(row['Start Month']||row['start_month']||'').trim() || null;
        const end   = String(row['End Month']||row['end_month']||'').trim() || null;
        if(!proj || !prog || !amt) return;
        const id = infraEntryId(proj, prog);
        currentEntries.push({ id, project: proj, program: prog, monthly_cost: amt, start_month: start, end_month: end });
        added++;
      });

      storeInfraCosts(currentEntries);
      _infraCache = null;
      // Push all new entries to Supabase
      Promise.all(currentEntries.slice(-added).map(e => saveInfraEntryAsync(e))).catch(e => console.warn('Supabase bulk save failed', e));
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
function _renderBudgetVsActual(allProjects, infraEntries, licByProj) {
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

    const processItem = (monthly, moCount, itemStartMo) => {
      for(let i = 0; i < moCount; i++) {
        const d = new Date(itemStartMo.getFullYear(), itemStartMo.getMonth()+i, 1);
        if(d >= cutoff && d <= now) {
          if(!actualByProj[proj]) actualByProj[proj] = 0;
          actualByProj[proj] += monthly;
        }
      }
    };
    if(!parsedItems.length) { processItem((Number(memo.total)||0)/12, 12, startMo); }
    else parsedItems.forEach(item => {
      const itemStart = item.startMonth ? new Date(item.startMonth + '-01') : startMo;
      processItem((item.price||0)*(item.qty||1), item.months||12, itemStart);
    });
  });

  // Budget per project — from Budget Settings (annual ÷ 12 × range)
  const currentYear = String(new Date().getFullYear() + 543); // Thai Buddhist year
  const slBudgets   = loadSLBudgets()?.[currentYear] || {};
  const projData = allProjects.map(proj => {
    // Infra: sum monthly costs for entries active within the range
    const rangeFrom = infraMonthKey(new Date(now.getFullYear(), now.getMonth() - rangeVal, 1));
    const rangeTo   = infraMonthKey(now);
    const infraActual = infraEntries
      .filter(e => e.project === proj)
      .reduce((s, e) => s + (e.monthly_cost || 0) * infraOverlapMonths(e.start_month, e.end_month, rangeFrom, rangeTo), 0);

    // Budget: same entries but projected forward rangeVal months from today
    const budgetFrom = infraMonthKey(now);
    const budgetTo   = infraMonthKey(new Date(now.getFullYear(), now.getMonth() + rangeVal - 1, 1));
    const infraBudget = infraEntries
      .filter(e => e.project === proj)
      .reduce((s, e) => s + (e.monthly_cost || 0) * infraOverlapMonths(e.start_month, e.end_month, budgetFrom, budgetTo), 0);

    // Use Budget Settings if set — if not, budget = null (no budget configured)
    const annualBgt  = slBudgets[proj] || 0;
    const licMonthly = annualBgt > 0 ? annualBgt / 12 : 0;
    const budget     = annualBgt > 0 ? (licMonthly * rangeVal) + infraBudget : null;
    const actual     = (actualByProj[proj]||0) + infraActual;
    const hasBudget  = budget !== null;
    const pct        = hasBudget && budget > 0 ? Math.round(actual/budget*100) : null;
    const color      = pct === null ? 'var(--text-3)' : pct > 100 ? 'var(--red)' : pct >= 90 ? 'var(--amber)' : 'var(--green)';
    const barW       = pct !== null ? Math.min(pct, 100) : 0;

    return { proj, budget, actual, remaining: hasBudget ? budget-actual : null, pct, color, barW, hasBudget };
  // Show row if has actual spend OR has budget set
  }).filter(d => d.actual > 0 || d.hasBudget);

  const totalBudget  = projData.reduce((s,d)=>s+d.budget,0);
  const totalActual  = projData.reduce((s,d)=>s+d.actual,0);
  const totalPct     = totalBudget > 0 ? Math.round(totalActual/totalBudget*100) : 0;
  const totalColor   = totalPct > 100 ? 'var(--red)' : totalPct >= 90 ? 'var(--amber)' : 'var(--green)';

  // Summary cards
  if(summary) summary.innerHTML = `
    <div style="background:var(--bg);border-radius:var(--r-sm);padding:10px 12px">
      <div style="font-size:11px;color:var(--text-3);margin-bottom:3px">Budget (Annual Settings)</div>
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

// ════════════════════════════════════════
// BUDGET SETTINGS (Annual budget per project)
// ════════════════════════════════════════
const SLINF_BUDGET_KEY = 'orbit-pmo-sl-budgets-v1';

function loadSLBudgets() {
  try { return JSON.parse(localStorage.getItem(SLINF_BUDGET_KEY)||'{}'); }
  catch(e) { return {}; }
}
function storeSLBudgets(d) {
  try { localStorage.setItem(SLINF_BUDGET_KEY, JSON.stringify(d)); } catch(e) {}
}
function getSLBudgetForProject(proj, year) {
  const d = loadSLBudgets();
  return d[year]?.[proj] || 0;
}

function renderBudgetSettings() {
  const body = document.getElementById('sl-budget-settings-body');
  if(!body) return;
  const year = document.getElementById('sl-bgt-year')?.value || '2569';
  const budgets = loadSLBudgets();
  const yearData = budgets[year] || {};

  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  // Combine: settings projects + projects from actual memos + Company-Wide + already budgeted
  const memoProjects = [...new Set(
    loadMemos()
      .filter(m => m.type === 'sl' && memoStatusKey(m) === 'completed')
      .map(m => m.project || '(ไม่ระบุ)')
      .filter(Boolean)
  )];
  const projects = [...new Set([
    ...(s?.projects || []),
    ...memoProjects,
    'Company-Wide',
    ...Object.keys(yearData)
  ])].filter(p => p && p !== '(ไม่ระบุ)');

  if(!projects.length) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:12px">ยังไม่มีโปรเจค — กด "+ เพิ่มโปรเจค" หรือตั้งค่าโปรเจคใน Settings ก่อน</div>`;
    return;
  }

  const tdS = 'padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px';
  body.innerHTML = `
    <table class="hist-table" style="margin-bottom:12px">
      <thead><tr>
        <th style="padding:8px 12px;text-align:left;font-weight:500">Project</th>
        <th style="padding:8px 12px;text-align:left;font-weight:500">Annual Budget (฿)</th>
        <th style="padding:8px 12px;text-align:right;font-weight:500">Monthly (คำนวณให้)</th>
        <th style="padding:8px 12px;text-align:center;font-weight:500">Actions</th>
      </tr></thead>
      <tbody>
        ${projects.map(proj => {
          const annual = yearData[proj] || 0;
          const monthly = annual ? Math.round(annual/12) : 0;
          const isCompany = proj === 'Company-Wide';
          return `<tr style="${isCompany?'background:var(--blue-50)':''}">
            <td style="${tdS};font-weight:500">${esc(proj)}${isCompany?'<span style="font-size:10px;background:#E6F1FB;color:#0C447C;padding:1px 6px;border-radius:4px;margin-left:6px">Shared</span>':''}</td>
            <td style="${tdS}">
              <input type="number" id="bgt-inp-${esc(proj)}" value="${annual||''}" placeholder="0"
                style="font-size:12px;padding:4px 8px;width:160px"
                oninput="updateMonthlyPreview('${esc(proj)}')">
            </td>
            <td style="${tdS};text-align:right;color:var(--text-3)" id="bgt-mo-${esc(proj)}">${annual ? money(monthly) : '—'}</td>
            <td style="${tdS};text-align:center">
              <button class="btn-primary" onclick="saveBudgetRow('${esc(proj)}')" style="font-size:11px;padding:3px 10px">Save</button>
              ${annual ? `<button class="btn-sm" onclick="clearBudgetRow('${esc(proj)}')" style="font-size:11px;padding:3px 8px;margin-left:4px;color:var(--red)">✕</button>` : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div style="font-size:11px;color:var(--text-3)">* Company-Wide = งบกลาง เช่น AI tools ที่ใช้ทั้งบริษัท</div>`;
}

function updateMonthlyPreview(proj) {
  const inp = document.getElementById('bgt-inp-' + proj);
  const moEl = document.getElementById('bgt-mo-' + proj);
  if(!inp || !moEl) return;
  const annual = parseFloat(inp.value)||0;
  moEl.textContent = annual ? money(Math.round(annual/12)) : '—';
}

function saveBudgetRow(proj) {
  const inp = document.getElementById('bgt-inp-' + proj);
  const year = document.getElementById('sl-bgt-year')?.value || '2569';
  const annual = parseFloat(inp?.value)||0;
  const budgets = loadSLBudgets();
  if(!budgets[year]) budgets[year] = {};
  if(annual > 0) budgets[year][proj] = annual;
  else delete budgets[year][proj];
  storeSLBudgets(budgets);
  renderBudgetSettings();
  // refresh BvA if visible
  if(document.getElementById('sl-panel-bva')?.style.display !== 'none') renderBudgetSLInfra();
}

function clearBudgetRow(proj) {
  if(!confirm(`ลบงบประมาณของ "${proj}" ออก?`)) return;
  const year = document.getElementById('sl-bgt-year')?.value || '2569';
  const budgets = loadSLBudgets();
  if(budgets[year]) delete budgets[year][proj];
  storeSLBudgets(budgets);
  renderBudgetSettings();
}

function addBudgetRow() {
  const proj = prompt('ชื่อโปรเจค หรือ "Company-Wide":');
  if(!proj || !proj.trim()) return;
  const year = document.getElementById('sl-bgt-year')?.value || '2569';
  const budgets = loadSLBudgets();
  if(!budgets[year]) budgets[year] = {};
  if(!(proj in budgets[year])) budgets[year][proj] = 0;
  storeSLBudgets(budgets);
  renderBudgetSettings();
}

// ── Spending Breakdown (kept for SL+Infra tab use if needed) ──
function _renderSpendBreakdown() {
  const thead = document.getElementById('ov-breakdown-thead');
  const tbody = document.getElementById('ov-breakdown-body');
  if(!thead || !tbody) return;

  const rangeVal = val('#ov-range') || '12';
  const projVal  = val('#ov-project') || 'all';
  const typeVal  = val('#ov-type') || 'all';
  const types    = typeVal === 'all' ? ['sl','hw','int','ent','dep'] : [typeVal];

  let approved = loadMemos().filter(m => memoStatusKey(m) === 'completed');
  if(rangeVal !== 'all') {
    const now = new Date();
    const cutoffKey = `${new Date(now.getFullYear(), now.getMonth()-(parseInt(rangeVal)-1), 1).getFullYear()}-${String(new Date(now.getFullYear(), now.getMonth()-(parseInt(rangeVal)-1), 1).getMonth()+1).padStart(2,'0')}`;
    approved = approved.filter(m => {
      const d = parseThaiDate(m.date) || new Date(m.updatedAt||m.createdAt);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      return k >= cutoffKey;
    });
  }
  if(projVal !== 'all') approved = approved.filter(m => (m.project||'ไม่ระบุ') === projVal);
  approved = approved.filter(m => types.includes(m.type));

  const projects = [...new Set(approved.map(m => m.project||'ไม่ระบุ'))].sort();

  const thS = 'padding:7px 10px;font-size:10px;font-weight:600;color:var(--text-3);border-bottom:1px solid var(--border);text-align:right;white-space:nowrap';

  if(_spendViewMode === 'cumulative') {
    // Build per project × type
    thead.innerHTML = `<tr>
      <th style="${thS};text-align:left">Project</th>
      ${types.map(t => `<th style="${thS}">${(BGT_TYPE_LABELS[t]||t).split(' ')[0]}</th>`).join('')}
      <th style="${thS};color:var(--blue)">Total</th>
    </tr>`;

    const tdS = 'padding:7px 10px;border-bottom:1px solid var(--border);font-size:12px;text-align:right';
    let grandTotal = 0;
    const typeTotals = {};
    types.forEach(t => typeTotals[t] = 0);

    tbody.innerHTML = projects.map(proj => {
      const byType = {};
      let rowTotal = 0;
      types.forEach(t => {
        const amt = approved.filter(m => (m.project||'ไม่ระบุ')===proj && m.type===t)
          .reduce((s,m) => s+(Number(m.total)||0), 0);
        byType[t] = amt;
        rowTotal += amt;
        typeTotals[t] += amt;
      });
      grandTotal += rowTotal;
      return `<tr>
        <td style="${tdS};text-align:left;font-weight:500">${esc(proj)}</td>
        ${types.map(t => `<td style="${tdS};color:${byType[t]>0?'var(--text)':'var(--text-3)'}">${byType[t]>0?money(byType[t]):'—'}</td>`).join('')}
        <td style="${tdS};font-weight:600;color:var(--blue)">${money(rowTotal)}</td>
      </tr>`;
    }).join('') + `<tr style="background:var(--bg)">
      <td style="${tdS};text-align:left;font-weight:600;color:var(--text-2)">Total</td>
      ${types.map(t => `<td style="${tdS};font-weight:600">${typeTotals[t]>0?money(typeTotals[t]):'—'}</td>`).join('')}
      <td style="${tdS};font-weight:700;color:var(--blue)">${money(grandTotal)}</td>
    </tr>`;

  } else {
    // Monthly view
    const now = new Date();
    const months = [];
    const n = rangeVal === 'all' ? 12 : parseInt(rangeVal);
    for(let i = n-1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleString('th-TH',{month:'short',year:'2-digit'}) });
    }

    thead.innerHTML = `<tr>
      <th style="${thS};text-align:left">Project</th>
      ${months.map(m => `<th style="${thS}">${esc(m.label)}</th>`).join('')}
      <th style="${thS};color:var(--blue)">Total</th>
    </tr>`;

    const tdS = 'padding:7px 10px;border-bottom:1px solid var(--border);font-size:12px;text-align:right';
    let grandTotal = 0;
    const monthTotals = {};
    months.forEach(m => monthTotals[m.key] = 0);

    tbody.innerHTML = projects.map(proj => {
      let rowTotal = 0;
      const cells = months.map(mo => {
        const amt = approved.filter(m => {
          if((m.project||'ไม่ระบุ') !== proj) return false;
          const d = parseThaiDate(m.date) || new Date(m.updatedAt||m.createdAt);
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === mo.key;
        }).reduce((s,m) => s+(Number(m.total)||0), 0);
        rowTotal += amt;
        monthTotals[mo.key] += amt;
        return `<td style="${tdS};color:${amt>0?'var(--text)':'var(--text-3)'}">${amt>0?money(amt):'—'}</td>`;
      }).join('');
      grandTotal += rowTotal;
      return `<tr>
        <td style="${tdS};text-align:left;font-weight:500">${esc(proj)}</td>
        ${cells}
        <td style="${tdS};font-weight:600;color:var(--blue)">${money(rowTotal)}</td>
      </tr>`;
    }).join('') + `<tr style="background:var(--bg)">
      <td style="${tdS};text-align:left;font-weight:600;color:var(--text-2)">Total</td>
      ${months.map(m => `<td style="${tdS};font-weight:600">${monthTotals[m.key]>0?money(monthTotals[m.key]):'—'}</td>`).join('')}
      <td style="${tdS};font-weight:700;color:var(--blue)">${money(grandTotal)}</td>
    </tr>`;
  }
}
