// ─────────────────────────────────────────
// views/budget.js — Memo & Budget Monitor
// ─────────────────────────────────────────

// ── Data helpers ──
function getBudgetMemos(range, project) {
  let memos = loadMemos();
  const now = new Date();
  if(range === 'month') {
    memos = memos.filter(m => {
      const d = new Date(m.updatedAt||m.createdAt);
      return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
    });
  } else if(range === 'last-month') {
    const lm = new Date(now.getFullYear(), now.getMonth()-1, 1);
    memos = memos.filter(m => {
      const d = new Date(m.updatedAt||m.createdAt);
      return d.getFullYear()===lm.getFullYear() && d.getMonth()===lm.getMonth();
    });
  } else if(range === '3-months') {
    const cut = new Date(now); cut.setMonth(cut.getMonth()-3);
    memos = memos.filter(m => new Date(m.updatedAt||m.createdAt) >= cut);
  }
  if(project && project !== 'all') memos = memos.filter(m => m.project === project);

  // search
  const search = (val('#bgt-search')||'').toLowerCase();
  if(search) memos = memos.filter(m => `${m.memoNo} ${m.project} ${m.reviewerName} ${m.approverName} ${m.requesterName}`.toLowerCase().includes(search));

  // type
  const ft = val('#bgt-filter-type')||'all';
  if(ft !== 'all') memos = memos.filter(m => m.type === ft);

  // status
  const fs = val('#bgt-filter-status')||'all';
  if(fs !== 'all') memos = memos.filter(m => memoStatusKey(m) === fs);

  return memos;
}

