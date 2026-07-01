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
const BGT_TYPE_COLORS = { sl:'#185FA5', hw:'#3B6D11', int:'#854F0B', ent:'#3C3489', dep:'#A32D2D', infra:'#0F6E56', other:'#5F5E5A' };
const BGT_TYPE_LABELS = { sl:'Software License', hw:'Hardware', int:'Team Activity', ent:'Client Expense', dep:'Deployment', infra:'Infrastructure', other:'Other' };
const BGT_PROJ_COLORS = ['#185FA5','#3B6D11','#854F0B','#3C3489','#A32D2D','#5F5E5A','#0F6E56','#8B4513'];
const INFRA_KEY = 'orbit-pmo-infra-v1';
const MANUAL_EXPENSE_KEY = 'orbit-pmo-manual-expenses-v1';

let _manualExpenseCache = null;

function manualExpenseFromDb(r) {
  return {
    id: r.id,
    entryKind: r.entry_kind || 'historical',
    referenceNo: r.reference_no || '',
    project: r.project || '',
    budgetPoolId: r.budget_pool_id || null,
    expenseType: r.expense_type || 'other',
    description: r.description || '',
    frequency: r.frequency || 'one_time',
    expenseDate: r.expense_date || null,
    startMonth: r.start_month || null,
    endMonth: r.end_month || null,
    quantity: Number(r.quantity) || 1,
    unitCost: Number(r.unit_cost) || 0,
    amount: Number(r.amount) || 0,
    notes: r.notes || '',
    createdBy: r.created_by || '',
    updatedBy: r.updated_by || '',
    voidedAt: r.voided_at || null,
    voidedBy: r.voided_by || '',
    voidReason: r.void_reason || '',
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
  };
}

function manualExpenseToDb(e) {
  return {
    id: e.id,
    entry_kind: e.entryKind || 'historical',
    reference_no: e.referenceNo || null,
    project: e.project,
    budget_pool_id: e.budgetPoolId || null,
    expense_type: e.expenseType,
    description: e.description,
    frequency: e.frequency || 'one_time',
    expense_date: e.frequency === 'one_time' ? e.expenseDate : null,
    start_month: e.frequency === 'monthly' ? e.startMonth : null,
    end_month: e.frequency === 'monthly' ? e.endMonth : null,
    quantity: Number(e.quantity) || 1,
    unit_cost: Number(e.unitCost) || 0,
    amount: Number(e.amount) || 0,
    notes: e.notes || null,
    created_by: e.createdBy || null,
    updated_by: e.updatedBy || null,
    voided_at: e.voidedAt || null,
    voided_by: e.voidedBy || null,
    void_reason: e.voidReason || null,
    created_at: e.createdAt || new Date().toISOString(),
    updated_at: e.updatedAt || new Date().toISOString(),
  };
}

function loadManualExpenses() {
  if (_manualExpenseCache !== null) return _manualExpenseCache;
  try {
    const rows = JSON.parse(localStorage.getItem(MANUAL_EXPENSE_KEY) || '[]');
    _manualExpenseCache = Array.isArray(rows) ? rows : [];
  } catch(e) { _manualExpenseCache = []; }
  return _manualExpenseCache;
}

function storeManualExpenses(rows) {
  _manualExpenseCache = Array.isArray(rows) ? rows : [];
  try { localStorage.setItem(MANUAL_EXPENSE_KEY, JSON.stringify(_manualExpenseCache)); } catch(e) {}
}

async function loadManualExpensesAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('budget_manual_expenses', 'GET', null, '?order=created_at.desc');
      storeManualExpenses((rows || []).map(manualExpenseFromDb));
      return _manualExpenseCache;
    } catch(e) { console.warn('Manual expenses load failed, using local backup', e.message); }
  }
  return loadManualExpenses();
}

async function saveManualExpenseAsync(expense) {
  const now = new Date().toISOString();
  const rows = [...loadManualExpenses()];
  const idx = rows.findIndex(e => e.id === expense.id);
  const saved = {
    ...expense,
    createdAt: idx >= 0 ? rows[idx].createdAt : (expense.createdAt || now),
    updatedAt: now,
  };
  if (idx >= 0) rows[idx] = saved; else rows.unshift(saved);
  storeManualExpenses(rows);
  if (await checkSupa()) {
    await supaFetch('budget_manual_expenses', 'POST', manualExpenseToDb(saved), '?on_conflict=id');
  }
  return saved;
}

async function voidManualExpenseAsync(id, reason) {
  const rows = [...loadManualExpenses()];
  const idx = rows.findIndex(e => e.id === id);
  if (idx < 0) throw new Error('ไม่พบรายการ');
  const now = new Date().toISOString();
  const updated = {
    ...rows[idx],
    voidedAt: now,
    voidedBy: currentUser(),
    voidReason: reason,
    updatedBy: currentUser(),
    updatedAt: now,
  };
  rows[idx] = updated;
  storeManualExpenses(rows);
  if (await checkSupa()) {
    await supaFetch('budget_manual_expenses', 'PATCH', {
      voided_at: now,
      voided_by: updated.voidedBy,
      void_reason: reason,
      updated_by: updated.updatedBy,
      updated_at: now,
    }, '?id=eq.' + encodeURIComponent(id));
  }
  return updated;
}

function activeManualExpenses() {
  return loadManualExpenses().filter(e => !e.voidedAt);
}

function manualExpenseOccurrences(expense) {
  if (!expense || expense.voidedAt) return [];
  if (expense.frequency !== 'monthly') {
    return expense.expenseDate
      ? [{ month: String(expense.expenseDate).slice(0, 7), amount: Number(expense.amount) || 0 }]
      : [];
  }
  if (!expense.startMonth || !expense.endMonth || expense.startMonth > expense.endMonth) return [];
  const result = [];
  let [year, month] = expense.startMonth.split('-').map(Number);
  for (let guard = 0; guard < 240; guard++) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > expense.endMonth) break;
    result.push({ month: key, amount: Number(expense.amount) || 0 });
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return result;
}

function manualExpenseAmountInRange(expense, fromMonth, toMonth) {
  return manualExpenseOccurrences(expense)
    .filter(o => (!fromMonth || o.month >= fromMonth) && (!toMonth || o.month <= toMonth))
    .reduce((sum, o) => sum + o.amount, 0);
}

function manualExpenseMonthValue(expense, month) {
  return manualExpenseOccurrences(expense)
    .filter(o => o.month === month)
    .reduce((sum, o) => sum + o.amount, 0);
}

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
  const fxRate = _getLicFxRate ? _getLicFxRate() : 35;
  const result = {};
  getAllLicenses().forEach(l => {
    const proj = l.project || '(ไม่ระบุ)';
    // Use memo-embedded fxRate if available, else global fxRate
    const rate = Number(l.fxRate) || fxRate;
    result[proj] = (result[proj]||0) + (l.pricePerMonth||0) * (l.seats||1) * rate;
  });
  return result;
}

// ── Sub-tab switching ──
let _bgtCurrentTab = 'overview';
function switchBudgetTab(tab, btn) {
  _bgtCurrentTab = tab;
  ['overview','actual-spend','forecast','bva','bgt-settings','others'].forEach(t => {
    const p = document.getElementById('bgt-tab-' + t);
    if (p) p.style.display = 'none';
  });
  document.querySelectorAll('#view-budget .tab-btn, #view-budget .cost-stab').forEach(b => {
    b.classList.remove('active');
    b.style.background = '';
    b.style.color = '';
  });
  const panel = document.getElementById('bgt-tab-' + tab);
  if (panel) panel.style.display = '';
  if (btn) btn.classList.add('active');
  if (tab === 'overview')      { _ov.initialized = false; renderBudgetOverview(); }
  if (tab === 'actual-spend')  renderActualSpend();
  if (tab === 'forecast')      renderBudgetSLInfra();
  if (tab === 'bva')           renderBudgetVsActual();
  if (tab === 'bgt-settings')  { switchBgtSettings('budget'); renderBudgetSettings(); }
  if (tab === 'others')        renderBudgetOthers();
}

// ── Main entry ──
// ── Export Budget CSVs ──────────────────────────────────────────

async function exportActualSpendCSV() {
  await refreshCanonicalActualSpend();
  const rows = filteredActualSpendRecords().map(record => [
    record.source, record.referenceNo, record.spendType, record.project, record.amount,
    record.startDate || '', record.endDate || '', record.finalBudgetPoolId || '', record.budgetStatus,
    record.createdBy || '', record.description || '',
  ]);
  if (!rows.length) { alert('ไม่มีข้อมูล'); return; }
  _downloadCSV('Actual_Spend', ['Source','Reference','Spend Type','Project','Amount','Start','End','Budget Pool','Budget Status','Created By','Description'], rows);
}

function manualExpenseToActualSpend(expense) {
  const monthly = expense.frequency === 'monthly';
  const startDate = monthly ? expense.startMonth : expense.expenseDate;
  const endDate = monthly ? expense.endMonth : expense.expenseDate;
  const months = monthly ? inclusiveCoverageMonths(startDate, endDate) : 1;
  return createActualSpendRecord({
    id: `actual-spend-manual-${expense.id}`,
    source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    referenceNo: expense.referenceNo || expense.id,
    project: expense.project,
    spendType: spendTypeFromMemoType(expense.expenseType),
    amount: (Number(expense.amount) || 0) * (months || 1),
    startDate, endDate,
    description: expense.description || expense.notes || '',
    manualBudgetPoolId: expense.budgetPoolId || null,
    createdBy: expense.createdBy || '', createdAt: expense.createdAt,
    updatedBy: expense.updatedBy || '', updatedAt: expense.updatedAt,
  });
}

function infraCostToActualSpend(entry) {
  const months = inclusiveCoverageMonths(entry.start_month, entry.end_month);
  return createActualSpendRecord({
    id: `actual-spend-infra-${entry.id}`,
    source: ACTUAL_SPEND_SOURCES.INFRA_COST,
    referenceNo: entry.id,
    project: entry.project,
    spendType: SPEND_TYPES.INFRA,
    amount: (Number(entry.monthly_cost) || 0) * (months || 1),
    startDate: entry.start_month, endDate: entry.end_month,
    vendorProgram: entry.program || '', description: entry.program || 'Infrastructure cost',
  });
}

function reconcileActualSpendSources(memos = loadMemos(), manual = activeManualExpenses(), infra = loadInfraCosts(), pools = loadBudgetPoolRecords()) {
  const existing = loadActualSpendRecords();
  const retained = existing.filter(record =>
    !String(record.id).startsWith('actual-spend-manual-') &&
    !String(record.id).startsWith('actual-spend-infra-')
  );
  const byId = new Map(retained.map(record => [record.id, record]));
  memos.filter(memo => memoStatusKey(memo) === 'completed').forEach(memo => {
    const previous = existing.find(record => record.memoId === memo.memoNo);
    const record = actualSpendFromMemo({ ...memo, status:'completed' }, previous);
    if (record && validateActualSpendRecord(record).valid) byId.set(record.id, record);
  });
  [...manual.map(manualExpenseToActualSpend), ...infra.map(infraCostToActualSpend)].forEach(record => {
    if (validateActualSpendRecord(record).valid) byId.set(record.id, record);
  });
  const validRecords = [...byId.values()].filter(record => validateActualSpendRecord(record).valid);
  const mapped = mapActualSpendRecords(validRecords, pools);
  storeActualSpendRecords(mapped);
  return mapped;
}

async function refreshCanonicalActualSpend() {
  await Promise.all([loadManualExpensesAsync(), loadInfraCostsAsync()]);
  return reconcileActualSpendSources();
}