// ── Sub-tab switching ──
function switchBudgetTab(tab, btn) {
  document.querySelectorAll('#view-budget .cost-tab-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('#bgt-subtab-bar .cost-stab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('bgt-tab-' + tab);
  if(panel) panel.style.display = '';
  if(btn) btn.classList.add('active');
  if(tab === 'trend') renderBudgetTrendTab();
}

// ── Main render ──
function renderBudget() {
  const range      = val('#bgt-range') || 'month';
  const projectSel = val('#bgt-project') || 'all';
  const all        = getBudgetMemos(range, projectSel);
  // Budget Monitor แสดงเฉพาะ approved (completed) เท่านั้น
  const approved = all.filter(m => memoStatusKey(m) === 'completed');

  const approvedAmt = approved.reduce((s,m) => s+(Number(m.total)||0), 0);
  document.getElementById('bgt-total').textContent       = money(approvedAmt);
  document.getElementById('bgt-total-count').textContent = approved.length + ' รายการ';

  const budgets     = typeof loadBudgets === 'function' ? loadBudgets() : {};
  const budgetTotal = Object.values(budgets).reduce((s,v) => s+(Number(v)||0), 0);
  const utilPct     = budgetTotal ? Math.round((approvedAmt/budgetTotal)*100) : 0;
  document.getElementById('bgt-util').textContent = `${utilPct}% Utilized`;

  // Per-project rows
  const allProjects = [...new Set(all.map(m => m.project||'ไม่ระบุ'))];
  let near = 0;
  const projRows = [];
  allProjects.forEach(p => {
    const projMemos = all.filter(m => (m.project||'ไม่ระบุ') === p);
    const app    = projMemos.filter(m => memoStatusKey(m)==='completed').reduce((s,m) => s+(Number(m.total)||0), 0);
    const budget = Number(budgets[p]||0);
    const util   = budget ? Math.round((app/budget)*100) : 0;
    if(util >= 80) near++;
    const rem = Math.max(0, budget-app);
    const st  = util > 100 ? 'Over Budget' : util >= 70 ? 'Near Limit' : 'Normal';
    projRows.push({ project:p, budget, approved:app, remaining:rem, util, st, memos:projMemos });
  });
  document.getElementById('bgt-near-limit').textContent = `${near} Projects > 80%`;

  // Type chart
  const byType = {};
  approved.forEach(m => {
    if(!byType[m.type]) byType[m.type] = { count:0, total:0 };
    byType[m.type].count++; byType[m.type].total += Number(m.total)||0;
  });
  renderBudgetTypeChart(Object.entries(byType).sort((a,b) => b[1].total-a[1].total));

  // Project summary table with drill-down
  const sumBody = document.getElementById('bgt-summary-body');
  sumBody.innerHTML = !projRows.length
    ? '<tr><td colspan="6" style="padding:16px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูล</td></tr>'
    : projRows.map(r => `<tr style="cursor:pointer" onclick="drilldownProject('${esc(r.project)}')" title="คลิกดูรายการ memo">
        <td style="font-weight:500">${esc(r.project)}</td>
        <td class="mono">${money(r.budget)}</td>
        <td class="mono">${money(r.approved)}</td>
        <td class="mono">${money(r.remaining)}</td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${Math.min(r.util,100)}%;background:${r.util>100?'var(--red)':r.util>=70?'var(--amber)':'var(--green)'};border-radius:3px"></div>
            </div>
            <span style="font-size:11px;min-width:32px;text-align:right">${r.util}%</span>
          </div>
        </td>
        <td><span class="badge ${r.st==='Over Budget'?'badge-red':r.st==='Near Limit'?'badge-amber':'badge-green'}">${r.st}</span></td>
      </tr>`).join('');

  // Init trend tab if active
  const trendActive = document.querySelector('#bgt-subtab-bar .cost-stab[data-tab="trend"]')?.classList.contains('active');
  if(trendActive) renderBudgetTrendTab();
}

// ── Type chart ──
function renderBudgetTypeChart(rows) {
  const canvas = document.getElementById('bgt-type-chart');
  if(!canvas || typeof Chart === 'undefined') return;
  if(canvas._chart) canvas._chart.destroy();
  const TYPE_COLORS = { sl:'#185FA5', hw:'#3B6D11', int:'#854F0B', ent:'#3C3489', dep:'#A32D2D' };
  canvas._chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: rows.map(([t]) => t.toUpperCase()),
      datasets: [{ data: rows.map(([,v]) => v.total), backgroundColor: rows.map(([t]) => TYPE_COLORS[t]||'#888'), borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${money(ctx.raw)}` } }
      }
    }
  });
}

// ── Trend tab ──
let _bgtProjSelected = new Set();
let _bgtTypeSelected = new Set(['sl','hw','int','ent','dep']);

function renderBudgetTrendTab() {
  const allMemos   = loadMemos().filter(m => memoStatusKey(m) === 'completed');
  const allProjects = [...new Set(allMemos.map(m => m.project||'ไม่ระบุ'))].sort();
  const allTypes    = ['sl','hw','int','ent','dep'];

  if(!_bgtProjSelected.size) allProjects.forEach(p => _bgtProjSelected.add(p));

  // Build project checkboxes
  const projBox = document.getElementById('bgt-proj-checkboxes');
  if(projBox && !projBox.children.length) {
    projBox.innerHTML = allProjects.map(p => `
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;white-space:nowrap">
        <input type="checkbox" ${_bgtProjSelected.has(p)?'checked':''} onchange="toggleBgtProj('${esc(p)}',this.checked)">
        ${esc(p)}
      </label>`).join('');
  }

  // Build type checkboxes
  const typeBox = document.getElementById('bgt-type-checkboxes');
  if(typeBox && !typeBox.children.length) {
    typeBox.innerHTML = allTypes.map(t => `
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer">
        <input type="checkbox" ${_bgtTypeSelected.has(t)?'checked':''} onchange="toggleBgtType('${t}',this.checked)">
        ${t.toUpperCase()}
      </label>`).join('');
  }

  renderBudgetTrendChart(allMemos);
  renderBudgetProjChart(allMemos);
}

function toggleBgtProj(proj, checked) {
  if(checked) _bgtProjSelected.add(proj); else _bgtProjSelected.delete(proj);
  renderBudgetTrendChart(loadMemos().filter(m => memoStatusKey(m)==='completed'));
}
function toggleBgtType(type, checked) {
  if(checked) _bgtTypeSelected.add(type); else _bgtTypeSelected.delete(type);
  renderBudgetTrendChart(loadMemos().filter(m => memoStatusKey(m)==='completed'));
}

function renderBudgetTrendChart(allMemos) {
  const canvas = document.getElementById('bgt-trend-chart');
  if(!canvas || typeof Chart === 'undefined') return;
  if(canvas._chart) canvas._chart.destroy();

  const now    = new Date();
  const labels = [];
  const months = [];
  for(let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    labels.push(d.toLocaleString('th-TH', { month: 'short', year: '2-digit' }));
    months.push(d);
  }

  // Per-project dataset with anomaly detection
  const PROJ_COLORS = ['#185FA5','#3B6D11','#854F0B','#3C3489','#A32D2D','#5F5E5A'];
  const datasets = [];

  [..._bgtProjSelected].sort().forEach((proj, pi) => {
    const data = months.map(m => {
      return allMemos
        .filter(memo => {
          const d = new Date(memo.updatedAt||memo.createdAt);
          return (memo.project||'ไม่ระบุ') === proj
            && _bgtTypeSelected.has(memo.type)
            && d.getFullYear() === m.getFullYear()
            && d.getMonth() === m.getMonth();
        })
        .reduce((s,memo) => s+(Number(memo.total)||0), 0);
    });

    // Anomaly: flag months > 150% of 3M rolling average
    const anomalyPoints = data.map((v, i) => {
      if(i < 3) return false;
      const avg = (data[i-1]+data[i-2]+data[i-3])/3;
      return avg > 0 && v > avg * 1.5;
    });

    const color = PROJ_COLORS[pi % PROJ_COLORS.length];
    datasets.push({
      label: proj,
      data,
      borderColor: color,
      backgroundColor: color + '22',
      borderWidth: 2,
      tension: 0.3,
      fill: false,
      pointBackgroundColor: data.map((_, i) => anomalyPoints[i] ? '#A32D2D' : color),
      pointRadius: data.map((_, i) => anomalyPoints[i] ? 7 : 3),
      pointBorderColor: data.map((_, i) => anomalyPoints[i] ? '#A32D2D' : color),
    });
  });

  canvas._chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${money(ctx.raw)}`,
            afterLabel: (ctx) => {
              const d = ctx.dataIndex;
              const data = ctx.dataset.data;
              if(d >= 3) {
                const avg = (data[d-1]+data[d-2]+data[d-3])/3;
                if(avg > 0 && ctx.raw > avg * 1.5) return '⚠ Anomaly: > 150% of avg';
              }
              return '';
            }
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { ticks: { callback: v => '฿'+Number(v).toLocaleString('th-TH'), font: { size: 10 } } }
      }
    }
  });
}