function actualSpendRecordInRange(record, fromMonth, toMonth) {
  const start = String(record.startDate || record.month || '').slice(0, 7);
  const end = String(record.endDate || record.month || start).slice(0, 7);
  return (!fromMonth || !end || end >= fromMonth) && (!toMonth || !start || start <= toMonth);
}

function filteredActualSpendRecords(records = loadActualSpendRecords()) {
  const from = document.getElementById('as-from')?.value || '';
  const to = document.getElementById('as-to')?.value || '';
  const project = document.getElementById('as-project')?.value || 'all';
  const type = document.getElementById('as-type')?.value || 'all';
  const source = document.getElementById('as-source')?.value || 'all';
  const budgetStatus = document.getElementById('as-budget-status')?.value || 'all';
  const year = document.getElementById('as-year')?.value || '';
  const sourceMap = { memo:ACTUAL_SPEND_SOURCES.APPROVED_MEMO, manual:ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE, infra:ACTUAL_SPEND_SOURCES.INFRA_COST };
  return queryActualSpend({
    project: project === 'all' ? '' : project,
    spendType: type === 'all' ? '' : spendTypeFromMemoType(type),
    source: source === 'all' ? '' : sourceMap[source],
    budgetStatus: budgetStatus === 'all' ? '' : budgetStatus,
  }, records).filter(record =>
    actualSpendRecordInRange(record, from, to) && (!year || actualSpendRecordInYear(record, year))
  );
}

function actualSpendRecordInYear(record, year) {
  const fallback = String(record.year || record.month || record.createdAt || record.updatedAt || '').slice(0, 4);
  const startYear = String(record.startDate || fallback).slice(0, 4);
  const endYear = String(record.endDate || startYear).slice(0, 4);
  return (!startYear || startYear <= year) && (!endYear || endYear >= year);
}

function actualSpendImportRow(row) {
  const get = (...keys) => keys.map(key => row[key]).find(value => value !== undefined && value !== '');
  const rawSource = String(get('Source','source') || ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE).trim();
  const source = rawSource.toLowerCase().includes('infra') ? ACTUAL_SPEND_SOURCES.INFRA_COST : ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE;
  const rawType = get('Spend Type','spendType','Type','type') || (source === ACTUAL_SPEND_SOURCES.INFRA_COST ? 'Infra' : 'Others');
  const spendType = SPEND_TYPE_VALUES.includes(rawType) ? rawType : spendTypeFromMemoType(rawType);
  return {
    source, referenceNo:String(get('Reference No','Reference','referenceNo') || '').trim(),
    project:String(get('Project','project') || '').trim(), spendType,
    amount:Number(get('Amount','amount') || 0), currency:'THB',
    startDate:String(get('Start Date','Start','startDate') || '').trim() || null,
    endDate:String(get('End Date','End','endDate') || '').trim() || null,
    vendorProgram:String(get('Vendor / Program','Program','vendorProgram') || '').trim(),
    description:String(get('Description','description') || '').trim(), createdBy:currentUser(),
  };
}

function downloadActualSpendTemplate() {
  if (typeof XLSX === 'undefined') { alert('ไม่พบ SheetJS library'); return; }
  const headers = ['Source','Reference No','Spend Type','Project','Amount','Start Date','End Date','Vendor / Program','Description'];
  const samples = [
    ['Manual / Historical Expense','HIST-2025-001','Hardware','AOA-MP',75000,'2025-11-15','2025-11-15','Vendor A','Historical laptop purchase'],
    ['Infra Cost','INFRA-2026-001','Infra','TTB',24000,'2026-06','2026-08','AWS','Total infrastructure cost for the coverage period'],
  ];
  const template = XLSX.utils.aoa_to_sheet([headers, ...samples]);
  template['!cols'] = [24,22,20,18,16,16,16,24,42].map(wch => ({ wch }));
  template['!autofilter'] = { ref:`A1:I${samples.length + 1}` };

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Actual Spend Import Instructions'],
    ['Required columns','Source, Reference No, Spend Type, Project, Amount'],
    ['Allowed Source','Manual / Historical Expense or Infra Cost. Approved Memo must come from the All Memo workflow.'],
    ['Allowed Spend Type','Software, Hardware, Team Activity, Client Expense, Deployment, Infra, Others'],
    ['Amount','Positive total amount in THB for the full coverage period.'],
    ['Dates','Use YYYY-MM or YYYY-MM-DD. Start Date and End Date must use the same format.'],
    ['Duplicate rule','Source + Reference No + Project + Spend Type + Amount + Start Date + End Date. Duplicate rows are skipped.'],
    ['Validation','If any non-duplicate row is invalid, the complete import is rejected and nothing is saved.'],
  ]);
  instructions['!cols'] = [{ wch:24 }, { wch:110 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, template, 'Actual Spend Template');
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  XLSX.writeFile(workbook, 'actual_spend_import_template.xlsx');
}

function handleActualSpendImport(event) {
  if (!isPMO()) { alert('เฉพาะ PMO เท่านั้นที่ import Actual Spend ได้'); event.target.value = ''; return; }
  const file = event.target.files?.[0];
  if (!file || typeof XLSX === 'undefined') return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const workbook = XLSX.read(e.target.result, { type:'binary' });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval:'' }).map(actualSpendImportRow);
      const result = importActualSpendRecords(rows);
      if (!result.valid) {
        alert(`Import ไม่สำเร็จ\n${result.errors.map(error => `Row ${error.row}: ${error.errors.join(', ')}`).join('\n')}`);
        return;
      }
      alert(`Import สำเร็จ ${result.saved} รายการ · ข้ามข้อมูลซ้ำ ${result.duplicates.length} รายการ`);
      await renderActualSpend();
    } catch(error) { alert('Import ไม่สำเร็จ: ' + error.message); }
  };
  reader.readAsBinaryString(file);
  event.target.value = '';
}

function exportBudgetVsActualCSV() {
  if (!_bvaDataset) { alert('กรุณาเปิดหน้า Budget vs Actual ก่อน Export'); return; }
  const exported = budgetVsActualExportDataset(_bvaDataset);
  const rows = [...exported.rows, [
    '', 'TOTAL', '', _bvaDataset.filters.year || '', '',
    exported.totals.budget, exported.totals.actual, exported.totals.remaining,
    exported.totals.utilizationPercent, '', 'Total',
  ]];
  _downloadCSV('Budget_vs_Actual', exported.headers, rows);
}

function exportBudgetPoolsCSV() {
  const pools = loadBudgetPools();
  if (!pools.length) { alert('ไม่มี Budget Pool'); return; }
  const headers = ['Pool ID','โครงการ','ชื่อ Pool','งบประมาณ','ปี',
    'เริ่ม (YYYY-MM)','สิ้นสุด (YYYY-MM)','ประเภท Memo'];
  const rows = pools.map(p => [
    p.id, p.project, p.name, p.budget, p.year,
    p.startMonth||'', p.endMonth||'',
    (p.memoTypes||[]).join('+') || 'ทุกประเภท'
  ]);
  _downloadCSV('Budget_Pools', headers, rows);
}

function renderBudget() {
  Promise.all([loadSLBudgetsAsync(), loadManualExpensesAsync()]).then(([d]) => {
    if (d && Object.keys(d).length) {
      try { localStorage.setItem(SLINF_BUDGET_KEY, JSON.stringify(d)); } catch(e) {}
    }
  }).catch(() => {}).finally(() => {
    if (_bgtCurrentTab === 'overview')     renderBudgetOverview();
    if (_bgtCurrentTab === 'actual-spend') renderActualSpend();
    if (_bgtCurrentTab === 'forecast')     renderBudgetSLInfra();
    if (_bgtCurrentTab === 'bva')          renderBudgetVsActual();
    if (_bgtCurrentTab === 'bgt-settings') renderBudgetSettings();
    if (_bgtCurrentTab === 'others')       renderBudgetOthers();
  });
}

// ══════════════════════════════════════════
// SUB-TAB 1: OVERVIEW
// ══════════════════════════════════════════

const OV_PROJ_COLORS = ['#185FA5','#1D9E75','#EF9F27','#7F77DD','#5DCAA5','#D85A30','#888780','#3C3489','#639922'];
// OV_TYPE_COLORS — alias to BGT_TYPE_COLORS for consistency
const OV_TYPE_COLORS = BGT_TYPE_COLORS;

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
  reconcileActualSpendSources();
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
  const records = loadActualSpendRecords();
  const projKeys = [...new Set(records.map(record => record.project || '(ไม่ระบุ)'))].sort();
  _ov.activeProjKeys = new Set(projKeys);
  _ov.activeTypeKeys = new Set([...new Set(records.map(record => SPEND_TYPE_TO_MEMO_TYPE[record.spendType]).filter(Boolean))]);
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
  _ovRenderChips(); _ovUpdateKPIs(); _ovRenderChart(); _ovRenderBvA();
}

// ── Chips ──
function _ovRenderChips() {
  const records = loadActualSpendRecords();
  const projKeys = [...new Set(records.map(record => record.project || '(ไม่ระบุ)'))].sort();
  const typeKeys = [...new Set(records.map(record => SPEND_TYPE_TO_MEMO_TYPE[record.spendType]).filter(Boolean))];
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

  const records = loadActualSpendRecords().filter(record =>
    projArr.includes(record.project || '(ไม่ระบุ)') && typeArr.includes(SPEND_TYPE_TO_MEMO_TYPE[record.spendType])
  );
  const total = calculateActualSpendInRange(records, fromKey, toKey);

  // ── Budget from SL settings (SL only — no budget for other types yet) ──
  const currentYear  = String(new Date().getFullYear() + 543);
  const slBudgets    = loadSLBudgets()?.[currentYear] || {};
  const annualBudget = projArr.reduce((s, p) => s + (slBudgets[p] || 0), 0);
  const budgetTotal  = annualBudget > 0 ? (annualBudget / 12) * numMonths : 0;

  // ── Forecast: smooth 3-month avg of SL spend × remaining months + non-SL YTD rate ──
  const now = new Date();
  const smooth3Keys = [];
  for (let i = 3; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    smooth3Keys.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  const smooth3Total = smooth3Keys.reduce((sum, key) => sum + calculateActualSpendInRange(records, key, key), 0);
  const smoothMonthlyRate = smooth3Total / 3;
  const monthsLeft        = 12 - now.getMonth();
  const ytdStart = `${now.getFullYear()}-01`;
  const ytdEnd   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const ytdTotal = calculateActualSpendInRange(records, ytdStart, ytdEnd);
  const forecastTotal = ytdTotal + smoothMonthlyRate * monthsLeft;

  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('bgt-kpi-total', money(Math.round(total)));
  setText('bgt-kpi-actual-sub', `ยอดใช้จ่ายจริงในช่วง ${numMonths} เดือนที่เลือก`);

  if (budgetTotal > 0) {
    const pct      = Math.round(total / budgetTotal * 100);
    const rem      = budgetTotal - total;
    const remColor = total > budgetTotal ? 'var(--red)' : pct >= 90 ? 'var(--amber)' : 'var(--green)';
    setText('bgt-kpi-budget', money(Math.round(budgetTotal)));
    setText('bgt-kpi-budget-sub', `งบ SL ตั้งไว้ ${numMonths} เดือน`);
    const remEl = document.getElementById('bgt-kpi-remaining');
    if (remEl) { remEl.textContent = money(Math.round(rem)); remEl.style.color = remColor; }
    setText('bgt-kpi-remaining-sub', `ใช้งบประมาณแล้ว ${pct}%`);
    const fColor = forecastTotal > annualBudget ? 'var(--red)' : forecastTotal / annualBudget >= 0.9 ? 'var(--amber)' : 'var(--green)';
    const fEl = document.getElementById('bgt-kpi-forecast');
    if (fEl) { fEl.textContent = money(Math.round(forecastTotal)); fEl.style.color = fColor; }
    setText('bgt-kpi-forecast-sub', 'อ้างอิงค่าเฉลี่ย 3 เดือนล่าสุด');
  } else {
    setText('bgt-kpi-budget', '—');
    const budEl = document.getElementById('bgt-kpi-budget-sub');
    if (budEl) budEl.innerHTML = `ยังไม่ได้ตั้งงบ — <span style="color:var(--blue);cursor:pointer;text-decoration:underline" onclick="switchBudgetTab('sl-infra');switchSLNav('budgetsettings')">ตั้งค่าที่นี่</span>`;
    setText('bgt-kpi-remaining', '—');
    setText('bgt-kpi-remaining-sub', 'ต้องตั้งงบก่อน');
    const fEl = document.getElementById('bgt-kpi-forecast');
    if (fEl) { fEl.textContent = money(Math.round(forecastTotal)); fEl.style.color = 'var(--amber)'; }
    setText('bgt-kpi-forecast-sub', 'อ้างอิงค่าเฉลี่ย 3 เดือนล่าสุด');
  }
}

// ── Bar chart ──
function _ovRenderChart() {
  const canvas = document.getElementById('ov-main-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }

  const months   = _ov.allMonths.slice(_ov.fromIdx, _ov.toIdx + 1);
  const labels   = months.map(m => m.label);
  const typeKeys = [..._ov.activeTypeKeys];
  const projKeys = [..._ov.activeProjKeys];
  const records = loadActualSpendRecords().filter(record =>
    projKeys.includes(record.project || '(ไม่ระบุ)') && typeKeys.includes(SPEND_TYPE_TO_MEMO_TYPE[record.spendType])
  );

  let datasets;
  if (_ov.groupBy === 'type') {
    datasets = typeKeys.map(tk => ({
      label: BGT_TYPE_LABELS[tk] || tk.toUpperCase(),
      backgroundColor: OV_TYPE_COLORS[tk],
      borderRadius: 3, borderSkipped: false,
      data: months.map(m => calculateActualSpendInRange(records, m.key, m.key, { spendType:spendTypeFromMemoType(tk) })),
    }));
  } else {
    datasets = projKeys.map((pk, pi) => ({
      label: pk,
      backgroundColor: OV_PROJ_COLORS[pi % OV_PROJ_COLORS.length],
      borderRadius: 3, borderSkipped: false,
      data: months.map(m => calculateActualSpendInRange(records, m.key, m.key, { project:pk })),
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
  const canonical = loadActualSpendRecords();
  const typeKeys = [..._ov.activeTypeKeys];
  const allProjKeys = [...new Set(canonical.map(record => record.project || '(ไม่ระบุ)'))].sort();
  const bvaChips = document.getElementById('ov-bva-proj-chips');
  if (bvaChips) {
    bvaChips.innerHTML = allProjKeys.map(k => {
      const on = _ov.activeProjKeys.has(k);
      return `<span onclick="ovToggleProj('${esc(k)}')" style="display:inline-flex;align-items:center;font-size:11px;padding:3px 10px;border-radius:20px;cursor:pointer;user-select:none;border:0.5px solid ${on ? 'transparent' : 'var(--border)'};background:${on ? 'var(--blue)' : 'transparent'};color:${on ? '#fff' : 'var(--text-2)'}">${esc(k)}</span>`;
    }).join('');
  }

  const rows = projKeys.map(proj => {
    const actual = calculateActualSpendInRange(
      canonical.filter(record => typeKeys.includes(SPEND_TYPE_TO_MEMO_TYPE[record.spendType])),
      fromKey, toKey, { project:proj },
    );

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
      <span style="font-weight:500">Actual</span> = Actual Spend ที่ผ่านตัวกรอง โดยกระจายยอดตาม coverage period`;
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
  // Thai format: "27 พฤษภาคม 2569" or "27 พฤษภาคม พ.ศ. 2569" or "26/05/69"
  const THAI_MONTHS = {'มกราคม':0,'กุมภาพันธ์':1,'มีนาคม':2,'เมษายน':3,'พฤษภาคม':4,'มิถุนายน':5,'กรกฎาคม':6,'สิงหาคม':7,'กันยายน':8,'ตุลาคม':9,'พฤศจิกายน':10,'ธันวาคม':11};
  // Strip "พ.ศ." prefix before year so both formats parse the same way
  const cleaned = str.replace(/\s*พ\.ศ\.\s*/g, ' ').trim();
  const m1 = cleaned.match(/^(\d{1,2})\s+(\S+)\s+(\d{4})$/);
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
let _forecastView = { months:[], rows:[] };

function _renderForecastTable() {
  const body   = document.getElementById('sl-forecast-body');
  const thead  = document.getElementById('sl-forecast-thead');
  if(!body || !thead) return;

  const forecast = calculateForecast(loadActualSpendRecords(), new Date());
  const allProjects = [...new Set(forecast.rows.map(row => row.project))].sort();

  // Project dropdown
  const projSel = document.getElementById('sl-forecast-proj');
  if(projSel) {
    const selected = projSel.value || 'all';
    projSel.innerHTML = '<option value="all">ทุกโปรเจค</option>';
    allProjects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = p;
      projSel.appendChild(opt);
    });
    projSel.value = allProjects.includes(selected) ? selected : 'all';
  }
  const selProj = projSel?.value || 'all';
  _forecastView = {
    months: forecast.months,
    rows: forecast.rows.filter(row => selProj === 'all' || row.project === selProj),
  };
  const months = _forecastView.months;
  const monthDate = key => new Date(`${key}-01T00:00:00`);
  const monthLbl = month => monthDate(month.key).toLocaleString('th-TH', { month:'short', year:'2-digit' });

  // Build thead
  const thBg = 'background:var(--bg)';
  const thS  = `padding:7px 8px;font-size:10px;font-weight:600;color:var(--text-3);border-bottom:1px solid var(--border);text-align:right;white-space:nowrap`;
  const thFS = `padding:7px 8px;font-size:10px;font-weight:600;color:#0C447C;border-bottom:1px solid var(--border);text-align:right;white-space:nowrap;background:#EEF5FF`;
  thead.innerHTML = `<tr>
    <th style="${thS};text-align:left;min-width:90px">Project</th>
    <th style="${thS};text-align:left;min-width:80px">Program</th>
    <th style="${thS};text-align:center;min-width:60px">Type</th>
    ${months.map(m => `<th style="${m.kind === 'forecast' ? thFS : thS}">${esc(monthLbl(m))}${m.kind === 'forecast' ? '<br><span style="font-size:9px;opacity:.7">F</span>' : ''}</th>`).join('')}
    <th style="${thS};color:var(--blue)">Total</th>
  </tr>`;

  const tdS  = 'padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;text-align:right';
  const tdFS = 'padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;text-align:right;background:#EEF5FF;color:#185FA5';
  const subS = 'padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;font-weight:600;text-align:right;background:var(--bg)';
  const subFS= 'padding:6px 8px;border-bottom:1px solid var(--border);font-size:12px;font-weight:600;text-align:right;background:#EEF5FF;color:#185FA5';

  let rows = '';
  [...new Set(_forecastView.rows.map(row => row.project))].forEach(proj => {
    const projectRows = _forecastView.rows.filter(row => row.project === proj);
    let projTotal = 0;
    const projMonthTotals = months.map(() => 0);
    projectRows.forEach(row => {
      let rowTotal = 0;
      const cells = months.map((m, mi) => {
        const v = row.values[m.key] || 0;
        rowTotal += v; projMonthTotals[mi] += v; projTotal += v;
        if(v > 0) return `<td style="${m.kind === 'forecast' ? tdFS : tdS}">${money(Math.round(v))}</td>`;
        return `<td style="${m.kind === 'forecast' ? tdFS : tdS};color:var(--text-3)">—</td>`;
      }).join('');
      rows += `<tr>
        <td style="${tdS};text-align:left;font-weight:500">${esc(proj)}</td>
        <td style="${tdS};text-align:left">${esc(row.program)}</td>
        <td style="${tdS};text-align:center"><span style="font-size:10px;background:${row.spendType === 'Infra' ? '#FAEEDA' : '#E6F1FB'};color:${row.spendType === 'Infra' ? '#633806' : '#0C447C'};padding:1px 6px;border-radius:3px">${esc(row.spendType)}</span></td>
        ${cells}
        <td style="${tdS};font-weight:600;color:var(--blue)">${money(Math.round(rowTotal))}</td>
      </tr>`;
    });

    // Subtotal row
    rows += `<tr style="background:var(--bg)">
      <td style="${subS};text-align:left" colspan="2">${esc(proj)} — Subtotal</td>
      <td style="${subS}"></td>
      ${projMonthTotals.map((v, mi) => `<td style="${months[mi].kind === 'forecast' ? subFS : subS}">${money(Math.round(v))}</td>`).join('')}
      <td style="${subS};color:var(--blue)">${money(Math.round(projTotal))}</td>
    </tr>
    <tr style="height:6px"><td colspan="${months.length+4}" style="background:var(--color-background-tertiary,#F4F3EF)"></td></tr>`;
  });

  body.innerHTML = rows || `<tr><td colspan="${months.length+4}" style="padding:24px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูล</td></tr>`;
}

function exportForecastCSV() {
  const dataset = forecastExportDataset(_forecastView);
  _downloadCSV('forecast', dataset.headers, dataset.rows);
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

// ══════════════════════════════════════════
// SUB-TAB 3: OTHERS (HW / INT / ENT / DEP)
// ══════════════════════════════════════════
const OTHERS_TYPES = ['hw','int','ent','dep'];

function renderBudgetOthers() {
  const rangeEl = document.getElementById('oth-range');
  const projEl  = document.getElementById('oth-project');
  const typeEl  = document.getElementById('oth-type');

  const rangeVal = rangeEl?.value || '12';
  const projVal  = projEl?.value  || 'all';
  const typeVal  = typeEl?.value  || 'all';

  const approved = loadMemos().filter(m =>
    memoStatusKey(m) === 'completed' && OTHERS_TYPES.includes(m.type)
  );

  // Populate project dropdown once
  if (projEl && projEl.options.length <= 1) {
    const projs = [...new Set(approved.map(m => m.project || '(ไม่ระบุ)'))].sort();
    projs.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; projEl.appendChild(o); });
  }

  // Build month range
  const now = new Date();
  let fromKey = null, toKey = null;
  const months = [];
  if (rangeVal !== 'all') {
    const n = parseInt(rangeVal);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleString('th-TH', { month:'short', year:'2-digit' }) });
    }
    fromKey = months[0]?.key;
    toKey   = months[months.length - 1]?.key;
  }

  // Filter memos
  let filtered = approved;
  if (fromKey) {
    filtered = filtered.filter(m => {
      const d = parseThaiDate(m.date) || new Date(m.updatedAt || m.createdAt);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      return k >= fromKey && k <= toKey;
    });
  }
  if (projVal !== 'all') filtered = filtered.filter(m => (m.project || '(ไม่ระบุ)') === projVal);
  if (typeVal !== 'all') filtered = filtered.filter(m => m.type === typeVal);

  const total    = filtered.reduce((s, m) => s + (Number(m.total) || 0), 0);
  const numMemos = filtered.length;

  // Top type by spend
  const byType = {};
  OTHERS_TYPES.forEach(t => byType[t] = 0);
  filtered.forEach(m => { byType[m.type] = (byType[m.type] || 0) + (Number(m.total) || 0); });
  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];

  // ── KPI cards ──
  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('oth-kpi-total',    money(Math.round(total)));
  setText('oth-kpi-memos',    numMemos);
  setText('oth-kpi-top-type', topType?.[1] > 0 ? `${BGT_TYPE_LABELS[topType[0]]} (${money(Math.round(topType[1]))})` : '—');
  setText('oth-kpi-period',   fromKey ? `${months[0]?.label} – ${months[months.length-1]?.label}` : 'ทั้งหมด');

  // ── Monthly stacked bar ──
  _renderOthersChart(filtered, months, rangeVal);

  // ── Breakdown table ──
  _renderOthersTable(filtered);
}

function _renderOthersChart(memos, months, rangeVal) {
  const canvas = document.getElementById('oth-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (canvas._chart) { canvas._chart.destroy(); canvas._chart = null; }

  if (!months.length) {
    // Build last 12 months if range=all
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleString('th-TH', { month:'short', year:'2-digit' }) });
    }
  }

  const datasets = OTHERS_TYPES.map(tk => ({
    label: BGT_TYPE_LABELS[tk],
    backgroundColor: BGT_TYPE_COLORS[tk],
    borderRadius: 3, borderSkipped: false,
    data: months.map(m => memos
      .filter(memo => {
        if (memo.type !== tk) return false;
        const d = parseThaiDate(memo.date) || new Date(memo.updatedAt || memo.createdAt);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === m.key;
      })
      .reduce((s, memo) => s + (Number(memo.total) || 0), 0)
    ),
  })).filter(ds => ds.data.some(v => v > 0));

  canvas._chart = new Chart(canvas, {
    type: 'bar',
    data: { labels: months.map(m => m.label), datasets },
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
              const t = datasets.reduce((s, ds) => s + (ds.data[ctx[0].dataIndex] || 0), 0);
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
}

function _renderOthersTable(memos) {
  const tbody = document.getElementById('oth-table-body');
  if (!tbody) return;

  if (!memos.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูล</td></tr>`;
    return;
  }

  const sorted = [...memos].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));
  const tdS = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:12px';

  tbody.innerHTML = sorted.map(m => {
    const d     = parseThaiDate(m.date) || new Date(m.updatedAt || m.createdAt);
    const dateStr = d.toLocaleString('th-TH', { day:'numeric', month:'short', year:'2-digit' });
    const typeBg  = { hw:'#E8F5E0', int:'#FFF3E0', ent:'#EDE7F6', dep:'#FFEBEE' };
    const typeClr = { hw:'#2E7D1C', int:'#E65100', ent:'#4527A0', dep:'#B71C1C' };
    return `<tr>
      <td style="${tdS};color:var(--text-3)">${dateStr}</td>
      <td style="${tdS};font-weight:500">${esc(m.project || '(ไม่ระบุ)')}</td>
      <td style="${tdS}"><span style="font-size:10px;padding:2px 7px;border-radius:4px;background:${typeBg[m.type]||'var(--bg)'};color:${typeClr[m.type]||'var(--text-2)'}">${BGT_TYPE_LABELS[m.type] || m.type}</span></td>
      <td style="${tdS}">${esc(m.subject || m.memoNo || '—')}</td>
      <td style="${tdS};text-align:right;font-weight:600">${money(Number(m.total) || 0)}</td>
      <td style="${tdS};color:var(--blue);font-weight:500">${esc(m.memoNo || '—')}</td>
    </tr>`;
  }).join('');
}


const SLINF_BUDGET_KEY = 'orbit-pmo-sl-budgets-v1';

// ── SL Budget targets — Supabase + localStorage fallback ──
async function loadSLBudgetsAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('settings', 'GET', null, '?id=eq.sl-budgets');
      if (rows && rows[0]?.data) {
        const d = rows[0].data;
        try { localStorage.setItem(SLINF_BUDGET_KEY, JSON.stringify(d)); } catch(e) {}
        return d;
      }
    } catch(e) { console.warn('loadSLBudgetsAsync failed', e.message); }
  }
  return loadSLBudgets();
}

async function saveSLBudgetsAsync(d) {
  try { localStorage.setItem(SLINF_BUDGET_KEY, JSON.stringify(d)); } catch(e) {}
  if (await checkSupa()) {
    try {
      await supaFetch('settings', 'POST', { id: 'sl-budgets', data: d }, '?on_conflict=id');
    } catch(e) { console.warn('saveSLBudgetsAsync failed', e.message); }
  }
}

function loadSLBudgets() {
  try { return JSON.parse(localStorage.getItem(SLINF_BUDGET_KEY)||'{}'); }
  catch(e) { return {}; }
}
function storeSLBudgets(d) {
  try { localStorage.setItem(SLINF_BUDGET_KEY, JSON.stringify(d)); } catch(e) {}
  // Async sync to Supabase in background
  saveSLBudgetsAsync(d).catch(e => console.warn('SL budget Supabase sync failed', e));
}
function getSLBudgetForProject(proj, year) {
  const d = loadSLBudgets();
  return d[year]?.[proj] || 0;
}

// Old per-project annual budget helpers kept for backward compat with Overview KPI
function updateMonthlyPreview(proj) {}
function saveBudgetRow(proj) {}
function clearBudgetRow(proj) {}
function addBudgetRow() {}

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
  if(projVal !== 'all') approved = approved.filter(m => (m.budgetSource || m.project || 'ไม่ระบุ') === projVal);
  approved = approved.filter(m => types.includes(m.type));

  const projects = [...new Set(approved.map(m => m.budgetSource || m.project || 'ไม่ระบุ'))].sort();

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
        const amt = approved.filter(m => (m.budgetSource || m.project || 'ไม่ระบุ') === proj && m.type === t)
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

// ══════════════════════════════════════════
// ══════════════════════════════════════════
// TAB: ACTUAL SPEND
// ══════════════════════════════════════════
function openManualExpenseModal(editId = null) {
  if (!isPMO()) { alert('เฉพาะ PMO เท่านั้นที่เพิ่มหรือแก้ไข Historical Expense ได้'); return; }
  const expense = editId ? loadManualExpenses().find(e => e.id === editId) : null;
  if (expense?.voidedAt) { alert('รายการที่ void แล้วแก้ไขไม่ได้'); return; }
  document.getElementById('manual-expense-modal')?.remove();

  const settingsProjects = typeof loadSettings === 'function' ? (loadSettings()?.projects || []) : [];
  const projects = [...new Set([
    ...settingsProjects,
    ...loadMemos().map(m => m.project),
    ...loadBudgetPools().map(p => p.project),
    ...loadManualExpenses().map(e => e.project),
  ].filter(Boolean))].sort();
  const pools = loadBudgetPools();
  const today = new Date().toISOString().slice(0, 10);
  const g = (key, fallback = '') => expense?.[key] ?? fallback;

  const modal = document.createElement('div');
  modal.id = 'manual-expense-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:400;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div class="card" style="width:680px;max-width:96vw;max-height:92vh;overflow-y:auto;padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:15px;font-weight:700">${expense ? 'Edit' : 'Add'} Historical Expense</div>
          <div style="font-size:11px;color:var(--text-3)">ใช้สำหรับ Memo หรือค่าใช้จ่ายก่อนเริ่มใช้งานระบบ</div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('manual-expense-modal').remove()">✕</button>
      </div>
      <input type="hidden" id="me-id" value="${esc(g('id'))}">
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg"><label>ประเภทการบันทึก *</label>
          <select id="me-kind" class="ri">
            <option value="historical" ${g('entryKind','historical')==='historical'?'selected':''}>Historical</option>
            <option value="adjustment" ${g('entryKind')==='adjustment'?'selected':''}>Adjustment</option>
            <option value="other" ${g('entryKind')==='other'?'selected':''}>Other</option>
          </select>
        </div>
        <div class="fg"><label>เลข Memo / Reference เดิม</label>
          <input id="me-reference" class="ri" value="${esc(g('referenceNo'))}" placeholder="เช่น OLD-SL-2025-001">
        </div>
        <div class="fg"><label>Project *</label>
          <select id="me-project" class="ri">
            <option value="">— เลือก —</option>
            ${projects.map(p=>`<option value="${esc(p)}" ${g('project')===p?'selected':''}>${esc(p)}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label>Budget Pool</label>
          <select id="me-pool" class="ri">
            <option value="">— Auto / ไม่ระบุ —</option>
            ${pools.map(p=>`<option value="${esc(p.id)}" ${g('budgetPoolId')===p.id?'selected':''}>${esc(p.project)} · ${esc(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label>Expense Type *</label>
          <select id="me-type" class="ri">
            ${[['sl','Software License'],['hw','Hardware'],['int','Team Activity'],['ent','Client Expense'],['dep','Deployment'],['infra','Infrastructure'],['other','Other']].map(([v,l])=>`<option value="${v}" ${g('expenseType','sl')===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label>รายการ *</label>
          <input id="me-description" class="ri" value="${esc(g('description'))}" placeholder="ชื่อ Software / อุปกรณ์ / รายการ">
        </div>
        <div class="fg"><label>รูปแบบค่าใช้จ่าย *</label>
          <select id="me-frequency" class="ri" onchange="toggleManualExpenseSchedule()">
            <option value="one_time" ${g('frequency','one_time')==='one_time'?'selected':''}>One-time</option>
            <option value="monthly" ${g('frequency')==='monthly'?'selected':''}>Monthly</option>
          </select>
        </div>
        <div class="fg" id="me-date-wrap"><label>Expense Date *</label>
          <input id="me-date" class="ri" type="date" value="${esc(g('expenseDate',today))}">
        </div>
        <div class="fg" id="me-start-wrap"><label>Start Month *</label>
          <input id="me-start" class="ri" type="month" value="${esc(g('startMonth'))}">
        </div>
        <div class="fg" id="me-end-wrap"><label>End Month *</label>
          <input id="me-end" class="ri" type="month" value="${esc(g('endMonth'))}">
        </div>
        <div class="fg"><label>Quantity *</label>
          <input id="me-qty" class="ri" type="number" min="0.01" step="0.01" value="${g('quantity',1)}" oninput="manualExpenseRecalculate()">
        </div>
        <div class="fg"><label>Unit Cost (THB) *</label>
          <input id="me-unit-cost" class="ri" type="number" min="0" step="0.01" value="${g('unitCost',0)}" oninput="manualExpenseRecalculate()">
        </div>
      </div>
      <div style="margin-top:10px;padding:10px 12px;background:var(--blue-50);border-radius:var(--r-sm);display:flex;justify-content:space-between">
        <span id="me-amount-label" style="font-size:12px;color:var(--blue-800)">Amount</span>
        <strong id="me-amount" style="color:var(--blue)">${money(g('amount',0))}</strong>
      </div>
      <div class="fg" style="margin-top:10px"><label>Notes</label>
        <textarea id="me-notes" class="ri" rows="2" placeholder="เหตุผลหรือรายละเอียดเพิ่มเติม">${esc(g('notes'))}</textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn-ghost" onclick="document.getElementById('manual-expense-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveManualExpenseFromModal()">💾 Save Historical Expense</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  toggleManualExpenseSchedule();
  manualExpenseRecalculate();
}

function toggleManualExpenseSchedule() {
  const monthly = document.getElementById('me-frequency')?.value === 'monthly';
  const dateWrap = document.getElementById('me-date-wrap');
  const startWrap = document.getElementById('me-start-wrap');
  const endWrap = document.getElementById('me-end-wrap');
  if (dateWrap) dateWrap.style.display = monthly ? 'none' : '';
  if (startWrap) startWrap.style.display = monthly ? '' : 'none';
  if (endWrap) endWrap.style.display = monthly ? '' : 'none';
  manualExpenseRecalculate();
}

function manualExpenseRecalculate() {
  const qty = Number(document.getElementById('me-qty')?.value) || 0;
  const unitCost = Number(document.getElementById('me-unit-cost')?.value) || 0;
  const amount = qty * unitCost;
  const monthly = document.getElementById('me-frequency')?.value === 'monthly';
  const amountEl = document.getElementById('me-amount');
  const labelEl = document.getElementById('me-amount-label');
  if (amountEl) amountEl.textContent = money(amount);
  if (labelEl) labelEl.textContent = monthly ? 'Amount per month' : 'Total amount';
  return amount;
}

async function saveManualExpenseFromModal() {
  if (!isPMO()) { alert('เฉพาะ PMO เท่านั้นที่บันทึกรายการได้'); return; }
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const id = get('me-id') || `manual-${Date.now().toString(36).toUpperCase()}`;
  const frequency = get('me-frequency') || 'one_time';
  const referenceNo = get('me-reference');
  const amount = manualExpenseRecalculate();
  const existing = loadManualExpenses().find(e => e.id === id);
  const expense = {
    ...existing,
    id,
    entryKind: get('me-kind') || 'historical',
    referenceNo,
    project: get('me-project'),
    budgetPoolId: get('me-pool') || null,
    expenseType: get('me-type') || 'other',
    description: get('me-description'),
    frequency,
    expenseDate: frequency === 'one_time' ? get('me-date') : null,
    startMonth: frequency === 'monthly' ? get('me-start') : null,
    endMonth: frequency === 'monthly' ? get('me-end') : null,
    quantity: Number(get('me-qty')) || 0,
    unitCost: Number(get('me-unit-cost')) || 0,
    amount,
    notes: get('me-notes'),
    createdBy: existing?.createdBy || currentUser(),
    updatedBy: currentUser(),
  };
  if (!expense.project || !expense.description) { alert('กรุณากรอก Project และรายการ'); return; }
  if (!(expense.quantity > 0) || !(expense.unitCost >= 0) || !(expense.amount > 0)) { alert('Quantity และ Unit Cost ต้องมากกว่า 0'); return; }
  if (frequency === 'one_time' && !expense.expenseDate) { alert('กรุณาระบุ Expense Date'); return; }
  if (frequency === 'monthly' && (!expense.startMonth || !expense.endMonth || expense.startMonth > expense.endMonth)) {
    alert('กรุณาระบุ Start/End Month ให้ถูกต้อง'); return;
  }
  const duplicate = activeManualExpenses().find(e => e.id !== id && referenceNo && e.referenceNo === referenceNo && e.description.toLowerCase() === expense.description.toLowerCase());
  if (duplicate && !confirm(`พบ Reference และรายการคล้ายกันแล้ว: ${duplicate.referenceNo}\nต้องการบันทึกต่อหรือไม่?`)) return;
  try {
    await saveManualExpenseAsync(expense);
    document.getElementById('manual-expense-modal')?.remove();
    await renderActualSpend();
  } catch(e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
}

async function voidManualExpense(id) {
  if (!isPMO()) { alert('เฉพาะ PMO เท่านั้นที่ void รายการได้'); return; }
  const reason = prompt('เหตุผลที่ void รายการนี้:');
  if (!reason?.trim()) return;
  if (!confirm('ยืนยันการ void รายการนี้? รายการจะถูกเก็บไว้ใน audit history แต่ไม่นับรวมยอด')) return;
  try {
    await voidManualExpenseAsync(id, reason.trim());
    document.getElementById('actual-manual-panel')?.remove();
    await renderActualSpend();
  } catch(e) { alert('Void ไม่สำเร็จ: ' + e.message); }
}

async function renderActualSpend() {
  const canonical = await refreshCanonicalActualSpend();
  const fromVal   = document.getElementById('as-from')?.value || '';
  const toVal     = document.getElementById('as-to')?.value   || '';
  const projVal   = document.getElementById('as-project')?.value || 'all';
  const typeVal   = document.getElementById('as-type')?.value   || 'all';
  const sourceVal = document.getElementById('as-source')?.value || 'all';
  const container = document.getElementById('as-content');
  if (!container) return;
  const addButton = document.getElementById('as-add-manual');
  if (addButton) addButton.style.display = isPMO() ? '' : 'none';
  const importButton = document.getElementById('as-import-button');
  if (importButton) importButton.style.display = isPMO() ? '' : 'none';

  const yearSel = document.getElementById('as-year');
  if (yearSel) {
    const current = yearSel.value || String(new Date().getFullYear());
    const years = [...new Set(canonical.flatMap(record => {
      const fallback = String(record.year || record.month || record.createdAt || record.updatedAt || '').slice(0, 4);
      const start = Number(String(record.startDate || fallback).slice(0, 4));
      const end = Number(String(record.endDate || start).slice(0, 4));
      if (!start) return [];
      return Array.from({ length:Math.max(1, Math.min(20, (end || start) - start + 1)) }, (_, i) => String(start + i));
    }))].sort((a,b) => b.localeCompare(a));
    if (!years.length) years.push(String(new Date().getFullYear()));
    yearSel.innerHTML = years.map(year => `<option value="${year}">ปี ${year}</option>`).join('');
    yearSel.value = years.includes(current) ? current : years[0];
  }

  const projSel = document.getElementById('as-project');
  if (projSel) {
    const current = projSel.value;
    const projs = [...new Set(canonical.map(record => record.project).filter(Boolean))].sort();
    projSel.innerHTML = '<option value="all">ทุกโปรเจค</option>';
    projs.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; projSel.appendChild(o); });
    projSel.value = projs.includes(current) ? current : 'all';
  }

  const selectedYear = yearSel?.value || String(new Date().getFullYear());
  const labelEl = document.getElementById('as-period-label');
  if (labelEl) labelEl.textContent = fromVal && toVal ? `ปี ${selectedYear} · ${fromVal} – ${toVal}` : fromVal ? `ปี ${selectedYear} · ตั้งแต่ ${fromVal}` : toVal ? `ปี ${selectedYear} · ถึง ${toVal}` : `แสดงข้อมูลปี ${selectedYear}`;

  const records = filteredActualSpendRecords(canonical);
  if (!records.length) {
    container.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:var(--text-3)">ยังไม่มีข้อมูลในช่วงที่เลือก</div>`;
    return;
  }

  const sourceTotal = source => calculateActualSpend(records, { source });
  const memoTotal = sourceTotal(ACTUAL_SPEND_SOURCES.APPROVED_MEMO);
  const manualTotal = sourceTotal(ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE);
  const infraTotal = sourceTotal(ACTUAL_SPEND_SOURCES.INFRA_COST);
  const grandTotal = calculateActualSpend(records);
  const tdS = 'padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px';
  const byProject = {};
  records.forEach(record => {
    const project = record.project || '(ไม่ระบุ)';
    const key = `${record.spendType}|${record.source}`;
    if (!byProject[project]) byProject[project] = {};
    if (!byProject[project][key]) byProject[project][key] = { spendType:record.spendType, source:record.source, amount:0, records:[] };
    byProject[project][key].amount += Number(record.amount) || 0;
    byProject[project][key].records.push(record);
  });
  const sourceLabel = source => source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO ? 'Memo' : source === ACTUAL_SPEND_SOURCES.INFRA_COST ? 'Infra' : 'Historical';
  const percentLabel = (amount, total) => {
    const percent = total > 0 ? amount / total * 100 : 0;
    return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
  };

  container.innerHTML = `
    <div style="margin:2px 0 14px;display:flex;gap:20px;align-items:center;flex-wrap:wrap;font-size:12px">
      <strong style="font-size:13px">Actual Spend ปี ${esc(selectedYear)}: <span style="color:var(--blue)">${money(Math.round(grandTotal))}</span></strong>
      <span style="color:var(--text-3)"><strong style="color:var(--blue)">Memo</strong> ${money(Math.round(memoTotal))} · ${records.filter(r=>r.source===ACTUAL_SPEND_SOURCES.APPROVED_MEMO).length} รายการ</span>
      <span style="color:var(--text-3)"><strong style="color:var(--amber)">Historical</strong> ${money(Math.round(manualTotal))} · ${records.filter(r=>r.source===ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE).length} รายการ</span>
      <span style="color:var(--text-3)"><strong style="color:var(--green)">Infra</strong> ${money(Math.round(infraTotal))} · ${records.filter(r=>r.source===ACTUAL_SPEND_SOURCES.INFRA_COST).length} รายการ</span>
    </div>
    ${Object.entries(byProject).sort((a,b) => Object.values(b[1]).reduce((s,v)=>s+v.amount,0) - Object.values(a[1]).reduce((s,v)=>s+v.amount,0)).map(([project, groups]) => {
      const projectTotal = Object.values(groups).reduce((sum, group) => sum + group.amount, 0);
      return `<div class="card" style="padding:0;overflow:auto;margin-bottom:10px">
        <div style="padding:10px 14px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;justify-content:space-between"><strong>${esc(project)}</strong><strong style="color:var(--blue)">${money(Math.round(projectTotal))}</strong></div>
        <table class="hist-table"><thead><tr><th style="${tdS};text-align:left">Type</th><th style="${tdS};text-align:left">Source</th><th style="${tdS};text-align:right">Amount</th><th style="${tdS};text-align:right">รายการ</th><th style="${tdS};text-align:right">% ของ Project</th></tr></thead>
        <tbody>${Object.values(groups).sort((a,b)=>b.amount-a.amount).map(group => `<tr style="cursor:pointer" onclick="showActualSpendGroup('${encodeURIComponent(project)}','${encodeURIComponent(group.spendType)}','${encodeURIComponent(group.source)}')">
          <td style="${tdS}"><span style="padding:2px 8px;border-radius:4px;background:var(--bg)">${esc(group.spendType)}</span></td><td style="${tdS}"><span style="padding:2px 7px;border-radius:4px;background:var(--blue-50);color:var(--blue)">${sourceLabel(group.source)}</span></td>
          <td style="${tdS};text-align:right;font-weight:600">${money(Math.round(group.amount))}</td><td style="${tdS};text-align:right;color:var(--blue)">${group.records.length} <span style="color:var(--text-3)">รายการ →</span></td><td style="${tdS};text-align:right">${percentLabel(group.amount, projectTotal)}</td></tr>`).join('')}</tbody></table></div>`;
    }).join('')}`;
}

function showActualSpendGroup(projectEncoded, typeEncoded, sourceEncoded) {
  const project = decodeURIComponent(projectEncoded);
  const spendType = decodeURIComponent(typeEncoded);
  const source = decodeURIComponent(sourceEncoded);
  const rows = filteredActualSpendRecords().filter(record => record.project === project && record.spendType === spendType && record.source === source);
  const panel = document.createElement('div');
  panel.id = 'actual-spend-group-panel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:center;justify-content:center';
  panel.innerHTML = `<div class="card" style="width:900px;max-width:96vw;max-height:86vh;overflow-x:hidden;overflow-y:auto;padding:0"><div style="padding:12px 16px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);z-index:1"><div><strong>${esc(project)} · ${esc(spendType)}</strong><div style="font-size:11px;color:var(--text-3)">${rows.length} รายการ · ${money(calculateActualSpend(rows))}</div></div><button class="btn-sm" onclick="document.getElementById('actual-spend-group-panel').remove()">✕</button></div><div style="padding:10px;display:flex;flex-direction:column;gap:8px">${rows.map(record => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;align-items:start" onclick="document.getElementById('actual-spend-group-panel').remove();showActualSpendRecord('${esc(record.id)}')"><div style="min-width:0"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Reference</div><div style="font-weight:600;color:var(--blue);overflow-wrap:anywhere">${esc(record.referenceNo)}</div></div><div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Source</div><div>${esc(record.source)}</div></div><div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Coverage</div><div>${esc(record.startDate||'—')} → ${esc(record.endDate||'—')}</div></div><div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Budget Status</div><div>${esc(record.budgetStatus)}</div></div><div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Amount</div><div style="font-weight:700">${money(record.amount)}</div></div></div>`).join('')}</div></div>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', event => { if (event.target === panel) panel.remove(); });
}

function showActualSpendRecord(id) {
  const record = loadActualSpendRecords().find(item => item.id === id);
  if (!record) return;
  if (record.source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO && record.memoId) { openMemoReadOnly(record.memoId); return; }
  if (record.source === ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE) {
    const expenseId = String(record.id).replace('actual-spend-manual-', '');
    if (isPMO() && loadManualExpenses().some(item => item.id === expenseId)) { openManualExpenseModal(expenseId); return; }
  }
  alert(`${record.referenceNo}\n${record.source} · ${record.spendType}\n${record.project}\n${record.description || record.vendorProgram || ''}\n${money(record.amount)}\nBudget: ${record.budgetStatus}`);
}

function showActualMemos(proj, type, memoNosStr) {
  const memoNos  = memoNosStr ? memoNosStr.split(',').filter(Boolean) : [];
  const allMemos = loadMemos();
  const memos    = memoNos.map(no => allMemos.find(m => m.memoNo === no)).filter(Boolean);
  const total    = memos.reduce((s, m) => s + (Number(m.total) || 0), 0);
  document.getElementById('actual-memo-panel')?.remove();
  const panel = document.createElement('div');
  panel.id    = 'actual-memo-panel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:300;display:flex;align-items:center;justify-content:center';
  const tdS = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:12px';
  panel.innerHTML = `
    <div class="card" style="width:640px;max-width:95vw;max-height:85vh;overflow-y:auto;padding:0">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface)">
        <div>
          <div style="font-size:14px;font-weight:600">${esc(proj)} · ${BGT_TYPE_LABELS[type] || type}</div>
          <div style="font-size:11px;color:var(--text-3)">${memos.length} memos · ${money(Math.round(total))}</div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('actual-memo-panel').remove()" style="padding:4px 10px">✕</button>
      </div>
      <table class="hist-table">
        <thead><tr>
          <th style="${tdS};text-align:left">Memo No.</th>
          <th style="${tdS};text-align:left">วันที่</th>
          <th style="${tdS};text-align:left">รายการ</th>
          <th style="${tdS};text-align:right">Amount</th>
        </tr></thead>
        <tbody>
          ${memos.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(m => {
            const d = parseThaiDate(m.date) || new Date(m.updatedAt || m.createdAt);
            const dateStr = d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'});
            return `<tr style="cursor:pointer" onclick="document.getElementById('actual-memo-panel').remove();openMemoReadOnly('${esc(m.memoNo)}')">
              <td style="${tdS};color:var(--blue);font-weight:500">${esc(m.memoNo)}</td>
              <td style="${tdS};color:var(--text-3)">${dateStr}</td>
              <td style="${tdS}">${esc(m.subject || m.memoNo)}</td>
              <td style="${tdS};text-align:right;font-weight:500">${money(Number(m.total)||0)}</td>
            </tr>`;
          }).join('')}
          <tr style="background:var(--bg)">
            <td colspan="3" style="${tdS};font-weight:600">Total</td>
            <td style="${tdS};text-align:right;font-weight:700;color:var(--blue)">${money(Math.round(total))}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
}

function showManualExpenses(proj, type) {
  const rows = activeManualExpenses().filter(e => e.project === proj && e.expenseType === type);
  const total = rows.reduce((sum, e) => sum + manualExpenseAmountInRange(e), 0);
  document.getElementById('actual-manual-panel')?.remove();
  const panel = document.createElement('div');
  panel.id = 'actual-manual-panel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:center;justify-content:center';
  const tdS = 'padding:7px 10px;border-bottom:1px solid var(--border);font-size:12px';
  panel.innerHTML = `
    <div class="card" style="width:780px;max-width:96vw;max-height:86vh;overflow:auto;padding:0">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface);z-index:1">
        <div>
          <div style="font-size:14px;font-weight:600">${esc(proj)} · ${BGT_TYPE_LABELS[type] || type} · Historical</div>
          <div style="font-size:11px;color:var(--text-3)">${rows.length} รายการ · ${money(Math.round(total))}</div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('actual-manual-panel').remove()">✕</button>
      </div>
      <table class="hist-table">
        <thead><tr>
          <th style="${tdS};text-align:left">Reference</th>
          <th style="${tdS};text-align:left">รายการ</th>
          <th style="${tdS};text-align:left">ช่วงเวลา</th>
          <th style="${tdS};text-align:right">Amount</th>
          <th style="${tdS};text-align:center">Actions</th>
        </tr></thead>
        <tbody>
          ${rows.map(e => {
            const schedule = e.frequency === 'monthly' ? `${e.startMonth} → ${e.endMonth}` : (e.expenseDate || '—');
            const amount = manualExpenseAmountInRange(e);
            return `<tr>
              <td style="${tdS};color:var(--amber);font-weight:500">${esc(e.referenceNo || 'Manual')}</td>
              <td style="${tdS}">${esc(e.description)}${e.notes ? `<div style="font-size:10px;color:var(--text-3)">${esc(e.notes)}</div>` : ''}</td>
              <td style="${tdS};color:var(--text-3)">${esc(schedule)}</td>
              <td style="${tdS};text-align:right;font-weight:500">${money(Math.round(amount))}</td>
              <td style="${tdS};text-align:center;white-space:nowrap">
                ${isPMO() ? `<button class="btn-sm" onclick="document.getElementById('actual-manual-panel').remove();openManualExpenseModal('${esc(e.id)}')">✎</button>
                <button class="btn-sm" style="color:var(--red);margin-left:4px" onclick="voidManualExpense('${esc(e.id)}')">Void</button>` : '<span style="font-size:10px;color:var(--text-3)">View only</span>'}
              </td>
            </tr>`;
          }).join('')}
          <tr style="background:var(--bg)"><td colspan="3" style="${tdS};font-weight:600">Total</td><td style="${tdS};text-align:right;font-weight:700;color:var(--amber)">${money(Math.round(total))}</td><td style="${tdS}"></td></tr>
        </tbody>
      </table>
    </div>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
}


// ══════════════════════════════════════════
// BUDGET POOLS — Supabase + localStorage
// ══════════════════════════════════════════
const BGT_POOLS_KEY = 'orbit-pmo-budget-pools-v1';
let _poolCache = null;

function loadBudgetPools() {
  if (_poolCache) return _poolCache;
  try { _poolCache = JSON.parse(localStorage.getItem(BGT_POOLS_KEY) || '[]'); } catch(e) { _poolCache = []; }
  return _poolCache;
}
function storeBudgetPools(arr) {
  _poolCache = arr;
  try { localStorage.setItem(BGT_POOLS_KEY, JSON.stringify(arr)); } catch(e) {}
}
async function loadBudgetPoolsAsync() {
  if (await checkSupa()) {
    try {
      const rows = await supaFetch('budget_pools', 'GET', null, '?order=project.asc,name.asc');
      _poolCache = (rows || []).map(r => ({
        id:         r.id,
        project:    r.project,
        name:       r.name,
        budget:     Number(r.budget) || 0,
        year:       r.year,
        startMonth: r.start_month || null,
        endMonth:   r.end_month   || null,
        memoTypes:  r.memo_types  || [],
      }));
      try { localStorage.setItem(BGT_POOLS_KEY, JSON.stringify(_poolCache)); } catch(e) {}
      return _poolCache;
    } catch(e) { console.warn('Budget pools load failed', e.message); }
  }
  return loadBudgetPools();
}
async function savePoolAsync(pool) {
  const all = loadBudgetPools();
  const idx = all.findIndex(p => p.id === pool.id);
  if (idx >= 0) all[idx] = pool; else all.push(pool);
  storeBudgetPools(all);
  if (await checkSupa()) {
    try {
      await supaFetch('budget_pools', 'POST', {
        id: pool.id, project: pool.project, name: pool.name,
        budget: pool.budget, year: pool.year,
        start_month: pool.startMonth || null,
        end_month:   pool.endMonth   || null,
        memo_types:  pool.memoTypes  || [],
        updated_at:  new Date().toISOString(),
      }, '?on_conflict=id');
    } catch(e) { console.warn('Pool save failed', e.message); }
  }
}
async function deletePoolAsync(id) {
  storeBudgetPools(loadBudgetPools().filter(p => p.id !== id));
  _poolCache = null;
  if (await checkSupa()) {
    try { await supaFetch('budget_pools', 'DELETE', null, '?id=eq.' + encodeURIComponent(id)); } catch(e) {}
  }
}

// ── Auto-match memo → pool ──
// Priority: 1) direct budgetPoolId  2) budgetSource project  3) memo.project
function matchMemoToPool(memo, pools) {
  if (!pools || !pools.length) return null;

  // Priority 1: PMO set a direct pool ID — use it if pool still exists
  if (memo.budgetPoolId) {
    const direct = pools.find(p => p.id === memo.budgetPoolId);
    if (direct) return direct;
    // Pool was deleted — fall through to auto-match
  }

  // Priority 2 & 3: auto-match by project + type + date
  const d = parseThaiDate(memo.date) || new Date(memo.updatedAt || memo.createdAt);
  const memoKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const proj = memo.budgetSource || memo.project || '(ไม่ระบุ)';
  const type = memo.type;

  const matches = pools.filter(p => {
    if (p.project !== proj) return false;
    const types = Array.isArray(p.memoTypes) ? p.memoTypes : [];
    if (types.length > 0 && !types.includes(type)) return false;
    if (p.startMonth && memoKey < p.startMonth) return false;
    if (p.endMonth   && memoKey > p.endMonth)   return false;
    return true;
  });
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    const aLen = a.startMonth && a.endMonth
      ? (new Date(a.endMonth+'-01') - new Date(a.startMonth+'-01')) : Infinity;
    const bLen = b.startMonth && b.endMonth
      ? (new Date(b.endMonth+'-01') - new Date(b.startMonth+'-01')) : Infinity;
    return aLen - bLen;
  })[0];
}

// ── Auto-tag a completed memo to the best matching pool ──
// Called from app.js updateMemoStatusAsync when status becomes completed
// Only runs if memo.budgetPoolId is not already set (respect PMO manual tag)
// Returns updated memo if pool found, null otherwise
function autoTagBudgetPool(memo) {
  const pools = loadBudgetPools();
  if (!pools.length) return null;
  const matched = matchMemoToPool(memo, pools);
  if (!matched) return null;
  const memos = loadMemos();
  const idx   = memos.findIndex(m => m.memoNo === memo.memoNo);
  if (idx < 0) return null;
  const updated = {
    ...memos[idx],
    budgetPoolId: matched.id,
    budgetSource: matched.project,
    updatedAt: new Date().toISOString(),
  };
  memos[idx] = updated;
  storeMemos(memos);
  return updated;
}

// Get memos that belong to this pool
// Pass allPools so narrower pool wins over wider — memo goes to the narrowest match
function getPoolMemos(pool, approvedMemos, allPools) {
  if (!pool || !approvedMemos) return [];
  const pools = (Array.isArray(allPools) && allPools.length) ? allPools : [pool];
  return approvedMemos.filter(m => {
    const best = matchMemoToPool(m, pools);
    return best && best.id === pool.id;
  });
}

// Get actual spend for a pool
function getPoolActual(pool, approvedMemos, allPools) {
  const memoActual = getPoolMemos(pool, approvedMemos, allPools)
    .reduce((s, m) => s + (Number(m.total) || 0), 0);
  const manualActual = activeManualExpenses()
    .filter(e => {
      if (e.budgetPoolId) return e.budgetPoolId === pool.id;
      if (e.project !== pool.project) return false;
      const types = Array.isArray(pool.memoTypes) ? pool.memoTypes : [];
      return !types.length || types.includes(e.expenseType);
    })
    .reduce((sum, e) => sum + manualExpenseOccurrences(e)
      .filter(o => (!pool.startMonth || o.month >= pool.startMonth) && (!pool.endMonth || o.month <= pool.endMonth))
      .reduce((s, o) => s + o.amount, 0), 0);
  return memoActual + manualActual;
}

// ══════════════════════════════════════════
// TAB: BUDGET VS ACTUAL
// ══════════════════════════════════════════
let _bvaDataset = null;

function renderBudgetVsActual() {
  loadBudgetPoolsAsync().then(_renderBvaWith).catch(() => _renderBvaWith(loadBudgetPools()));
}

function _renderBvaWith(pools) {
  const yearVal = document.getElementById('bva-year')?.value || '2569';
  const projVal = document.getElementById('bva-project')?.value || 'all';
  const container = document.getElementById('bva-content');
  if (!container) return;

  const canonicalPools = pools.map(createBudgetPoolRecord);
  const canonical = reconcileActualSpendSources(loadMemos(), activeManualExpenses(), loadInfraCosts(), canonicalPools);

  // Populate project dropdown
  const projSel = document.getElementById('bva-project');
  if (projSel && projSel.options.length <= 1) {
    const projs = [...new Set([
      ...canonicalPools.map(p => p.project),
      ...canonical.map(record => record.project || '(ไม่ระบุ)')
    ])].filter(Boolean).sort();
    projs.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; projSel.appendChild(o); });
  }

  _bvaDataset = calculateBudgetVsActualDataset(canonicalPools, canonical, {
    year: yearVal,
    project: projVal === 'all' ? '' : projVal,
  });
  const { rows, unbudgetedRecords, totals } = _bvaDataset;
  const alertEl = document.getElementById('bva-untagged-alert');
  if (alertEl) {
    alertEl.style.display = unbudgetedRecords.length ? '' : 'none';
    alertEl.textContent = unbudgetedRecords.length ? `⚠ ${unbudgetedRecords.length} Actual Spend items are Unbudgeted` : '';
  }

  if (!rows.length && !unbudgetedRecords.length) {
    container.innerHTML = `
      <div class="card" style="padding:32px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px">📋</div>
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px">ยังไม่มี Budget Pool สำหรับปี ${yearVal}</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:16px">ไปที่ Settings → Budget Pools เพื่อตั้งงบประมาณก่อน</div>
        <button class="btn-primary" onclick="switchBudgetTab('bgt-settings')" style="font-size:12px">ไปที่ Settings →</button>
      </div>`;
    return;
  }

  const tdS = 'padding:9px 14px;border-bottom:1px solid var(--border);font-size:12px';
  const pct = totals.utilizationPercent;
  const totalColor = pct > 100 ? 'var(--red)' : pct >= 90 ? 'var(--amber)' : 'var(--green)';
  const byProj = new Map();
  rows.forEach(row => {
    if (!byProj.has(row.pool.project)) byProj.set(row.pool.project, []);
    byProj.get(row.pool.project).push(row);
  });

  container.innerHTML = `
    <div class="metric-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">
      <div class="metric-card"><div class="metric-label">Budget</div><div class="metric-val">${money(Math.round(totals.budget))}</div></div>
      <div class="metric-card" onclick="showBvaActualSpend('all')" style="cursor:pointer"><div class="metric-label">Actual Spend</div><div class="metric-val" style="color:var(--blue)">${money(Math.round(totals.actual))}</div><div class="metric-sub">Click to drill down</div></div>
      <div class="metric-card"><div class="metric-label">Remaining Budget</div><div class="metric-val" style="color:${totals.remaining < 0 ? 'var(--red)' : 'var(--green)'}">${totals.remaining < 0 ? '-' : ''}${money(Math.abs(Math.round(totals.remaining)))}</div><div class="metric-sub">Budget minus Actual Spend</div></div>
      <div class="metric-card"><div class="metric-label">Budget Utilization</div><div class="metric-val" style="color:${totalColor}">${pct.toFixed(1)}%</div></div>
    </div>
    <div class="card" style="padding:14px 16px;margin-bottom:12px">
      <div style="font-size:12px;font-weight:600;margin-bottom:10px">Budget vs Actual</div>
      <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;font-size:11px">
        <span>Actual <strong style="color:${totalColor}">${money(Math.round(totals.actual))}</strong></span>
        <span>Budget <strong>${money(Math.round(totals.budget))}</strong></span>
      </div>
      <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden"><div style="height:100%;width:${Math.min(pct,100)}%;background:${totalColor};border-radius:5px"></div></div>
    </div>
    ${unbudgetedRecords.length ? `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px;border-color:var(--amber)">
        <div onclick="showBvaActualSpend('unbudgeted')" style="padding:12px 14px;cursor:pointer;display:flex;justify-content:space-between;background:var(--amber-50,#FFFBEB)">
          <strong style="color:var(--amber)">Unbudgeted Actual Spend (${unbudgetedRecords.length} items)</strong>
          <strong style="color:var(--amber)">${money(Math.round(totals.unbudgetedActual))} →</strong>
        </div>
      </div>` : ''}
    ${[...byProj.entries()].map(([proj, projectRows]) => `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
        <div style="padding:10px 14px;background:var(--bg);font-size:13px;font-weight:600;border-bottom:1px solid var(--border)">${esc(proj)}</div>
        <table class="hist-table">
          <thead><tr>
            <th style="${tdS};text-align:left">Pool</th>
            <th style="${tdS};text-align:left">Memo Types</th>
            <th style="${tdS};text-align:left">ช่วงเวลา</th>
            <th style="${tdS};text-align:right">Budget (฿)</th>
            <th style="${tdS};text-align:right">Actual (฿)</th>
            <th style="${tdS};text-align:right">Remaining</th>
            <th style="${tdS}">Utilization</th>
          </tr></thead>
          <tbody>
            ${projectRows.map(row => {
              const pool = row.pool;
              const rowPct = row.utilizationPercent;
              const color = rowPct > 100 ? 'var(--red)' : rowPct >= 90 ? 'var(--amber)' : 'var(--green)';
              const typeLabels = (pool.memoTypes || []).map(t => BGT_TYPE_LABELS[t] || t).join(', ') || 'ทุกประเภท';
              return `<tr style="cursor:${row.records.length ? 'pointer' : 'default'}" onclick="${row.records.length ? `showBvaActualSpend('${pool.id}')` : ''}">
                <td style="${tdS};font-weight:500">${esc(pool.name)}</td>
                <td style="${tdS};font-size:11px;color:var(--blue)">${esc(typeLabels)}</td>
                <td style="${tdS};color:var(--text-3);font-size:11px">${pool.startMonth || '—'} → ${pool.endMonth || '—'}</td>
                <td style="${tdS};text-align:right">${money(pool.budget || 0)}</td>
                <td style="${tdS};text-align:right;color:var(--blue);font-weight:500">
                  ${money(Math.round(row.actual))}
                  ${row.records.length ? `<span style="font-size:10px;color:var(--text-3);margin-left:4px">(${row.records.length} items)</span>` : ''}
                </td>
                <td style="${tdS};text-align:right;color:${row.remaining >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:500">
                  ${row.remaining >= 0 ? '' : '-'}${money(Math.abs(Math.round(row.remaining)))}
                </td>
                <td style="${tdS}">
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;background:var(--border);border-radius:4px;height:6px;overflow:hidden">
                      <div style="width:${Math.min(rowPct,100)}%;height:100%;background:${color};border-radius:4px"></div>
                    </div>
                    <span style="font-size:11px;font-weight:500;color:${color};min-width:40px">${rowPct.toFixed(1)}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`).join('')}`;
}

// ── Canonical Actual Spend drill-down ──
function showBvaActualSpend(scope) {
  if (!_bvaDataset) return;
  let records;
  let title;
  if (scope === 'all') {
    records = [..._bvaDataset.rows.flatMap(row => row.records), ..._bvaDataset.unbudgetedRecords];
    title = 'Actual Spend';
  } else if (scope === 'unbudgeted') {
    records = _bvaDataset.unbudgetedRecords;
    title = 'Unbudgeted Actual Spend';
  } else {
    const row = _bvaDataset.rows.find(item => item.pool.id === scope);
    if (!row) return;
    records = row.records;
    title = row.pool.name;
  }
  const total = calculateActualSpend(records);

  // Remove existing panel
  document.getElementById('bva-memo-panel')?.remove();

  const panel = document.createElement('div');
  panel.id    = 'bva-memo-panel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:300;display:flex;align-items:center;justify-content:center';

  const tdS = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:12px';
  panel.innerHTML = `
    <div class="card" style="width:680px;max-width:95vw;max-height:85vh;overflow-y:auto;padding:0">
      <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface)">
        <div>
          <div style="font-size:14px;font-weight:600">${esc(title)}</div>
          <div style="font-size:11px;color:var(--text-3)">${records.length} items · ${money(Math.round(total))}</div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('bva-memo-panel').remove()" style="padding:4px 10px">✕</button>
      </div>
      ${records.length ? `
      <table class="hist-table">
        <thead><tr>
          <th style="${tdS};text-align:left">Reference</th>
          <th style="${tdS};text-align:left">Source</th>
          <th style="${tdS};text-align:left">Project</th>
          <th style="${tdS};text-align:left">Spend Type</th>
          <th style="${tdS};text-align:right">Amount</th>
        </tr></thead>
        <tbody>
          ${records.sort((a,b) => String(b.startDate||'').localeCompare(String(a.startDate||''))).map(record => {
            return `<tr>
              <td style="${tdS};color:var(--blue);font-weight:500">${esc(record.referenceNo)}</td>
              <td style="${tdS};color:var(--text-3)">${esc(record.source)}</td>
              <td style="${tdS}">${esc(record.project)}</td>
              <td style="${tdS}">${esc(record.spendType)}</td>
              <td style="${tdS};text-align:right;font-weight:500">${money(Number(record.amount)||0)}</td>
            </tr>`;
          }).join('')}
          <tr style="background:var(--bg)">
            <td colspan="4" style="${tdS};font-weight:600">Total</td>
            <td style="${tdS};text-align:right;font-weight:700;color:var(--blue)">${money(Math.round(total))}</td>
          </tr>
        </tbody>
      </table>` : `<div style="padding:32px;text-align:center;color:var(--text-3)">ยังไม่มี Actual Spend</div>`}
    </div>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
}