function renderBudgetProjChart(allMemos) {
  const canvas = document.getElementById('bgt-proj-chart');
  if(!canvas || typeof Chart === 'undefined') return;
  if(canvas._chart) canvas._chart.destroy();

  const byProj = {};
  allMemos.filter(m => _bgtTypeSelected.has(m.type)).forEach(m => {
    const p = m.project||'ไม่ระบุ';
    if(!byProj[p]) byProj[p] = { count:0, total:0 };
    byProj[p].count++; byProj[p].total += Number(m.total)||0;
  });

  const rows = Object.entries(byProj).sort((a,b) => b[1].total-a[1].total);
  const COLORS = ['#185FA5','#3B6D11','#854F0B','#3C3489','#A32D2D','#5F5E5A','#0F6E56'];
  const total  = rows.reduce((s,[,v]) => s+v.total, 0);

  canvas._chart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: rows.map(([p]) => p),
      datasets: [{ data: rows.map(([,v]) => v.total), backgroundColor: COLORS, borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${money(ctx.raw)} (${Math.round(ctx.raw/total*100)}%)` } }
      }
    }
  });

  // Legend
  const legend = document.getElementById('bgt-proj-legend');
  if(legend) {
    legend.innerHTML = rows.map(([p,v], i) => `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="width:10px;height:10px;border-radius:50%;background:${COLORS[i%COLORS.length]};flex-shrink:0"></div>
        <div style="flex:1;font-size:11px">${esc(p)}</div>
        <div style="font-size:11px;color:var(--text-2)">${money(v.total)}</div>
        <div style="font-size:10px;color:var(--text-3)">${Math.round(v.total/total*100)}%</div>
      </div>`).join('');
  }
}