// ══════════════════════════════════════════
// TAB: SETTINGS — Budget Pools + Infra
// ══════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// PMO ROLE HELPER — replace body when user system is ready
// ══════════════════════════════════════════════════════════════════
// isPMO() defined in app.js — do not redefine here

// ══════════════════════════════════════════════════════════════════
// BUDGET POOL — EXCEL TEMPLATE DOWNLOAD
// ══════════════════════════════════════════════════════════════════
function downloadBudgetPoolTemplate() {
  const headers = ['Project','Pool Name','Budget (THB)','Year (BE)','Start Month (YYYY-MM)','End Month (YYYY-MM)','Memo Types (SL,HW,INT,ENT,DEP or blank=all)'];
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  const year = document.getElementById('bset-year')?.value || '2569';

  const examples = projects.map(proj => [proj, 'SL ' + year, '', year, '', '', 'SL']);
  const allRows  = [headers, ...examples];

  const esc2 = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const csv  = allRows.map(r => r.map(esc2).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'budget_pool_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════════
// BUDGET POOL — EXCEL BULK UPLOAD
// ══════════════════════════════════════════════════════════════════
async function handlePoolBulkUpload(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';

  let rows = [];
  try {
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const ws  = wb.Sheets[wb.SheetNames[0]];
    rows      = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } catch(e) {
    alert('ไม่สามารถอ่านไฟล์ได้ — กรุณาใช้ไฟล์ .xlsx หรือ .xls\n' + e.message);
    return;
  }

  if (!rows.length) { alert('ไม่พบข้อมูลในไฟล์'); return; }

  const year = document.getElementById('bset-year')?.value || '2569';
  const valid = [], errors = [];

  rows.forEach((row, i) => {
    const keys = Object.keys(row);
    const get  = prefix => {
      const key = keys.find(k => k.toLowerCase().replace(/[\s(]/g,'').startsWith(prefix.toLowerCase().replace(/[\s(]/g,'')));
      return key ? String(row[key] || '').trim() : '';
    };
    const proj   = get('project');
    const name   = get('poolname') || get('pool');
    const budget = parseFloat(String(get('budget')).replace(/[^0-9.]/g,'')) || 0;
    const yr     = get('year') || year;
    const start  = get('startmonth') || get('start') || null;
    const end    = get('endmonth')   || get('end')   || null;
    const typesRaw = get('memotypes') || get('memo') || '';
    const memoTypes = typesRaw
      ? typesRaw.split(/[,;|\s]+/).map(t => t.trim().toLowerCase()).filter(t => ['sl','hw','int','ent','dep'].includes(t))
      : [];

    if (!proj)   { errors.push('Row ' + (i+2) + ': Missing Project');   return; }
    if (!name)   { errors.push('Row ' + (i+2) + ': Missing Pool Name'); return; }
    if (!budget) { errors.push('Row ' + (i+2) + ': Missing Budget');    return; }

    valid.push({ proj, name, budget, yr, start: start||null, end: end||null, memoTypes });
  });

  if (errors.length) {
    alert('พบข้อผิดพลาด ' + errors.length + ' รายการ:\n' + errors.slice(0,5).join('\n') + (errors.length > 5 ? '\n...' : ''));
    if (!valid.length) return;
    if (!confirm('มีข้อมูลที่ถูกต้อง ' + valid.length + ' รายการ — ต้องการ import ต่อไหม?')) return;
  } else {
    if (!confirm('พบข้อมูล ' + valid.length + ' pool — ยืนยัน import?')) return;
  }

  _showPoolImportPreview(valid, year);
}

function _showPoolImportPreview(items, year) {
  document.getElementById('pool-import-preview')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'pool-import-preview';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center';

  const tdS  = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:11px';
  const rows = items.map(it =>
    '<tr>' +
      '<td style="' + tdS + '">' + esc(it.proj) + '</td>' +
      '<td style="' + tdS + '">' + esc(it.name) + '</td>' +
      '<td style="' + tdS + ';text-align:right">' + money(it.budget) + '</td>' +
      '<td style="' + tdS + '">' + esc(it.yr) + '</td>' +
      '<td style="' + tdS + '">' + esc(it.start || '—') + ' → ' + esc(it.end || '—') + '</td>' +
      '<td style="' + tdS + '">' + (it.memoTypes.length ? it.memoTypes.map(t => t.toUpperCase()).join(', ') : 'ทุกประเภท') + '</td>' +
    '</tr>'
  ).join('');

  modal.innerHTML =
    '<div class="card" style="width:700px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;padding:0;overflow:hidden">' +
      '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:15px;font-weight:700">Preview — Budget Pool Import (' + items.length + ' รายการ)</span>' +
        '<button class="btn-sm" onclick="document.getElementById(\'pool-import-preview\').remove()" style="padding:4px 10px">✕</button>' +
      '</div>' +
      '<div style="overflow:auto;flex:1">' +
        '<table class="hist-table" style="min-width:600px">' +
          '<thead><tr>' +
            '<th style="' + tdS + '">Project</th>' +
            '<th style="' + tdS + '">Pool Name</th>' +
            '<th style="' + tdS + ';text-align:right">Budget</th>' +
            '<th style="' + tdS + '">ปี</th>' +
            '<th style="' + tdS + '">ช่วงเวลา</th>' +
            '<th style="' + tdS + '">Memo Types</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px">' +
        '<button class="btn-ghost" onclick="document.getElementById(\'pool-import-preview\').remove()">ยกเลิก</button>' +
        '<button class="btn-primary" onclick="_confirmPoolImport()">✓ Confirm Import</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
  window._poolImportPending = { items, year };
}

async function _confirmPoolImport() {
  const { items, year } = window._poolImportPending || {};
  if (!items) return;

  const existing = loadBudgetPools();
  let created = 0, updated = 0;

  for (const it of items) {
    const match = existing.find(p => p.project === it.proj && p.name === it.name && p.year === it.yr);
    const id    = match?.id || ('pool-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase());
    const entry = { id, project: it.proj, name: it.name, budget: it.budget, year: it.yr, startMonth: it.start, endMonth: it.end, memoTypes: it.memoTypes };
    await savePoolAsync(entry);
    if (match) updated++; else created++;
  }

  document.getElementById('pool-import-preview')?.remove();
  window._poolImportPending = null;
  alert('Import สำเร็จ — สร้างใหม่ ' + created + ' pool, อัปเดต ' + updated + ' pool');
  renderBudgetSettings();
}

function switchBgtSettings(panel, btn) {
  ['budget','infra'].forEach(p => {
    const el  = document.getElementById('bset-panel-' + p);
    const nav = document.getElementById('bset-nav-' + p);
    if (el)  el.style.display  = p === panel ? '' : 'none';
    if (nav) {
      nav.style.borderLeft = p === panel ? '2px solid var(--blue)' : '2px solid transparent';
      nav.style.background = p === panel ? 'var(--blue-50)' : '';
      const span = nav.querySelector('span');
      if (span) { span.style.color = p === panel ? 'var(--blue)' : 'var(--text-2)'; span.style.fontWeight = p === panel ? '600' : '400'; }
      const svg = nav.querySelector('svg');
      if (svg) svg.setAttribute('stroke', p === panel ? '#185FA5' : 'currentColor');
    }
  });
  if (panel === 'infra') renderBudgetSLInfra();
}

function renderBudgetSettings() {
  const body = document.getElementById('bset-budget-body');
  if (!body) return;
  const year  = document.getElementById('bset-year')?.value || '2569';
  const pools = loadBudgetPools().filter(p => p.year === year);

  if (!pools.length) {
    body.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-3);font-size:12px">ยังไม่มี Budget Pool สำหรับปี ${year} — กด "+ Add Pool" เพื่อเริ่ม</div>`;
    return;
  }

  const tdS = 'padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px';
  // Group by project
  const byProj = {};
  pools.forEach(p => { if (!byProj[p.project]) byProj[p.project] = []; byProj[p.project].push(p); });

  body.innerHTML = Object.entries(byProj).map(([proj, projPools]) => `
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">${esc(proj)}</div>
      <table class="hist-table">
        <thead><tr>
          <th style="${tdS};text-align:left">Pool Name</th>
          <th style="${tdS};text-align:left">ช่วงเวลา</th>
          <th style="${tdS};text-align:right">Budget (฿)</th>
          <th style="${tdS};text-align:center">Actions</th>
        </tr></thead>
        <tbody>
          ${projPools.map(p => `<tr>
            <td style="${tdS};font-weight:500">${esc(p.name)}</td>
            <td style="${tdS};font-size:11px;color:var(--text-3)">${p.startMonth || '—'} → ${p.endMonth || '—'}</td>
            <td style="${tdS};text-align:right;font-weight:600">${money(p.budget || 0)}</td>
            <td style="${tdS};text-align:center">
              <button class="btn-sm" style="font-size:11px;padding:2px 7px" onclick="openBudgetPoolModal('${p.id}')">✎</button>
              <button class="btn-sm" style="font-size:11px;padding:2px 7px;color:var(--red)" onclick="deleteBudgetPool('${p.id}')">✕</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
}

function openBudgetPoolModal(editId) {
  const s       = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = s?.projects || [];
  const pool    = editId ? loadBudgetPools().find(p => p.id === editId) : null;
  const year    = document.getElementById('bset-year')?.value || '2569';

  const g = (f, def = '') => pool ? (pool[f] ?? def) : def;
  const projOpts = projects.map(p => `<option value="${esc(p)}" ${g('project') === p ? 'selected' : ''}>${esc(p)}</option>`).join('');

  // Create inline modal
  const existing = document.getElementById('bpool-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'bpool-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:300;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div class="card" style="width:500px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
        <span style="font-size:15px;font-weight:700">${editId ? 'Edit' : 'New'} Budget Pool</span>
        <button class="btn-sm" onclick="document.getElementById('bpool-modal').remove()" style="padding:4px 10px">✕</button>
      </div>
      <input type="hidden" id="bpool-edit-id" value="${editId || ''}">
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg"><label>Project *</label>
          <select id="bpool-project" class="ri"><option value="">— เลือก —</option>${projOpts}</select>
        </div>
        <div class="fg"><label>Pool Name *</label>
          <input id="bpool-name" class="ri" placeholder="เช่น SL 2025, HW Q1" value="${esc(g('name'))}">
        </div>
        <div class="fg"><label>Budget (฿) *</label>
          <input id="bpool-budget" class="ri" type="number" min="0" value="${g('budget')}">
        </div>
        <div class="fg"><label>ปี (Thai Buddhist Era)</label>
          <input id="bpool-year" class="ri" value="${g('year', year)}" readonly style="background:var(--bg)">
        </div>
        <div class="fg"><label>Start Month (YYYY-MM)</label>
          <input id="bpool-start" class="ri" type="month" value="${g('startMonth')}">
        </div>
        <div class="fg"><label>End Month (YYYY-MM)</label>
          <input id="bpool-end" class="ri" type="month" value="${g('endMonth')}">
        </div>
      </div>
      <div class="fg" style="margin-top:12px">
        <label>Memo Types ที่จะตัดเข้า pool นี้ <span style="font-size:11px;font-weight:400;color:var(--text-3)">(ไม่เลือก = รับทุกประเภท)</span></label>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px 12px;margin-top:6px">
          ${Object.entries(BGT_TYPE_LABELS).map(([k,v]) => `
            <label style="display:flex;align-items:center;gap:7px;min-width:0;font-size:12px;line-height:1.3;cursor:pointer">
              <input type="checkbox" id="bpool-type-${k}" value="${k}" ${(g('memoTypes')||[]).includes(k) ? 'checked' : ''} style="width:16px;height:16px;min-width:16px;padding:0;flex:0 0 16px;accent-color:var(--blue);cursor:pointer">
              <span>${v}</span>
            </label>`).join('')}
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:18px">
        <button class="btn-ghost" onclick="document.getElementById('bpool-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveBudgetPool()">💾 Save</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function saveBudgetPool() {
  const g      = id => document.getElementById(id)?.value?.trim() || '';
  const project = g('bpool-project');
  const name    = g('bpool-name');
  const budget  = parseFloat(g('bpool-budget')) || 0;
  const year    = g('bpool-year');
  const start   = g('bpool-start') || null;
  const end     = g('bpool-end')   || null;
  const editId  = g('bpool-edit-id');

  const memoTypes = Object.keys(BGT_TYPE_LABELS).filter(k => document.getElementById('bpool-type-' + k)?.checked);

  if (!project) { alert('กรุณาเลือก Project'); return; }
  if (!name)    { alert('กรุณากรอกชื่อ Pool'); return; }
  if (!budget)  { alert('กรุณากรอก Budget'); return; }

  const id    = editId || `pool-${Date.now().toString(36).toUpperCase()}`;
  const entry = { id, project, name, budget, year, startMonth: start, endMonth: end, memoTypes };

  savePoolAsync(entry)
    .then(() => {
      document.getElementById('bpool-modal')?.remove();
      renderBudgetSettings();
    })
    .catch(e => console.warn('Pool save error:', e));
}

function deleteBudgetPool(id) {
  if (!confirm('ลบ pool นี้?')) return;
  deletePoolAsync(id)
    .then(() => renderBudgetSettings())
    .catch(e => console.warn('Pool delete error:', e));
}
