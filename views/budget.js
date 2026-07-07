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
    vendorProgram: r.vendor_program || '',
    notes: r.notes || '',
    createdBy: r.created_by || '',
    updatedBy: r.updated_by || '',
    voidedAt: r.voided_at || null,
    voidedBy: r.voided_by || '',
    voidReason: r.void_reason || '',
    createdAt: r.created_at || null,
    updatedAt: r.updated_at || null,
    // Manual Entry audit timeline (2026-07-03) — see manualExpenseAuditTimelineHtml().
    auditLog: r.audit_log || [],
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
    vendor_program: e.vendorProgram || null,
    notes: e.notes || null,
    created_by: e.createdBy || null,
    updated_by: e.updatedBy || null,
    voided_at: e.voidedAt || null,
    voided_by: e.voidedBy || null,
    void_reason: e.voidReason || null,
    created_at: e.createdAt || new Date().toISOString(),
    updated_at: e.updatedAt || new Date().toISOString(),
    audit_log: e.auditLog || [],
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
      const localById = new Map(loadManualExpenses().map(expense => [expense.id, expense]));
      storeManualExpenses((rows || []).map(row => {
        const expense = manualExpenseFromDb(row);
        if (!expense.vendorProgram) expense.vendorProgram = localById.get(expense.id)?.vendorProgram || '';
        return expense;
      }));
      return _manualExpenseCache;
    } catch(e) { console.warn('Manual expenses load failed, using local backup', e.message); }
  }
  return loadManualExpenses();
}

function isMissingVendorProgramColumnError(error) {
  const detail = `${error?.code || ''} ${error?.message || error || ''}`.toLowerCase();
  return detail.includes('pgrst204')
    && detail.includes('vendor_program')
    && (detail.includes('column') || detail.includes('schema cache'));
}
// Same schema-cache-lag fallback as isMissingVendorProgramColumnError(), for the new audit_log
// column (20260703170000_manual_expense_audit_log.sql) — until that migration is applied, both
// saveManualExpenseAsync() and voidManualExpenseAsync() retry their write without audit_log rather
// than failing the whole save/void.
function isMissingAuditLogColumnError(error) {
  const detail = `${error?.code || ''} ${error?.message || error || ''}`.toLowerCase();
  return detail.includes('pgrst204')
    && detail.includes('audit_log')
    && (detail.includes('column') || detail.includes('schema cache'));
}

async function saveManualExpenseAsync(expense) {
  const now = new Date().toISOString();
  const rows = [...loadManualExpenses()];
  const idx = rows.findIndex(e => e.id === expense.id);
  const isNew = idx < 0;
  // Manual Entry audit timeline (2026-07-03) — mirrors the memo Audit Log shape
  // (actor/action/comment/timestamp) so showManualEntryDetail() can render a
  // timeline the same way Memo Detail does. Centralized here (the single write
  // path for both the Add/Edit modal and Excel-import promotion) rather than at
  // each caller, same pattern as createdAt/updatedAt stamping just below.
  const auditLog = [...(isNew ? [] : (rows[idx].auditLog || []))];
  auditLog.push({
    action: isNew ? 'Created' : 'Edited',
    actor: expense.updatedBy || currentUser(),
    timestamp: now,
  });
  const saved = {
    ...expense,
    auditLog,
    createdAt: idx >= 0 ? rows[idx].createdAt : (expense.createdAt || now),
    updatedAt: now,
  };
  if (idx >= 0) rows[idx] = saved; else rows.unshift(saved);
  storeManualExpenses(rows);
  if (await checkSupa()) {
    const dbRecord = manualExpenseToDb(saved);
    try {
      await supaFetch('budget_manual_expenses', 'POST', dbRecord, '?on_conflict=id');
    } catch (error) {
      if (!isMissingVendorProgramColumnError(error) && !isMissingAuditLogColumnError(error)) throw error;
      const compatibleRecord = { ...dbRecord };
      if (isMissingVendorProgramColumnError(error)) delete compatibleRecord.vendor_program;
      if (isMissingAuditLogColumnError(error)) delete compatibleRecord.audit_log;
      await supaFetch('budget_manual_expenses', 'POST', compatibleRecord, '?on_conflict=id');
    }
  }
  return saved;
}

async function voidManualExpenseAsync(id, reason) {
  const rows = [...loadManualExpenses()];
  const idx = rows.findIndex(e => e.id === id);
  if (idx < 0) throw new Error('ไม่พบรายการ');
  const now = new Date().toISOString();
  const auditLog = [...(rows[idx].auditLog || []), {
    action: 'Voided',
    actor: currentUser(),
    comment: reason || '',
    timestamp: now,
  }];
  const updated = {
    ...rows[idx],
    voidedAt: now,
    voidedBy: currentUser(),
    voidReason: reason,
    updatedBy: currentUser(),
    updatedAt: now,
    auditLog,
  };
  if (await checkSupa()) {
    const patch = {
      voided_at: now,
      voided_by: updated.voidedBy,
      void_reason: reason,
      updated_by: updated.updatedBy,
      updated_at: now,
      audit_log: auditLog,
    };
    try {
      await supaFetch('budget_manual_expenses', 'PATCH', patch, '?id=eq.' + encodeURIComponent(id));
    } catch (error) {
      if (!isMissingAuditLogColumnError(error)) throw error;
      const compatiblePatch = { ...patch };
      delete compatiblePatch.audit_log;
      await supaFetch('budget_manual_expenses', 'PATCH', compatiblePatch, '?id=eq.' + encodeURIComponent(id));
    }
  }
  rows[idx] = updated;
  storeManualExpenses(rows);
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
let _actualSpendCurrentTab = 'report';
function switchActualSpendTab(tab, btn) {
  _actualSpendCurrentTab = tab === 'manual' ? 'manual' : 'report';
  const reportPanel = document.getElementById('as-panel-report');
  const manualPanel = document.getElementById('as-panel-manual');
  if (reportPanel) reportPanel.style.display = _actualSpendCurrentTab === 'report' ? '' : 'none';
  if (manualPanel) manualPanel.style.display = _actualSpendCurrentTab === 'manual' ? '' : 'none';
  [document.getElementById('as-tab-report'), document.getElementById('as-tab-manual')].forEach(tabButton => tabButton?.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if (_actualSpendCurrentTab === 'manual') renderManualEntries();
}
function switchBudgetTab(tab, btn) {
  _bgtCurrentTab = tab;
  ['overview','actual-spend','forecast','bva','bgt-settings'].forEach(t => {
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
  if (tab === 'bgt-settings')  renderBudgetSettings();
}

// ── Main entry ──
// ── Export Budget CSVs ──────────────────────────────────────────

async function exportActualSpendCSV() {
  await refreshCanonicalActualSpend();
  const rows = filteredActualSpendRecords().map(record => [
    record.id || '', record.source, record.referenceNo, record.spendType, record.project, record.amount,
    record.currency || '', 'Total for coverage period', record.startDate || '', record.endDate || '',
    record.coverageStatus || '', record.vendorProgram || '', record.finalBudgetPoolId || '', record.budgetStatus,
    record.createdBy || '', record.description || '', record.notes || '',
  ]);
  if (!rows.length) { alert('ไม่มีข้อมูล'); return; }
  _downloadCSV('Actual_Spend', [
    'Record ID','Source','Reference No','Spend Type','Project','Amount','Currency','Amount Basis',
    'Start Date','End Date','Coverage Status','Vendor / Program','Final Budget Pool','Budget Status',
    'Created By','Description','Notes',
  ], rows);
}

function manualExpenseToActualSpend(expense) {
  const monthly = expense.frequency === 'monthly';
  const startDate = monthly ? expense.startMonth : expense.expenseDate;
  const endDate = monthly ? expense.endMonth : expense.expenseDate;
  const months = monthly ? inclusiveCoverageMonths(startDate, endDate) : 1;
  return createActualSpendRecord({
    id: `actual-spend-manual-${expense.id}`,
    source: ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    referenceNo: expense.referenceNo || '',
    project: expense.project,
    spendType: spendTypeFromMemoType(expense.expenseType),
    amount: (Number(expense.amount) || 0) * (months || 1),
    startDate, endDate,
    vendorProgram: expense.vendorProgram || '',
    description: expense.description || expense.notes || '',
    notes: expense.notes || '',
    manualBudgetPoolId: expense.budgetPoolId || null,
    createdBy: expense.createdBy || '', createdAt: expense.createdAt,
    updatedBy: expense.updatedBy || '', updatedAt: expense.updatedAt,
  });
}

// Converts a validated Excel-imported "Manual / Historical" Actual Spend row into
// the same shape the manual expense form saves, so imported rows become editable
// and soft-deletable through the existing manual expense store.
function importedManualCoverage(startDate, endDate) {
  const startMonth = String(startDate || '').slice(0, 7);
  const endMonth = String(endDate || '').slice(0, 7);
  const months = inclusiveCoverageMonths(startMonth, endMonth);
  return { startMonth, endMonth, months, monthly: Number(months) > 1 };
}

function manualExpenseFromImportedActualSpend(record) {
  const coverage = importedManualCoverage(record.startDate, record.endDate);
  const { months, monthly } = coverage;
  const totalAmount = Number(record.amount) || 0;
  // Import Amount is the total for the coverage period; when spread across
  // months we must store the per-month amount so manualExpenseToActualSpend's
  // amount × months does not double-count the total.
  const perUnitAmount = monthly ? totalAmount / months : totalAmount;
  return {
    id: generateFinancialRecordId('manual-import'),
    entryKind: 'historical',
    referenceNo: record.referenceNo || '',
    project: record.project || '',
    budgetPoolId: null,
    expenseType: SPEND_TYPE_TO_MEMO_TYPE[record.spendType] || 'other',
    description: record.description || record.vendorProgram || '',
    frequency: monthly ? 'monthly' : 'one_time',
    expenseDate: monthly ? null : (record.startDate ? (String(record.startDate).length === 7 ? `${record.startDate}-01` : record.startDate) : null),
    startMonth: monthly ? coverage.startMonth : null,
    endMonth: monthly ? coverage.endMonth : null,
    quantity: 1,
    unitCost: perUnitAmount,
    amount: perUnitAmount,
    vendorProgram: record.vendorProgram || '',
    notes: '',
    createdBy: record.createdBy || currentUser(),
    updatedBy: record.createdBy || currentUser(),
    voidedAt: null,
  };
}

// After importActualSpendRecords() writes validated rows to canonical storage,
// move any "Manual / Historical Expense" sourced rows into the manual expense
// store and drop their direct-canonical copy so reconcileActualSpendSources()
// re-projects them the same way manually added expenses are projected.
async function promoteImportedManualExpenses(records) {
  const manualRecords = (records || []).filter(record => record.source === ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE);
  if (!manualRecords.length) return;
  for (const record of manualRecords) {
    await saveManualExpenseAsync(manualExpenseFromImportedActualSpend(record));
  }
  const manualIds = new Set(manualRecords.map(record => record.id));
  storeActualSpendRecords(loadActualSpendRecords().filter(row => !manualIds.has(row.id)));
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

// Part 8 (UX consistency pass) — Project/Type/Budget Status are multi-select
// filters. queryActualSpend() itself is left untouched (still single-value,
// still the shared canonical filter used elsewhere per MASTER_SPEC "Shared
// calculation functions only") — called here with no project/spendType/
// budgetStatus so it's a pass-through, and the multi-select matching is
// layered on as an additional .filter() step instead.
function filteredActualSpendRecords(records = loadActualSpendRecords()) {
  const from = document.getElementById('as-from')?.value || '';
  const to = document.getElementById('as-to')?.value || '';
  const project = msValues('as-project');
  const type = msValues('as-type');
  const source = document.getElementById('as-source')?.value || 'all';
  const budgetStatus = msValues('as-budget-status');
  const year = document.getElementById('as-year')?.value || '';
  const sourceMap = { memo:ACTUAL_SPEND_SOURCES.APPROVED_MEMO, manual:ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE, infra:ACTUAL_SPEND_SOURCES.INFRA_COST };
  const spendTypes = type.map(spendTypeFromMemoType);
  return queryActualSpend({
    source: source === 'all' ? '' : sourceMap[source],
  }, records).filter(record =>
    (!project.length || project.includes(record.project)) &&
    (!spendTypes.length || spendTypes.includes(record.spendType)) &&
    (!budgetStatus.length || budgetStatus.includes(record.budgetStatus)) &&
    actualSpendRecordInRange(record, from, to) && (!year || actualSpendRecordInYear(record, year))
  );
}

function actualSpendRecordInYear(record, year) {
  const fallback = String(record.year || record.month || record.createdAt || record.updatedAt || '').slice(0, 4);
  const startYear = String(record.startDate || fallback).slice(0, 4);
  const endYear = String(record.endDate || startYear).slice(0, 4);
  return (!startYear || startYear <= year) && (!endYear || endYear >= year);
}

function excelImportDateParts(value) {
  let date;
  if (typeof value === 'number' && Number.isFinite(value)) {
    date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return Number.isNaN(date.getTime()) ? null : {
      year:date.getUTCFullYear(), month:date.getUTCMonth() + 1, day:date.getUTCDate(),
    };
  }
  if (value && typeof value === 'object' && typeof value.getFullYear === 'function') {
    date = value;
    return Number.isNaN(date.getTime()) ? null : {
      year:date.getFullYear(), month:date.getMonth() + 1, day:date.getDate(),
    };
  }
  return null;
}

// Phase 7A-9C bug fix: Budget Pool bulk import Start/End Month cells. Excel commonly auto-converts
// a typed "2026-01" (or "2569-01") cell into a real date/serial value instead of keeping it as
// text (sheet_to_json then returns a raw Excel serial number, or a JS Date if the caller ever reads
// with `cellDates:true`) — neither of which normalizeMonthValueToGregorian() (app.js) can parse, so
// every such row was failing "Valid start/end month or date range is required" even though the cell
// visibly shows a valid month. Reuses the existing excelImportDateParts() decoder (already used by
// Actual Spend import for the same Excel behavior) instead of a new date-parsing engine, and
// collapses to "YYYY-MM" (day discarded) since this is a MONTH field, not a date field. A plain
// text cell (BE or CE "YYYY-MM") passes through unchanged — normalizeMonthValueToGregorian() still
// does the BE-to-CE conversion, same as every other Budget Pool write path; this only fixes what
// reaches it.
function excelImportMonthValue(value) {
  const parts = excelImportDateParts(value);
  if (parts) return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  return String(value ?? '').trim() || null;
}

function normalizeActualSpendImportDates(startValue, endValue) {
  const startParts = excelImportDateParts(startValue);
  const endParts = excelImportDateParts(endValue);
  const monthPrecision = startParts?.day === 1 && endParts?.day === 1;
  const format = (value, parts) => {
    if (!parts) return String(value ?? '').trim() || null;
    const month = String(parts.month).padStart(2, '0');
    const day = String(parts.day).padStart(2, '0');
    return monthPrecision ? `${parts.year}-${month}` : `${parts.year}-${month}-${day}`;
  };
  return { startDate:format(startValue, startParts), endDate:format(endValue, endParts) };
}

function actualSpendImportRow(row) {
  const get = (...keys) => keys.map(key => row[key]).find(value => value !== undefined && value !== '');
  const rawSource = String(get('Source','source') || '').trim();
  const sourceAliases = {
    'approved memo': ACTUAL_SPEND_SOURCES.APPROVED_MEMO,
    'manual / historical': ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    'manual / historical expense': ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE,
    'infra cost': ACTUAL_SPEND_SOURCES.INFRA_COST,
  };
  const source = sourceAliases[rawSource.toLowerCase()] || rawSource;
  const rawType = String(get('Spend Type','spendType','Type','type') || '').trim();
  const canonicalType = SPEND_TYPE_VALUES.find(type => type.toLowerCase() === rawType.toLowerCase());
  const spendType = rawType.toLowerCase() === 'infrastructure' && SPEND_TYPE_VALUES.includes(SPEND_TYPES.INFRA)
    ? SPEND_TYPES.INFRA
    : canonicalType || rawType;
  const dates = normalizeActualSpendImportDates(
    get('Start Date','Start','startDate'),
    get('End Date','End','endDate'),
  );
  return {
    source, referenceNo:String(get('Reference No','Reference','referenceNo') || '').trim(),
    project:String(get('Project','project') || '').trim(), spendType,
    amount:Number(get('Amount','amount') || 0), currency:'THB',
    startDate:dates.startDate,
    endDate:dates.endDate,
    vendorProgram:String(get('Vendor / Program','Program','vendorProgram') || '').trim(),
    description:String(get('Description','description') || '').trim(), createdBy:currentUser(),
  };
}

function manualEntriesImportRow(row) {
  return { ...actualSpendImportRow(row), source:ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE };
}

function downloadActualSpendTemplate() {
  if (typeof XLSX === 'undefined') { alert('ไม่พบ SheetJS library'); return; }
  const headers = ['Source','Reference No','Spend Type','Project','Amount','Start Date','End Date','Vendor / Program','Description'];
  const samples = [
    ['Manual / Historical','HIST-2025-001','Hardware','AOA-MP',75000,'2025-11-15','2025-11-15','Vendor A','Historical laptop purchase'],
    ['Infra Cost','INFRA-2026-001','Infra','TTB',24000,'2026-06','2026-08','AWS','Total infrastructure cost for the coverage period'],
  ];
  const template = XLSX.utils.aoa_to_sheet([headers, ...samples]);
  template['!cols'] = [24,22,20,18,16,16,16,24,42].map(wch => ({ wch }));
  template['!autofilter'] = { ref:`A1:I${samples.length + 1}` };

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Actual Spend Import Instructions'],
    ['Required columns','Source, Spend Type, Project, Amount (Reference No is optional)'],
    ['Allowed Source','Approved Memo, Manual / Historical, or Infra Cost.'],
    ['Allowed Spend Type','Software, Hardware, Team Activity, Client Expense, Deployment, Infra, Others'],
    ['Amount','Total amount for the coverage period (positive THB amount). Do not enter a monthly amount.'],
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
      const workbook = XLSX.read(e.target.result, { type:'binary', cellDates:true });
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval:'' }).map(manualEntriesImportRow);
      const result = importActualSpendRecords(rows);
      if (!result.valid) {
        alert(`Import ไม่สำเร็จ\n${result.errors.map(error => `Row ${error.row}: ${error.errors.join(', ')}`).join('\n')}`);
        return;
      }
      await promoteImportedManualExpenses(result.records);
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
  // Export exactly the pools currently visible on the Budget vs Actual tab (same Year/Project/
  // Spend Type/Search filters as `_bvaDataset`), not every pool in storage — so "Export Pools" and
  // "Export BvA" agree with each other and with the on-screen tables for the same filter state
  // (Part 5). Falls back to the unfiltered canonical list only if the tab hasn't rendered a
  // dataset yet — canonicalized so this fallback can't export a stale raw `year` (Phase 7A-9A).
  const pools = _bvaDataset ? _bvaDataset.rows.map(row => row.pool) : loadBudgetPools().map(createBudgetPoolRecord);
  if (!pools.length) { alert('ไม่มี Budget Pool ตามเงื่อนไขที่เลือก'); return; }
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
    // Seed the custom selectors with the currently applied range instead of leaving them at the
    // browser's default (first option = oldest available month), which looked like a stale,
    // multi-year-old default unrelated to the period actually shown on screen.
    const fromSel = document.getElementById('ov-from-sel');
    const toSel = document.getElementById('ov-to-sel');
    if (fromSel) fromSel.value = _ov.fromIdx;
    if (toSel) toSel.value = _ov.toIdx;
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
  const t = Math.max(f, parseInt(document.getElementById('ov-to-sel')?.value ?? _ov.allMonths.length - 1));
  const span = t - f + 1;
  // A range over 12 months must be blocked with a clear message, not silently truncated to 12
  // months while the selectors keep showing the wider range the user actually picked.
  if (span > 12) {
    alert('เลือกช่วงเวลาได้สูงสุด 12 เดือนเท่านั้น กรุณาเลือกช่วงใหม่ (You can select a maximum of 12 months only)');
    const toSel = document.getElementById('ov-to-sel');
    if (toSel) toSel.value = _ov.toIdx;
    return;
  }
  _ov.fromIdx = f;
  _ov.toIdx   = t;
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

// Canonical Budget vs Actual dataset for Overview's Budget/Remaining/Utilization figures. Reads
// the same Budget Pool + Actual Spend sources through the single shared
// calculateBudgetVsActualDataset() engine that the Budget vs Actual tab uses (see _renderBvaWith()),
// replacing the legacy loadSLBudgets() store (docs/TECHNICAL_DEBT.md TD-7A-03,
// docs/MASTER_SPEC.md §11). Scoped to the current BE year only — Overview has no year selector, and
// this matches the year loadSLBudgets() used to be keyed on. Overview's own Project/Spend Type chip
// filters and month-range are applied by each caller afterward, not here.
function _ovCanonicalDataset() {
  const canonicalPools = loadBudgetPools().map(createBudgetPoolRecord);
  return calculateBudgetVsActualDataset(canonicalPools, loadActualSpendRecords(), { year: getCurrentBuddhistYear() });
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

  // ── Budget from canonical Budget Pool, via the shared Budget vs Actual dataset engine (TD-7A-03) ──
  const annualBudget = _ovCanonicalDataset().rows
    .filter(row => projArr.includes(row.pool.project))
    .reduce((s, row) => s + row.budget, 0);
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
    setText('bgt-kpi-budget-sub', `งบจาก Budget Pool ${numMonths} เดือน`);
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
    if (budEl) budEl.innerHTML = `ยังไม่ได้ตั้งงบ — <span style="color:var(--blue);cursor:pointer;text-decoration:underline" onclick="switchBudgetTab('bgt-settings')">ตั้งค่าที่นี่</span>`;
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
  // Canonical Budget Pool totals per project (TD-7A-03) — replaces the legacy loadSLBudgets() store.
  const poolBudgetByProject = new Map();
  _ovCanonicalDataset().rows.forEach(row => {
    poolBudgetByProject.set(row.pool.project, (poolBudgetByProject.get(row.pool.project) || 0) + row.budget);
  });

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

    const annualBgt = poolBudgetByProject.get(proj) || 0;
    const budget    = annualBgt > 0 ? (annualBgt / 12) * numMonths : null;
    const hasBudget = budget !== null && budget > 0;
    const pct       = hasBudget ? Math.round(actual / budget * 100) : null;
    const color     = pct === null ? 'var(--text-3)' : pct > 100 ? 'var(--red)' : pct >= 90 ? 'var(--amber)' : 'var(--blue)';
    const barW      = pct !== null ? Math.min(pct, 100) : 0;
    return { proj, actual, budget, hasBudget, pct, color, barW };
  }).filter(d => d.actual > 0 || d.hasBudget);

  if (!rows.length) {
    container.innerHTML = `<div class="hist-empty">No records found — approve an SL memo or set a budget first.</div>`;
    return;
  }

  // Formula note
  const noteEl = document.getElementById('ov-bva-formula');
  if (noteEl) {
    noteEl.innerHTML = `
      <span style="font-weight:500">Budget</span> = งบรวมจาก Budget Pool ปีปัจจุบัน ÷ 12 × ${numMonths} เดือน &nbsp;·&nbsp;
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
  const slBudgetProjects = Object.keys(loadSLBudgets()?.[getCurrentBuddhistYear()] || {});
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
    // Thai month-name dates are always BE; route through the one shared BE->CE helper instead of
    // a local "-543" (Phase 7A-9A, folding parseThaiDate onto financialYearToGregorian()).
    const yr = Number(financialYearToGregorian(m1[3]));
    if(mo !== undefined && yr > 1900) return new Date(yr, mo, parseInt(m1[1]));
  }
  // dd/mm/yy or dd/mm/yyyy
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m2) {
    let yr = parseInt(m2[3]);
    if(yr < 100) yr += 2500; // treat as Buddhist Era short
    yr = Number(financialYearToGregorian(yr));
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

  // Project dropdown — Part 8 (UX consistency pass): multi-select filter.
  initMultiSelect('sl-forecast-proj', 'ทุกโปรเจค', 'Project');
  const projSel = document.getElementById('sl-forecast-proj');
  if(projSel) {
    const curSelected = msValues('sl-forecast-proj');
    projSel.innerHTML = '';
    allProjects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = p;
      projSel.appendChild(opt);
    });
    Array.from(projSel.options).forEach(o => { if (curSelected.includes(o.value)) o.selected = true; });
    refreshMultiSelectUI('sl-forecast-proj');
  }
  const selProj = msValues('sl-forecast-proj');
  _forecastView = {
    months: forecast.months,
    rows: forecast.rows.filter(row => !selProj.length || selProj.includes(row.project)),
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
    <th style="${thS};text-align:left;min-width:70px">Plan</th>
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
        <td style="${tdS};text-align:left">${esc(row.plan || '—')}</td>
        <td style="${tdS};text-align:center"><span style="font-size:10px;background:${row.spendType === 'Infra' ? '#FAEEDA' : '#E6F1FB'};color:${row.spendType === 'Infra' ? '#633806' : '#0C447C'};padding:1px 6px;border-radius:3px">${esc(row.spendType)}</span></td>
        ${cells}
        <td style="${tdS};font-weight:600;color:var(--blue)">${money(Math.round(rowTotal))}</td>
      </tr>`;
    });

    // Subtotal row
    rows += `<tr style="background:var(--bg)">
      <td style="${subS};text-align:left" colspan="3">${esc(proj)} — Subtotal</td>
      <td style="${subS}"></td>
      ${projMonthTotals.map((v, mi) => `<td style="${months[mi].kind === 'forecast' ? subFS : subS}">${money(Math.round(v))}</td>`).join('')}
      <td style="${subS};color:var(--blue)">${money(Math.round(projTotal))}</td>
    </tr>
    <tr style="height:6px"><td colspan="${months.length+5}" style="background:var(--color-background-tertiary,#F4F3EF)"></td></tr>`;
  });

  body.innerHTML = rows || `<tr><td colspan="${months.length+5}" class="hist-empty">No records found. Try changing filters.</td></tr>`;
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
    ? `<tr><td colspan="5" class="hist-empty">No SL memos found for this month.</td></tr>`
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
  const currentYear = getCurrentBuddhistYear(); // Thai Buddhist year
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
    body.innerHTML = `<tr><td colspan="5" class="hist-empty">No records found for Budget vs Actual.</td></tr>`;
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
  if (!isPMO()) { alert('เฉพาะ PMO เท่านั้นที่เพิ่มหรือแก้ไข Manual Actual Spend ได้'); return; }
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
          <div style="font-size:15px;font-weight:700">${expense ? 'Edit' : 'Add'} Manual Actual Spend</div>
          <div style="font-size:11px;color:var(--text-3)">ใช้สำหรับ Memo หรือค่าใช้จ่ายก่อนเริ่มใช้งานระบบ</div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('manual-expense-modal').remove()">✕</button>
      </div>
      <input type="hidden" id="me-id" value="${esc(g('id'))}">
      <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:10px">
        <div class="fg"><label>Reference No</label>
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
        <div class="fg"><label>Spend Type *</label>
          <select id="me-type" class="ri">
            ${[['sl','Software License'],['hw','Hardware'],['int','Team Activity'],['ent','Client Expense'],['dep','Deployment'],['infra','Infrastructure'],['other','Other']].map(([v,l])=>`<option value="${v}" ${g('expenseType','sl')===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="fg"><label>Description *</label>
          <input id="me-description" class="ri" value="${esc(g('description'))}" placeholder="ชื่อ Software / อุปกรณ์ / รายการ">
        </div>
        <div class="fg"><label>Frequency *</label>
          <select id="me-frequency" class="ri" onchange="toggleManualExpenseSchedule()">
            <option value="one_time" ${g('frequency','one_time')==='one_time'?'selected':''}>One-time</option>
            <option value="monthly" ${g('frequency')==='monthly'?'selected':''}>Monthly</option>
          </select>
        </div>
        <div class="fg" id="me-date-wrap"><label>Expense Date *</label>
          <input id="me-date" class="ri" type="date" value="${esc(g('expenseDate',today))}">
        </div>
        <div class="fg" id="me-start-wrap"><label>Start Month *</label>
          <input id="me-start" class="ri" type="month" value="${esc(g('startMonth'))}" oninput="manualExpenseRecalculate()">
        </div>
        <div class="fg" id="me-end-wrap"><label>End Month *</label>
          <input id="me-end" class="ri" type="month" value="${esc(g('endMonth'))}" oninput="manualExpenseRecalculate()">
        </div>
        <div class="fg"><label id="me-amount-input-label">Amount (THB) *</label>
          <input id="me-amount-input" class="ri" type="number" min="0.01" step="0.01" value="${g('amount',0)}" oninput="manualExpenseRecalculate()">
        </div>
        <div class="fg"><label>Vendor / Program</label>
          <input id="me-vendor-program" class="ri" value="${esc(g('vendorProgram'))}" placeholder="Vendor or program name">
        </div>
      </div>
      <div id="me-monthly-preview" style="display:none;margin-top:10px;padding:10px 12px;background:var(--blue-50);border-radius:var(--r-sm)">
        <div style="font-size:12px;font-weight:600;color:var(--blue-800);margin-bottom:6px">Coverage</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">
          <div><span style="color:var(--text-3)">Coverage</span><br><strong id="me-coverage-months">0 months</strong></div>
          <div><span style="color:var(--text-3)">Monthly Amount</span><br><strong id="me-preview-monthly">${money(g('amount',0))}</strong></div>
          <div><span style="color:var(--text-3)">Estimated Total</span><br><strong id="me-preview-total">${money(0)}</strong></div>
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text-3)">Estimated Total = Monthly Amount × Inclusive Coverage Months</div>
      </div>
      <div class="fg" style="margin-top:10px"><label>Notes</label>
        <textarea id="me-notes" class="ri" rows="2" placeholder="เหตุผลหรือรายละเอียดเพิ่มเติม">${esc(g('notes'))}</textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
        <button class="btn-ghost" onclick="document.getElementById('manual-expense-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="saveManualExpenseFromModal()">💾 Save Actual Spend</button>
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
  const preview = document.getElementById('me-monthly-preview');
  if (dateWrap) dateWrap.style.display = monthly ? 'none' : '';
  if (startWrap) startWrap.style.display = monthly ? '' : 'none';
  if (endWrap) endWrap.style.display = monthly ? '' : 'none';
  if (preview) preview.style.display = monthly ? '' : 'none';
  manualExpenseRecalculate();
}

function manualExpenseAmountSummary(frequency, amount, startMonth, endMonth) {
  const enteredAmount = Number(amount) || 0;
  const coverageMonths = frequency === 'monthly' ? (inclusiveCoverageMonths(startMonth, endMonth) || 0) : 1;
  return { amount: enteredAmount, coverageMonths, total: enteredAmount * coverageMonths };
}

function manualExpenseRecalculate() {
  const frequency = document.getElementById('me-frequency')?.value || 'one_time';
  const summary = manualExpenseAmountSummary(
    frequency,
    document.getElementById('me-amount-input')?.value,
    document.getElementById('me-start')?.value,
    document.getElementById('me-end')?.value,
  );
  const labelEl = document.getElementById('me-amount-input-label');
  const monthsEl = document.getElementById('me-coverage-months');
  const monthlyEl = document.getElementById('me-preview-monthly');
  const totalEl = document.getElementById('me-preview-total');
  if (labelEl) labelEl.textContent = frequency === 'monthly' ? 'Monthly Amount (THB) *' : 'Amount (THB) *';
  if (monthsEl) monthsEl.textContent = `${summary.coverageMonths} month${summary.coverageMonths === 1 ? '' : 's'}`;
  if (monthlyEl) monthlyEl.textContent = money(summary.amount);
  if (totalEl) totalEl.textContent = money(summary.total);
  return summary;
}

async function saveManualExpenseFromModal() {
  if (!isPMO()) { alert('เฉพาะ PMO เท่านั้นที่บันทึกรายการได้'); return; }
  const get = id => document.getElementById(id)?.value?.trim() || '';
  const id = get('me-id') || `manual-${Date.now().toString(36).toUpperCase()}`;
  const frequency = get('me-frequency') || 'one_time';
  const referenceNo = get('me-reference');
  const amountSummary = manualExpenseRecalculate();
  const amount = amountSummary.amount;
  const existing = loadManualExpenses().find(e => e.id === id);
  const expense = {
    ...existing,
    id,
    entryKind: existing?.entryKind || 'historical',
    referenceNo,
    project: get('me-project'),
    budgetPoolId: get('me-pool') || null,
    expenseType: get('me-type') || 'other',
    description: get('me-description'),
    frequency,
    expenseDate: frequency === 'one_time' ? get('me-date') : null,
    startMonth: frequency === 'monthly' ? get('me-start') : null,
    endMonth: frequency === 'monthly' ? get('me-end') : null,
    quantity: 1,
    unitCost: amount,
    amount,
    vendorProgram: get('me-vendor-program'),
    notes: get('me-notes'),
    createdBy: existing?.createdBy || currentUser(),
    updatedBy: currentUser(),
  };
  if (!expense.project || !expense.description) { alert('กรุณากรอก Project และ Description'); return; }
  if (!(expense.amount > 0)) { alert('Amount ต้องมากกว่า 0'); return; }
  if (frequency === 'one_time' && !expense.expenseDate) { alert('กรุณาระบุ Expense Date'); return; }
  if (frequency === 'monthly' && (!expense.startMonth || !expense.endMonth || expense.startMonth > expense.endMonth)) {
    alert('กรุณาระบุ Start/End Month ให้ถูกต้อง'); return;
  }
  if (expense.budgetPoolId) {
    // Compare against the CANONICAL derived year (createBudgetPoolRecord), not the raw stored
    // pool.year — loadBudgetPools() returns raw, un-normalized objects, and a pool saved before
    // Phase 7A-3 (or otherwise mismatched) would have a raw year that disagrees with the year
    // mapping actually uses.
    const rawPool = loadBudgetPools().find(p => p.id === expense.budgetPoolId);
    const selectedPool = rawPool ? createBudgetPoolRecord(rawPool) : null;
    // Manual Override must match both project and year. A cross-project pool otherwise "saves"
    // but never appears in BvA (which groups by project/pool scope), so the amount looks silently
    // missing. Block before persisting rather than letting the invalid budget_pool_id through.
    if (selectedPool && selectedPool.project && selectedPool.project !== expense.project) {
      alert(`Budget Pool ที่เลือกอยู่คนละ Project กับรายการนี้ (Pool: ${selectedPool.project}, รายการ: ${expense.project})\nกรุณาเลือก Budget Pool ของ Project เดียวกับรายการ`);
      return;
    }
    const coverageDate = frequency === 'monthly' ? expense.startMonth : expense.expenseDate;
    const expenseYear = gregorianYearToBuddhistEra(coverageDate);
    if (selectedPool && expenseYear && String(selectedPool.year || '') !== expenseYear) {
      alert(`Budget Pool ที่เลือกอยู่คนละปีกับรายการนี้ (Pool ปี ${selectedPool.year || '-'}, รายการปี ${expenseYear})\nกรุณาเลือก Budget Pool ปีเดียวกับรายการ`);
      return;
    }
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
  if (!isPMO()) { alert('เฉพาะ PMO เท่านั้นที่ลบรายการได้'); return; }
  if (!confirm('การดำเนินการนี้จะลบรายการออกจากรายงาน แต่ยังคงประวัติ audit ไว้\nต้องการดำเนินการต่อหรือไม่?')) return;
  try {
    await voidManualExpenseAsync(id, 'Deleted from Manual Entries');
    document.getElementById('actual-manual-panel')?.remove();
    await renderActualSpend();
  } catch(e) { alert('ลบไม่สำเร็จ ไม่มีการเปลี่ยนแปลงใดๆ: ' + e.message); }
}

function manualEntryViewModel(expense) {
  const projected = manualExpenseToActualSpend(expense);
  const record = loadActualSpendRecords().find(item => item.id === projected.id) || projected;
  const pool = loadBudgetPools().find(item => item.id === record.finalBudgetPoolId);
  return {
    expense, record,
    referenceNo: expense.referenceNo || '—',
    schedule: expense.frequency === 'monthly' ? `${expense.startMonth || '—'} → ${expense.endMonth || '—'}` : (expense.expenseDate || '—'),
    frequencyLabel: expense.frequency === 'monthly' ? 'Monthly' : 'One-time',
    poolLabel: pool?.name || pool?.poolName || record.finalBudgetPoolId || '—',
  };
}

function formatActualSpendDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  // Milestone 2 Task 2.2 — business-facing timestamps display in Asia/Bangkok
  // regardless of the viewer's own browser timezone.
  const datePart = date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric', timeZone:'Asia/Bangkok' });
  const timePart = date.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Bangkok' });
  return `${datePart} ${timePart}`;
}

function renderManualEntries() {
  const container = document.getElementById('as-manual-content');
  if (!container) return;
  const value = id => document.getElementById(id)?.value || '';
  const search = value('as-manual-search').trim().toLowerCase();
  // Part 8 (UX consistency pass) — Project/Type/Budget Status are
  // multi-select filters; initMultiSelect() is idempotent and must run
  // before updateSelect() repopulates as-manual-project/-type's options.
  initMultiSelect('as-manual-project', 'All projects', 'Project');
  initMultiSelect('as-manual-type', 'All spend types', 'Type');
  initMultiSelect('as-manual-budget-status', 'All budget statuses', 'Budget Status');
  const selectedProject = msValues('as-manual-project');
  const selectedType = msValues('as-manual-type');
  const frequency = value('as-manual-frequency') || 'all';
  const from = value('as-manual-from');
  const to = value('as-manual-to');
  const budgetStatus = msValues('as-manual-budget-status');
  const active = activeManualExpenses();
  const updateSelect = (id, values, selected) => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = values.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join('');
    Array.from(select.options).forEach(o => { if (selected.includes(o.value)) o.selected = true; });
    refreshMultiSelectUI(id);
  };
  updateSelect('as-manual-project', [...new Set(active.map(item => item.project).filter(Boolean))].sort(), selectedProject);
  updateSelect('as-manual-type', [...new Set(active.map(item => manualExpenseToActualSpend(item).spendType))].sort(), selectedType);
  const rows = active.map(manualEntryViewModel).filter(({ expense, record }) => {
    const haystack = [expense.referenceNo, expense.description, expense.vendorProgram, expense.program, expense.notes].filter(Boolean).join(' ').toLowerCase();
    const start = String(expense.frequency === 'monthly' ? expense.startMonth : expense.expenseDate || '').slice(0, 7);
    const end = String(expense.frequency === 'monthly' ? expense.endMonth : expense.expenseDate || '').slice(0, 7);
    return (!search || haystack.includes(search))
      && (!selectedProject.length || selectedProject.includes(expense.project))
      && (!selectedType.length || selectedType.includes(record.spendType))
      && (frequency === 'all' || expense.frequency === frequency)
      && (!from || !end || end >= from) && (!to || !start || start <= to)
      && (!budgetStatus.length || budgetStatus.includes(record.budgetStatus));
  }).sort((a, b) => String(b.expense.updatedAt || b.expense.createdAt || '').localeCompare(String(a.expense.updatedAt || a.expense.createdAt || '')));
  if (!rows.length) { container.innerHTML = '<div class="card" style="padding:32px;text-align:center;color:var(--text-3)">No manual entries found</div>'; return; }
  // Updated At is intentionally not shown here (available via View Detail) to keep this dense
  // table scannable; Description is truncated with an ellipsis (full text via the `title` attr).
  container.innerHTML = `<div class="card" style="padding:0;overflow:auto"><table class="hist-table"><thead><tr><th style="width:10%">Reference No</th><th style="width:9%">Project</th><th style="width:8%">Spend Type</th><th style="width:20%">Description</th><th style="width:9%;text-align:right">Amount</th><th style="width:11%">Expense / Coverage Date</th><th style="width:9%">Budget Status</th><th style="width:24%;text-align:center">Actions</th></tr></thead><tbody>${rows.map(({ expense, record, referenceNo, schedule }) => `<tr><td style="font-weight:600">${esc(referenceNo)}</td><td>${esc(expense.project)}</td><td>${esc(record.spendType)}</td><td class="hist-cell-clip" title="${esc(expense.description)}">${esc(expense.description)}</td><td style="text-align:right;font-weight:600">${money(record.amount)}</td><td>${esc(schedule)}</td><td>${esc(record.budgetStatus)}</td><td style="text-align:center;white-space:nowrap"><button class="btn-sm" onclick="showManualEntryDetail('${esc(expense.id)}')">View Detail</button>${isPMO() ? ` <button class="btn-sm" onclick="openManualExpenseModal('${esc(expense.id)}')">Edit</button> <button class="btn-sm" style="color:var(--red)" onclick="voidManualExpense('${esc(expense.id)}')">Delete</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

// Follows the same header (reference + subject + badges) / grouped-section style as the All Memo
// "Memo Detail" modal (views/history.js _buildMemoDetailContent), minus an approval log — Actual
// Spend and Manual Entry records have no approval workflow of their own. `fields` keeps the exact
// same flat [label, value] list every caller already passed before this layout change, so every
// existing field is still rendered; this only changes how it is grouped and styled, not the data.
function showActualSpendDetailModal(title, fields, helper = '', details = '') {
  document.getElementById('actual-spend-record-detail')?.remove();
  const panel = document.createElement('div');
  panel.id = 'actual-spend-record-detail';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:310;display:flex;align-items:center;justify-content:center';

  const byLabel = label => fields.find(([fieldLabel]) => fieldLabel === label)?.[1];
  const reference = byLabel('Reference No');
  const subject = byLabel('Description');
  const project = byLabel('Project');
  const source = byLabel('Source');
  const status = byLabel('Budget Status');
  const badges = [
    source ? { label: actualSpendSourceShortLabel(source), className: actualSpendSourceBadgeClass(source) } : null,
    status ? { label: status, className: actualSpendBudgetStatusBadgeClass(status) } : null,
  ].filter(Boolean);
  // Reference No / Description / Source / Budget Status move into the header above; Project is
  // shown inline next to the badges. Everything else keeps its place below so no field is dropped,
  // only re-positioned for readability. The lower section is split into named groups (Spend
  // Details / Audit / Notes) separated by a thin rule instead of a filled grey box — a flat colour
  // panel around every group read as visual noise rather than useful separation.
  const headerLabels = ['Reference No', 'Description', 'Source', 'Budget Status', 'Project'];
  const auditLabels = ['Created By', 'Created Date', 'Updated At', 'Creation Method'];
  const notesValue = byLabel('Notes');
  const spendFields = fields.filter(([label]) => !headerLabels.includes(label) && !auditLabels.includes(label) && label !== 'Notes');
  const auditFields = fields.filter(([label]) => auditLabels.includes(label));
  const field = ([label, fieldValue]) => `<div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">${esc(label)}</div><div style="overflow-wrap:anywhere">${esc(fieldValue == null || fieldValue === '' ? '—' : fieldValue)}</div></div>`;
  const grid = list => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px 20px">${list.map(field).join('')}</div>`;
  const sectionLabel = text => `<div style="font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px">${esc(text)}</div>`;
  const divider = 'margin-top:18px;padding-top:14px;border-top:1px solid var(--border)';
  const bodyHtml = [
    spendFields.length ? `<div>${sectionLabel('Spend Details')}${grid(spendFields)}</div>` : '',
    auditFields.length ? `<div style="${divider}">${sectionLabel('Audit')}${grid(auditFields)}</div>` : '',
    notesValue !== undefined ? `<div style="${divider}">${sectionLabel('Notes')}<div style="overflow-wrap:anywhere;font-size:12px;line-height:1.5">${esc(notesValue == null || notesValue === '' ? '—' : notesValue)}</div></div>` : '',
  ].filter(Boolean).join('');

  panel.innerHTML = `<div class="card" style="width:720px;max-width:95vw;max-height:86vh;overflow:auto;padding:0">
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div style="min-width:0">
        <div style="font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">${esc(title)}</div>
        ${reference ? `<div style="font-size:15px;font-weight:600;overflow-wrap:anywhere">${esc(reference)}</div>` : ''}
        ${subject ? `<div style="font-size:12px;color:var(--text-2);margin-top:2px;overflow-wrap:anywhere">${esc(subject)}</div>` : ''}
        ${badges.length || project ? `<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:6px">${badges.map(b => `<span class="badge ${b.className}">${esc(b.label)}</span>`).join('')}${project ? `<span style="font-size:11px;color:var(--text-2)">${esc(project)}</span>` : ''}</div>` : ''}
      </div>
      <button class="btn-sm" onclick="document.getElementById('actual-spend-record-detail').remove()" style="flex-shrink:0">✕</button>
    </div>
    ${helper ? `<div style="margin:12px 16px 0;padding:9px 11px;background:var(--blue-50);color:var(--blue);border-radius:var(--r-sm);font-size:11px">${esc(helper)}</div>` : ''}
    <div style="padding:16px">${bodyHtml}</div>
    ${details}
  </div>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', event => { if (event.target === panel) panel.remove(); });
}

// Shared Actual Spend source badge helpers (Phase 7A-5 scope item 6) — used wherever a record's
// `source` is displayed, so Approved Memo / Manual-Historical / Infra Cost are always visually
// distinguished the same way. Does not change the stored source value, only its presentation.
function actualSpendSourceShortLabel(source) {
  return source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO ? 'Memo'
    : source === ACTUAL_SPEND_SOURCES.INFRA_COST ? 'Infra' : 'Historical';
}
function actualSpendSourceBadgeClass(source) {
  if (source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO) return 'badge-blue';
  if (source === ACTUAL_SPEND_SOURCES.INFRA_COST) return 'badge-green';
  return 'badge-amber';
}
function actualSpendBudgetStatusBadgeClass(status) {
  if (status === BUDGET_STATUSES.MAPPED) return 'badge-green';
  if (status === BUDGET_STATUSES.MANUAL_OVERRIDE) return 'badge-purple';
  if (status === BUDGET_STATUSES.NEEDS_PMO_REVIEW) return 'badge-amber';
  return 'badge-gray';
}

function softwareActualSpendDetails(record) {
  if (record?.source !== ACTUAL_SPEND_SOURCES.APPROVED_MEMO || record.spendType !== SPEND_TYPES.SOFTWARE || !record.detailLines?.length) return '';
  const subtotal = record.detailLines.reduce((sum, line) => sum + (Number(line.lineAmount) || 0), 0);
  const differs = Math.abs(subtotal - (Number(record.amount) || 0)) > 0.005;
  const field = (label, value, format = value => value) => `<div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">${esc(label)}</div><div style="overflow-wrap:anywhere">${esc(value == null || value === '' ? '—' : format(value))}</div></div>`;
  return `<div style="padding:0 16px 16px"><div style="padding-top:14px;border-top:1px solid var(--border)"><strong>Software Details</strong><div style="font-size:11px;color:var(--text-3);margin-top:3px">Detail lines explain the parent amount and are not additional spend.</div></div><div style="display:flex;gap:16px;flex-wrap:wrap;padding:10px 0"><div><div style="font-size:10px;color:var(--text-3)">Parent Actual Spend Amount (Authoritative)</div><strong>${money(Number(record.amount) || 0)}</strong></div><div><div style="font-size:10px;color:var(--text-3)">Detail Subtotal (Informational Only)</div><strong>${money(subtotal)}</strong>${differs ? '<div style="font-size:10px;color:var(--amber);margin-top:2px">Differs from the authoritative parent amount</div>' : ''}</div></div><div style="display:flex;flex-direction:column;gap:8px">${record.detailLines.map(line => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:10px;padding:10px;border:1px solid var(--border);border-radius:var(--r-sm)">${field('Program', line.program)}${field('Plan', line.plan)}${field('Quantity', line.quantity)}${field('Unit Cost', line.unitCost, money)}${field('Monthly Cost', line.monthlyCost, money)}${field('Coverage Start', line.coverageStart)}${field('Coverage End', line.coverageEnd)}${field('Coverage Months', line.coverageMonths)}${field('Line Amount', line.lineAmount, money)}</div>`).join('')}</div></div>`;
}

// Manual Entry audit timeline (2026-07-03) — styled to match the Memo Detail "Audit Log" block
// (views/history.js, _buildMemoDetailContent()'s auditHtml) so the two look consistent: a bordered
// box of rows, each showing date, "actor — action", and an optional comment underneath.
// Real auditLog entries (written going forward by saveManualExpenseAsync()/voidManualExpenseAsync())
// are used when present. Records saved before this feature existed have no auditLog, so a minimal
// timeline is synthesized from their existing created/updated/voided fields instead of showing
// nothing.
function manualExpenseAuditTimeline(expense) {
  if (expense.auditLog && expense.auditLog.length) return expense.auditLog;
  const synthesized = [];
  if (expense.createdAt) synthesized.push({ action: 'Created', actor: expense.createdBy || '—', timestamp: expense.createdAt });
  if (expense.updatedAt && expense.updatedAt !== expense.createdAt) {
    synthesized.push({ action: 'Edited', actor: expense.updatedBy || '—', timestamp: expense.updatedAt });
  }
  if (expense.voidedAt) {
    synthesized.push({ action: 'Voided', actor: expense.voidedBy || '—', comment: expense.voidReason || '', timestamp: expense.voidedAt });
  }
  return synthesized;
}
function manualExpenseAuditTimelineHtml(expense) {
  const entries = [...manualExpenseAuditTimeline(expense)].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const rows = entries.length
    ? entries.map(e => `
        <div style="display:flex;gap:12px;padding:7px 0;border-bottom:0.5px solid var(--border)">
          <div style="font-size:11px;color:var(--text-3);white-space:nowrap;min-width:90px">${esc(formatActualSpendDateTime(e.timestamp))}</div>
          <div style="font-size:12px;color:var(--text-2)">
            <span style="font-weight:500;color:var(--text-1)">${esc(e.actor || '—')}</span> — ${esc(e.action)}
            ${e.comment ? `<div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc(e.comment)}</div>` : ''}
          </div>
        </div>`).join('')
    : `<div style="font-size:12px;color:var(--text-3);padding:8px 0">ยังไม่มีประวัติ</div>`;
  return `<div style="padding:0 16px 16px"><div style="padding-top:14px;border-top:1px solid var(--border)">
    <div style="font-size:9px;font-weight:500;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">Audit Timeline</div>
    <div style="border:0.5px solid var(--border);border-radius:var(--r-sm,4px);padding:0 12px">${rows}</div>
  </div></div>`;
}

function showManualEntryDetail(id) {
  const expense = activeManualExpenses().find(item => item.id === id);
  if (!expense) return;
  const { record, referenceNo, schedule, frequencyLabel, poolLabel } = manualEntryViewModel(expense);
  showActualSpendDetailModal('Manual Entry Detail', [
    ['Reference No', referenceNo], ['Project', expense.project], ['Spend Type', record.spendType],
    ['Description', expense.description], ['Amount', money(record.amount)], ['Frequency', frequencyLabel],
    ['Expense Date / Coverage', schedule], ['Vendor / Program', expense.vendorProgram || expense.program || expense.notes || '—'],
    ['Budget Pool', poolLabel], ['Budget Status', record.budgetStatus], ['Created By', expense.createdBy || '—'],
    ['Created Date', formatActualSpendDateTime(expense.createdAt)], ['Updated At', formatActualSpendDateTime(expense.updatedAt)],
    ['Notes', expense.notes || '—'], ['Creation Method', expense.entryKind || '—'],
  ], '', manualExpenseAuditTimelineHtml(expense));
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
  if (_actualSpendCurrentTab === 'manual') renderManualEntries();

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
    // Phase 7A-9B: label displays Buddhist Era; `value` stays Gregorian since
    // actualSpendRecordInYear()/filteredActualSpendRecords() compare it against record.startDate's
    // Gregorian year — only the visible text changes, same pattern as populateBudgetYearSelect().
    yearSel.innerHTML = years.map(year => `<option value="${year}">ปี ${gregorianYearToBuddhistEra(year)}</option>`).join('');
    yearSel.value = years.includes(current) ? current : years[0];
  }

  // Part 8 (UX consistency pass): Project is a multi-select filter.
  initMultiSelect('as-project', 'ทุกโปรเจค', 'Project');
  initMultiSelect('as-type', 'ทุกประเภท', 'Type');
  initMultiSelect('as-budget-status', 'ทุก Budget Status', 'Budget Status');
  const projSel = document.getElementById('as-project');
  if (projSel) {
    const curSelected = msValues('as-project');
    const projs = [...new Set(canonical.map(record => record.project).filter(Boolean))].sort();
    projSel.innerHTML = '';
    projs.forEach(p => { const o = document.createElement('option'); o.value = o.textContent = p; projSel.appendChild(o); });
    Array.from(projSel.options).forEach(o => { if (curSelected.includes(o.value)) o.selected = true; });
    refreshMultiSelectUI('as-project');
  }

  // Display-only (Phase 7A-9B): every use below is a label, never a filter value, so it's safe to
  // show Buddhist Era here even though the underlying `as-year` <option value> stays Gregorian.
  const selectedYear = gregorianYearToBuddhistEra(yearSel?.value || String(new Date().getFullYear()));
  const labelEl = document.getElementById('as-period-label');
  if (labelEl) labelEl.textContent = fromVal && toVal ? `ปี ${selectedYear} · ${fromVal} – ${toVal}` : fromVal ? `ปี ${selectedYear} · ตั้งแต่ ${fromVal}` : toVal ? `ปี ${selectedYear} · ถึง ${toVal}` : `แสดงข้อมูลปี ${selectedYear}`;

  const records = filteredActualSpendRecords(canonical);
  if (!records.length) {
    container.innerHTML = `<div class="card hist-empty">No records found for the selected period.</div>`;
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
        <table class="hist-table"><thead><tr><th>Type</th><th>Source</th><th style="text-align:right">Amount</th><th style="text-align:right">รายการ</th><th style="text-align:right">% ของ Project</th></tr></thead>
        <tbody>${Object.values(groups).sort((a,b)=>b.amount-a.amount).map(group => `<tr style="cursor:pointer" onclick="showActualSpendGroup('${encodeURIComponent(project)}','${encodeURIComponent(group.spendType)}','${encodeURIComponent(group.source)}')">
          <td style="${tdS}"><span style="padding:2px 8px;border-radius:4px;background:var(--bg)">${esc(group.spendType)}</span></td><td style="${tdS}"><span class="badge ${actualSpendSourceBadgeClass(group.source)}">${actualSpendSourceShortLabel(group.source)}</span></td>
          <td style="${tdS};text-align:right;font-weight:600">${money(Math.round(group.amount))}</td><td style="${tdS};text-align:right;color:var(--blue)">${group.records.length} <span style="color:var(--text-3)">รายการ →</span></td><td style="${tdS};text-align:right">${percentLabel(group.amount, projectTotal)}</td></tr>`).join('')}</tbody></table></div>`;
    }).join('')}`;
}

function showActualSpendGroup(projectEncoded, typeEncoded, sourceEncoded) {
  const project = decodeURIComponent(projectEncoded);
  const spendType = decodeURIComponent(typeEncoded);
  const source = decodeURIComponent(sourceEncoded);
  const rows = filteredActualSpendRecords().filter(record => record.project === project && record.spendType === spendType && record.source === source);
  const rowCard = record => {
    return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer;align-items:start" onclick="document.getElementById('actual-spend-group-panel').remove();showActualSpendRecord('${esc(record.id)}')"><div style="min-width:0"><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Reference No</div><div style="font-weight:600;color:var(--blue);overflow-wrap:anywhere">${esc(record.referenceNo || '—')}</div></div><div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Source</div><span class="badge ${actualSpendSourceBadgeClass(record.source)}">${actualSpendSourceShortLabel(record.source)}</span></div><div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Coverage</div><div>${esc(record.startDate||'—')} → ${esc(record.endDate||'—')}</div></div><div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Budget Status</div><div>${esc(record.budgetStatus)}</div></div><div><div style="font-size:10px;color:var(--text-3);margin-bottom:3px">Amount</div><div style="font-weight:700">${money(record.amount)}</div></div></div>`;
  };
  const panel = document.createElement('div');
  panel.id = 'actual-spend-group-panel';
  panel.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:center;justify-content:center';
  panel.innerHTML = `<div class="card" style="width:900px;max-width:96vw;max-height:86vh;overflow-x:hidden;overflow-y:auto;padding:0"><div style="padding:12px 16px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);z-index:1"><div><strong>${esc(project)} · ${esc(spendType)}</strong><div style="font-size:11px;color:var(--text-3)">${rows.length} รายการ · ${money(calculateActualSpend(rows))}</div></div><button class="btn-sm" onclick="document.getElementById('actual-spend-group-panel').remove()">✕</button></div><div style="padding:10px;display:flex;flex-direction:column;gap:8px">${rows.map(rowCard).join('')}</div></div>`;
  document.body.appendChild(panel);
  panel.addEventListener('click', event => { if (event.target === panel) panel.remove(); });
}

function showActualSpendRecord(id) {
  const record = loadActualSpendRecords().find(item => item.id === id);
  if (!record) return;
  const helper = record.source === ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE ? 'To modify this record, go to Actual Spend → Manual Entries.' : '';
  const poolId = getFinalBudgetPoolId(record);
  const pool = loadBudgetPools().find(item => item.id === poolId);
  const poolLabel = pool?.name || pool?.poolName || poolId || '—';
  showActualSpendDetailModal('Actual Spend Detail', [
    ['Reference No', record.referenceNo || '—'], ['Source', record.source], ['Project', record.project],
    ['Spend Type', record.spendType], ['Description', record.description || '—'], ['Amount', money(record.amount)],
    ['Coverage', `${record.startDate || '—'} → ${record.endDate || '—'}`], ['Vendor / Program', record.vendorProgram || '—'],
    ['Budget Pool', poolLabel], ['Budget Status', record.budgetStatus || '—'], ['Created By', record.createdBy || '—'],
    ['Created Date', formatActualSpendDateTime(record.createdAt)], ['Updated At', formatActualSpendDateTime(record.updatedAt)], ['Notes', record.notes || '—'],
  ], helper, softwareActualSpendDetails(record));
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
          <th>Memo No.</th>
          <th>วันที่</th>
          <th>รายการ</th>
          <th style="text-align:right">Amount</th>
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
          <th>Reference</th>
          <th>รายการ</th>
          <th>ช่วงเวลา</th>
          <th style="text-align:right">Amount</th>
          <th style="text-align:center">Actions</th>
        </tr></thead>
        <tbody>
          ${rows.map(e => {
            const schedule = e.frequency === 'monthly' ? `${e.startMonth} → ${e.endMonth}` : (e.expenseDate || '—');
            const amount = manualExpenseAmountInRange(e);
            return `<tr>
              <td style="${tdS};color:var(--amber);font-weight:500">${esc(e.referenceNo || '—')}</td>
              <td style="${tdS}">${esc(e.description)}${e.notes ? `<div style="font-size:10px;color:var(--text-3)">${esc(e.notes)}</div>` : ''}</td>
              <td style="${tdS};color:var(--text-3)">${esc(schedule)}</td>
              <td style="${tdS};text-align:right;font-weight:500">${money(Math.round(amount))}</td>
              <td style="${tdS};text-align:center;white-space:nowrap"><span style="font-size:10px;color:var(--text-3)">View only</span></td>
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
async function savePoolAsync(rawPool, opts = {}) {
  // Phase 7A-9A: savePoolAsync() is the single Budget Pool write path (manual save and bulk
  // import both call it) — canonicalize here so startMonth/endMonth/year can never be persisted
  // out of sync with each other, regardless of what the caller computed.
  const pool = createBudgetPoolRecord(rawPool);
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
        created_at:  pool.createdAt,
        updated_at:  pool.updatedAt,
        // Milestone 2 Task 2.3 — Created By / Updated By metadata. The
        // in-memory record (createBudgetPoolRecord() above) already computes
        // these correctly; this was the one place that dropped them before
        // reaching Supabase.
        created_by:  pool.createdBy || null,
        updated_by:  pool.updatedBy || null,
      }, '?on_conflict=id');
    } catch(e) { console.warn('Pool save failed', e.message); }
  }
  // Phase 7A-9C: bulk import saves many pools in a row and remaps once itself afterward — skip the
  // per-row remap here so an N-pool import doesn't trigger N full Actual Spend remaps. Manual
  // add/edit (saveBudgetTag / saveBudgetPool) never pass this, so their behavior is unchanged.
  if (!opts.skipRemap) remapActualSpendForBudgetPools();
}
async function deletePoolAsync(id) {
  storeBudgetPools(loadBudgetPools().filter(p => p.id !== id));
  _poolCache = null;
  if (await checkSupa()) {
    try { await supaFetch('budget_pools', 'DELETE', null, '?id=eq.' + encodeURIComponent(id)); } catch(e) {}
  }
  remapActualSpendForBudgetPools();
}

function remapActualSpendForBudgetPools() {
  const pools = loadBudgetPools().map(createBudgetPoolRecord);
  const records = loadActualSpendRecords();
  if (records.length) storeActualSpendRecords(mapActualSpendRecords(records, pools));
}

// Phase 7A-9C (TD-7A-02): matchMemoToPool(), autoTagBudgetPool(), getPoolMemos(), and
// getPoolActual() were a second, parallel memo→pool matching implementation (narrowest-pool-wins
// tie-break, no pool.year check) that disagreed with the canonical findMatchingBudgetPools()/
// mapBudgetPool() (app.js) on ambiguous multi-match handling. Removed after confirming zero
// remaining callers: autoTagBudgetPool() and getPoolMemos()/getPoolActual() had none at all; Tag
// Budget (views/history.js openBudgetTagModal()) now reads the canonical Actual Spend record's
// autoBudgetPoolId/finalBudgetPoolId via getFinalBudgetPoolId() instead of recomputing a match.

// ══════════════════════════════════════════
// TAB: BUDGET VS ACTUAL
// ══════════════════════════════════════════
let _bvaDataset = null;
// 'summary' (default Budget vs Actual report) or 'assignment' (Budget Assignment Workspace,
// Phase 7A-7). A view flag rather than a new `_bgtCurrentTab` value/top-level tab, since
// MASTER_SPEC.md fixes Budget & Spend at exactly five tabs — this is a sub-view within "bva".
let _bvaCurrentView = 'summary';

function renderBudgetVsActual() {
  // Only show a loading placeholder on first mount (empty container), never on a filter-driven
  // re-render — the pool cache usually resolves fast enough that re-showing it on every keystroke/
  // dropdown change would just flicker. Reuses the same "card" empty-state look already used below
  // instead of introducing a new spinner pattern.
  const container = document.getElementById('bva-content');
  if (container && !container.innerHTML.trim()) {
    container.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:var(--text-3);font-size:12px">Loading…</div>`;
  }
  return loadBudgetPoolsAsync().then(_renderBvaWith).catch(() => _renderBvaWith(loadBudgetPools()));
}

function showBudgetAssignmentWorkspace() {
  _bvaCurrentView = 'assignment';
  return renderBudgetVsActual();
}

function closeBudgetAssignmentWorkspace() {
  _bvaCurrentView = 'summary';
  return renderBudgetVsActual();
}

// Shared BE year options for the Budget Pool year selects (`bva-year`, `bset-year`). Replaces the
// two independently hardcoded 2568/2569/2570 option lists that used to live in index.html — those
// would have silently run out of "current year" past BE 2570 (Phase 7A-9A, closing
// docs/BvA_REQUIREMENT.md "Phase 7A-1" §2 Known Issue #2 at the UI layer). Populated once per page
// load (guarded by an empty `<select>`), not re-derived on every render.
// `extraYear` (Phase 7A-9B): when provided, guarantees that year is present in the option list and
// pre-selected, even if it falls outside the current±1 range — needed so the Budget Pool Add/Edit
// modal's now-selectable Budget Year always shows an existing pool's own (possibly older/newer)
// year instead of silently defaulting to the nearest option and changing the pool's year on save.
function populateBudgetYearSelect(id, extraYear) {
  const el = document.getElementById(id);
  if (!el || el.options.length) return;
  const current = Number(getCurrentBuddhistYear());
  const selected = extraYear ? Number(extraYear) : current;
  const years = new Set([current - 1, current, current + 1, selected]);
  const sorted = [...years].sort((a, b) => a - b);
  el.innerHTML = sorted.map(y => `<option value="${y}" ${y === selected ? 'selected' : ''}>${y}</option>`).join('');
}

// Phase 7A-9B: populates a Start/End Month select with the 12 Thai month names (value = 1-12).
// Always re-renders (unlike populateBudgetYearSelect()'s "populate once" guard) since the Budget
// Pool modal deliberately resets these when Budget Year changes (see _onBpoolYearChange()).
function populateMonthSelect(id, selectedMonth) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = MONTHS_TH.map((name, i) => `<option value="${i + 1}" ${i + 1 === selectedMonth ? 'selected' : ''}>${esc(name)}</option>`).join('');
}

// BvA search (`bva-search`) previously called _renderBvaWith() directly on every keystroke, which
// re-runs reconcileActualSpendSources()'s full remap (O(records × pools)) on every character typed.
// Debounce so a full re-render only fires once typing pauses; the year/project/type dropdowns are
// discrete onchange events (not per-keystroke) so they don't need this. Final rendered result is
// unaffected — only the timing of when it happens changes.
let _bvaSearchDebounceTimer = null;
function bvaSearchDebounced() {
  clearTimeout(_bvaSearchDebounceTimer);
  _bvaSearchDebounceTimer = setTimeout(() => _renderBvaWith(loadBudgetPools()), 250);
}

function _renderBvaWith(pools) {
  populateBudgetYearSelect('bva-year');
  const yearVal   = document.getElementById('bva-year')?.value || getCurrentBuddhistYear();
  const projVal   = document.getElementById('bva-project')?.value || 'all';
  const typeVal   = document.getElementById('bva-type')?.value || 'all';
  const searchVal = document.getElementById('bva-search')?.value || '';
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

  // Spend Type filter reuses the same short-code options (sl/hw/int/ent/dep/infra/other) and the
  // same spendTypeFromMemoType() conversion as the Actual Spend tab's `as-type` filter
  // (filteredActualSpendRecords()) — one filtering rule, not a second one, per the identical-
  // filtering-rules requirement for this phase.
  _bvaDataset = calculateBudgetVsActualDataset(canonicalPools, canonical, {
    year: yearVal,
    project: projVal === 'all' ? '' : projVal,
    spendType: typeVal === 'all' ? '' : spendTypeFromMemoType(typeVal),
    search: searchVal,
  });
  const { rows, unbudgetedRecords, needsReviewRecords, totals } = _bvaDataset;
  const alertEl = document.getElementById('bva-untagged-alert');
  if (alertEl) {
    const flagParts = [];
    if (unbudgetedRecords.length) flagParts.push(`${unbudgetedRecords.length} Unbudgeted`);
    if (needsReviewRecords.length) flagParts.push(`${needsReviewRecords.length} Needs PMO Review`);
    alertEl.style.display = flagParts.length ? '' : 'none';
    alertEl.textContent = flagParts.length ? `⚠ ${flagParts.join(' · ')} Actual Spend items` : '';
  }

  // Budget Assignment Workspace (Phase 7A-7): a dedicated in-page view, not a modal, for
  // reviewing/assigning Unbudgeted and Needs PMO Review records. Rendered before the "no Budget
  // Pool yet" empty-state check below, since the workspace is exactly for records with no pool.
  if (_bvaCurrentView === 'assignment') {
    container.innerHTML = renderBudgetAssignmentWorkspace(_bvaDataset);
    return;
  }

  // needsReviewRecords must be checked too — a filter combination can leave zero pool rows and
  // zero Unbudgeted records while still having Needs PMO Review items, which must never be masked
  // by the "no Budget Pool" empty state (Part 3: totals/sections must reflect the same dataset).
  if (!rows.length && !unbudgetedRecords.length && !needsReviewRecords.length) {
    const hasPoolsForYear = canonicalPools.some(p => String(p.year || '') === String(yearVal));
    const filtersActive = projVal !== 'all' || typeVal !== 'all' || !!searchVal.trim();
    container.innerHTML = (hasPoolsForYear && filtersActive) ? `
      <div class="card" style="padding:32px;text-align:center">
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px">No records found. Try changing filters.</div>
        <div style="font-size:12px;color:var(--text-3)">Try clearing the Project, Type, or search filters above.</div>
      </div>` : `
      <div class="card" style="padding:32px;text-align:center">
        <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px">No budget pools found for ${yearVal}.</div>
        <div style="font-size:12px;color:var(--text-3);margin-bottom:16px">Go to Settings → Budget Pools to set a budget first.</div>
        <button class="btn-primary" onclick="switchBudgetTab('bgt-settings')" style="font-size:12px">Go to Settings →</button>
      </div>`;
    return;
  }

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
      <div class="card" id="bva-unbudgeted-section" style="padding:0;overflow:hidden;margin-bottom:12px;border-color:var(--amber)">
        <div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;background:var(--amber-50,#FFFBEB)">
          <strong style="color:var(--amber)">Unbudgeted Actual Spend (${unbudgetedRecords.length} items)</strong>
          <div style="display:flex;align-items:center;gap:10px">
            <strong style="color:var(--amber)">${money(Math.round(totals.unbudgetedActual))}</strong>
            <button class="btn-sm" onclick="showBudgetAssignmentWorkspace()">View items →</button>
          </div>
        </div>
      </div>` : ''}
    ${needsReviewRecords.length ? `
      <div class="card" id="bva-needs-review-section" style="padding:0;overflow:hidden;margin-bottom:12px;border-color:var(--amber)">
        <div style="padding:12px 14px;display:flex;justify-content:space-between;align-items:center;background:var(--amber-50,#FFFBEB)">
          <strong style="color:var(--amber)">Needs PMO Review (${needsReviewRecords.length} items)</strong>
          <div style="display:flex;align-items:center;gap:10px">
            <strong style="color:var(--amber)">${money(Math.round(totals.needsReviewActual))}</strong>
            <button class="btn-sm" onclick="showBudgetAssignmentWorkspace()">View items →</button>
          </div>
        </div>
      </div>` : ''}
    ${[...byProj.entries()].map(([proj, projectRows]) => `
      <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
        <div style="padding:10px 14px;background:var(--bg);font-size:13px;font-weight:600;border-bottom:1px solid var(--border)">${esc(proj)}</div>
        <table class="hist-table">
          <thead><tr>
            <th>Pool</th>
            <th>Memo Types</th>
            <th>ช่วงเวลา</th>
            <th class="hist-amt">Budget (฿)</th>
            <th class="hist-amt">Actual (฿)</th>
            <th class="hist-amt">Remaining</th>
            <th>Utilization</th>
          </tr></thead>
          <tbody>
            ${projectRows.map(row => {
              const pool = row.pool;
              const rowPct = row.utilizationPercent;
              const color = rowPct > 100 ? 'var(--red)' : rowPct >= 90 ? 'var(--amber)' : 'var(--green)';
              const typeLabels = (pool.memoTypes || []).map(t => BGT_TYPE_LABELS[t] || t).join(', ') || 'ทุกประเภท';
              return `<tr style="cursor:${row.records.length ? 'pointer' : 'default'}" onclick="${row.records.length ? `showBvaActualSpend('${pool.id}')` : ''}">
                <td style="font-weight:500">${esc(pool.name)}</td>
                <td style="font-size:11px;color:var(--blue)">${esc(typeLabels)}</td>
                <td style="color:var(--text-3);font-size:11px">${formatMonthBE(pool.startMonth) || '—'} → ${formatMonthBE(pool.endMonth) || '—'}</td>
                <td class="hist-amt">${money(pool.budget || 0)}</td>
                <td class="hist-amt" style="color:var(--blue);font-weight:500">
                  ${money(Math.round(row.actual))}
                  ${row.records.length ? `<span style="font-size:10px;color:var(--text-3);margin-left:4px">(${row.records.length} items)</span>` : ''}
                </td>
                <td class="hist-amt" style="color:${row.remaining >= 0 ? 'var(--green)' : 'var(--red)'};font-weight:500">
                  ${row.remaining >= 0 ? '' : '-'}${money(Math.abs(Math.round(row.remaining)))}
                </td>
                <td>
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

// Reference/memo detail opened from a BvA context (Budget Pool drill-down modal or the Budget
// Assignment Workspace) must use the Actual Spend-style detail (showActualSpendRecord()), not the
// All Memo approval/history detail (openMemoReadOnly()) — here the user is reviewing Actual Spend
// budget assignment, not a memo's approval history (Phase 7A-7 follow-up, Part 3). This also closes
// any open BvA drill-down modal first, so opening a reference from it never stacks two modals/
// backdrops (Part 1) — a no-op when called from the in-page workspace, which has no such modal.
function showBvaRecordDetail(recordId) {
  document.getElementById('bva-memo-panel')?.remove();
  showActualSpendRecord(recordId);
}

// Shared one-row-per-record, single-line table used by every BvA / Budget Pool drill-down view —
// the in-page Unbudgeted and Needs PMO Review sections in _renderBvaWith(), and the "all"/per-pool
// modal in showBvaActualSpend(). `table-layout:fixed` plus per-cell text-overflow:ellipsis keeps
// every record on exactly one line and never needs horizontal scroll, regardless of how long a
// Reference/Project value is (the full value is still available via the `title` tooltip).
function actualSpendRowsTable(records) {
  if (!records.length) return `<div class="hist-empty">No records found.</div>`;
  const referenceCell = record => {
    const ref = esc(record.referenceNo || '—');
    if (record.source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO && record.referenceNo) {
      return `<span style="color:var(--blue);font-weight:600;text-decoration:underline;cursor:pointer" onclick="showBvaRecordDetail('${esc(record.id)}')">${ref}</span>`;
    }
    return `<span style="font-weight:600">${ref}</span>`;
  };
  const rows = [...records].sort((a,b) => String(b.startDate||'').localeCompare(String(a.startDate||'')));
  // Reuses the same shared `.hist-table` class as the Budget Pool table and every other list table
  // in the app (padding, header style, row hover), plus the `.hist-table--ellipsis` modifier for
  // this table's single-line-per-record requirement, instead of re-declaring the same padding/
  // border/hover styling inline a third time.
  return `<table class="hist-table hist-table--ellipsis">
    <colgroup><col style="width:30%"><col style="width:14%"><col style="width:20%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr>
      <th>Reference</th><th>Source</th><th>Project</th>
      <th>Spend Type</th><th class="hist-amt">Amount</th>
    </tr></thead>
    <tbody>${rows.map(record => `<tr>
      <td title="${esc(record.referenceNo || '—')}">${referenceCell(record)}</td>
      <td><span class="badge ${actualSpendSourceBadgeClass(record.source)}">${actualSpendSourceShortLabel(record.source)}</span></td>
      <td title="${esc(record.project || '')}">${esc(record.project || '—')}</td>
      <td title="${esc(record.spendType || '')}">${esc(record.spendType || '—')}</td>
      <td class="hist-amt" style="font-weight:600">${money(Number(record.amount)||0)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// ══════════════════════════════════════════
// BUDGET ASSIGNMENT WORKSPACE (Phase 7A-7)
// ══════════════════════════════════════════
// A dedicated in-page sub-view of the Budget vs Actual tab (toggled by _bvaCurrentView, not a new
// top-level tab — MASTER_SPEC.md fixes Budget & Spend at exactly five tabs) for reviewing and
// assigning a Budget Pool to Unbudgeted / Needs PMO Review records. Deliberately does not
// reimplement mapping: every assignment action reuses the existing, already-validated canonical
// paths (openBudgetTagModal()/saveBudgetTag() for Approved Memo, openManualExpenseModal()/
// saveManualExpenseFromModal() for Manual Actual Spend) instead of a new pool-picker or algorithm.

// Human-readable reason a record needs PMO action — informational only, derived entirely from
// fields the canonical mapping (mapBudgetPool()) already computed; invents no new business rule.
function actualSpendAssignmentReason(record) {
  if (record.mappingWarning === 'blocked-cross-year-override') return 'Blocked: selected pool is a different year';
  if (record.mappingWarning === 'blocked-cross-project-override') return 'Blocked: selected pool is a different project';
  if (record.budgetStatus === BUDGET_STATUSES.NEEDS_PMO_REVIEW) return 'Multiple Budget Pools match — needs PMO decision';
  if (record.source === ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE) return 'Manual Actual Spend has no assigned Budget Pool';
  return 'No matching Budget Pool';
}

// Dispatches to the existing, already-validated assignment path for the record's source. Does not
// duplicate mapBudgetPool()'s project/year/spend-type rules — those existing paths already enforce
// them (block + alert + no persist on an invalid pool) exactly as required by this phase's Part 3.
function assignBudgetPoolFromWorkspace(recordId) {
  const record = loadActualSpendRecords().find(r => r.id === recordId);
  if (!record) return;
  if (record.source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO) {
    if (!record.memoId) { alert('ไม่พบ Memo ที่เกี่ยวข้องกับรายการนี้'); return; }
    // openBudgetTagModal()/saveBudgetTag() (views/history.js) is the existing Tag Budget path,
    // already used from All Memo — reuse it as-is instead of a new pool-picker.
    if (typeof openBudgetTagModal === 'function') openBudgetTagModal(record.memoId);
    // saveBudgetTag()'s own onclick (wired by openBudgetTagModal() above) already persists via the
    // canonical override path; add a workspace refresh on top of it, mirroring the Manual Expense
    // branch below. closeBudgetTagModal() hides (not removes) the modal only on a successful save —
    // a validation failure (e.g. cross-project/cross-year block) returns early and leaves it open —
    // so checking for display:'none' afterward reliably means the save went through.
    const tagSaveBtn = document.getElementById('btm-save-btn');
    if (tagSaveBtn) {
      const originalOnclick = tagSaveBtn.onclick;
      tagSaveBtn.onclick = () => {
        if (typeof originalOnclick === 'function') originalOnclick();
        const tagModal = document.getElementById('budget-tag-modal');
        if (tagModal && tagModal.style.display === 'none') renderBudgetVsActual();
      };
    }
    return;
  }
  if (record.source === ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE) {
    const expenseId = String(record.id).slice('actual-spend-manual-'.length);
    openManualExpenseModal(expenseId); // existing Manual Actual Spend edit modal
    // saveManualExpenseFromModal()'s own onclick already persists via the canonical manual
    // expense path; only add a workspace refresh on top of it (it only removes the modal on a
    // successful save, so absence of the modal afterward reliably means the save went through).
    const saveBtn = document.querySelector('#manual-expense-modal .btn-primary');
    if (saveBtn) saveBtn.onclick = async () => {
      await saveManualExpenseFromModal();
      if (!document.getElementById('manual-expense-modal')) renderBudgetVsActual();
    };
    return;
  }
  // Infra Cost: the Infra Cost persistence model has no Budget Pool field to assign today. Do not
  // invent a new storage model for it — surface this clearly instead of silently doing nothing.
  alert('Infra Cost ยังไม่รองรับการ assign Budget Pool จากหน้านี้ — โปรดติดต่อ PMO เพื่อจัดการโดยตรงใน Budget Pool');
}

function budgetAssignmentRowsTable(records) {
  if (!records.length) return `<div class="hist-empty">No records need assignment.</div>`;
  const referenceCell = record => {
    const ref = esc(record.referenceNo || '—');
    if (record.source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO && record.referenceNo) {
      return `<span style="color:var(--blue);font-weight:600;text-decoration:underline;cursor:pointer" onclick="showBvaRecordDetail('${esc(record.id)}')">${ref}</span>`;
    }
    return `<span style="font-weight:600">${ref}</span>`;
  };
  const actionCell = record => {
    if (record.source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO || record.source === ACTUAL_SPEND_SOURCES.MANUAL_EXPENSE) {
      return `<button class="btn-sm" onclick="assignBudgetPoolFromWorkspace('${esc(record.id)}')">Assign</button>`;
    }
    return `<span style="font-size:11px;color:var(--text-3)" title="Infra Cost Budget Pool assignment is not yet supported">View only</span>`;
  };
  const rows = [...records].sort((a,b) => String(b.startDate||'').localeCompare(String(a.startDate||'')));
  // Same shared `.hist-table`/`.hist-table--ellipsis` classes as the Budget Pool table and the
  // read-only drill-down table (actualSpendRowsTable()) — same padding, header style, and row
  // hover, so the Assignment Workspace no longer reads as a visually separate table (Part 7).
  return `<table class="hist-table hist-table--ellipsis">
    <colgroup>
      <col style="width:13%"><col style="width:9%"><col style="width:8%"><col style="width:8%">
      <col style="width:15%"><col style="width:8%"><col style="width:11%"><col style="width:13%"><col style="width:15%">
    </colgroup>
    <thead><tr>
      <th>Reference / Memo No</th><th>Project</th><th>Source</th>
      <th>Spend Type</th><th>Description</th><th class="hist-amt">Amount</th>
      <th>Coverage</th><th>Status</th><th>Action</th>
    </tr></thead>
    <tbody>${rows.map(record => `<tr>
      <td title="${esc(record.referenceNo || '—')}">${referenceCell(record)}</td>
      <td title="${esc(record.project || '')}">${esc(record.project || '—')}</td>
      <td><span class="badge ${actualSpendSourceBadgeClass(record.source)}">${actualSpendSourceShortLabel(record.source)}</span></td>
      <td title="${esc(record.spendType || '')}">${esc(record.spendType || '—')}</td>
      <td title="${esc(record.description || '')}">${esc(record.description || '—')}</td>
      <td class="hist-amt" style="font-weight:600">${money(Number(record.amount)||0)}</td>
      <td title="${esc(record.startDate || '—')} → ${esc(record.endDate || '—')}">${esc(record.startDate || '—')} → ${esc(record.endDate || '—')}</td>
      <td>
        <span class="badge ${actualSpendBudgetStatusBadgeClass(record.budgetStatus)}">${esc(record.budgetStatus || '—')}</span>
        <div style="font-size:10px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;margin-top:3px" title="${esc(actualSpendAssignmentReason(record))}">${esc(actualSpendAssignmentReason(record))}</div>
      </td>
      <td style="overflow:visible">${actionCell(record)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function renderBudgetAssignmentWorkspace(dataset) {
  const unbudgeted = dataset.unbudgetedRecords || [];
  const needsReview = dataset.needsReviewRecords || [];
  const section = (title, records, total) => records.length ? `
    <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
      <div style="padding:10px 14px;background:var(--bg);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <strong>${esc(title)} (${records.length} items)</strong>
        <strong style="color:var(--amber)">${money(Math.round(total))}</strong>
      </div>
      <div style="overflow-x:hidden">${budgetAssignmentRowsTable(records)}</div>
    </div>` : '';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <div style="font-size:14px;font-weight:600">Budget Assignment</div>
        <div style="font-size:11px;color:var(--text-3)">Review and assign a Budget Pool to Unbudgeted / Needs PMO Review Actual Spend</div>
      </div>
      <button class="btn-sm" onclick="closeBudgetAssignmentWorkspace()">← Back to Budget vs Actual</button>
    </div>
    ${section('Unbudgeted', unbudgeted, dataset.totals.unbudgetedActual)}
    ${section('Needs PMO Review', needsReview, dataset.totals.needsReviewActual)}
    ${!unbudgeted.length && !needsReview.length ? `
      <div class="card hist-empty">
        <div style="font-size:13px;font-weight:600;color:var(--text)">Nothing needs assignment right now.</div>
      </div>` : ''}`;
}

// ── Canonical Actual Spend drill-down (still a modal: Budget Pool rows, and the "all" KPI total) ──
// Unbudgeted and Needs PMO Review have their own summary section in _renderBvaWith() with a "View
// items" action that opens the dedicated Budget Assignment Workspace above (Phase 7A-7) instead of
// this modal, so PMO can resolve them in-page rather than in a pop-up.
function showBvaActualSpend(scope) {
  if (!_bvaDataset) return;
  let records;
  let title;
  if (scope === 'all') {
    records = [..._bvaDataset.rows.flatMap(row => row.records), ..._bvaDataset.unbudgetedRecords, ...(_bvaDataset.needsReviewRecords || [])];
    title = 'Actual Spend';
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

  // Widened from 760px (Phase 7A-7 follow-up, Part 2) — the previous width read as cramped on
  // desktop. Still a lightweight read-only list: same 5 fields (Reference, Source, Project, Spend
  // Type, Amount), no edit/assign action added here — that stays exclusive to the Budget
  // Assignment Workspace.
  panel.innerHTML = `
    <div class="card" style="width:900px;max-width:96vw;max-height:85vh;overflow-x:hidden;overflow-y:auto;padding:0">
      <div style="padding:14px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--surface)">
        <div>
          <div style="font-size:15px;font-weight:600">${esc(title)}</div>
          <div style="font-size:12px;color:var(--text-3)">${records.length} items · ${money(Math.round(total))}</div>
        </div>
        <button class="btn-sm" onclick="document.getElementById('bva-memo-panel').remove()" style="padding:4px 10px">✕</button>
      </div>
      ${actualSpendRowsTable(records)}
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
// BUDGET POOL — EXCEL TEMPLATE DOWNLOAD (Phase 7A-9D)
// ══════════════════════════════════════════════════════════════════
// Official Sheet 1 column order — Download Template and the Instructions sheet below must always
// agree with this, and handlePoolBulkUpload()'s parser below must keep accepting it.
const BGT_POOL_IMPORT_HEADERS = ['Pool ID','Project','Pool Name','Budget','Budget Year (BE)','Start Month','End Month','Spend Types'];

// Replaces the previous CSV "one example row per project" scaffold. The workbook now contains the
// REAL Budget Pools currently visible under Budget Settings (visibleBudgetSettingsPools(), shared
// with renderBudgetSettings() so both always agree), each with its real Pool ID — so downloading
// and re-uploading unmodified is a true no-op (round-trip contract) instead of importing samples.
function downloadBudgetPoolTemplate() {
  if (typeof XLSX === 'undefined') { alert('ไม่พบ SheetJS library'); return; }
  const pools = visibleBudgetSettingsPools();
  const rows = pools.map(p => [
    p.id, p.project, p.name, p.budget, p.year || '',
    p.startMonth || '', p.endMonth || '',
    (p.spendTypes || []).join(', '),
  ]);

  const sheet = XLSX.utils.aoa_to_sheet([BGT_POOL_IMPORT_HEADERS, ...rows]);
  sheet['!cols'] = [22, 18, 22, 12, 16, 14, 14, 46].map(wch => ({ wch }));
  if (rows.length) sheet['!autofilter'] = { ref: `A1:H${rows.length + 1}` };

  const instructions = XLSX.utils.aoa_to_sheet([
    ['Budget Pool Bulk Upload — Instructions'],
    ['Purpose', 'One workbook both creates new Budget Pools and updates existing ones.'],
    ['Create', 'Leave Pool ID blank on a row. A new Budget Pool is created from that row.'],
    ['Update', "Keep an existing row's Pool ID exactly as downloaded. That exact Budget Pool is updated — do not edit Pool ID on existing rows."],
    ['Deleting a row', "Deleting a row from this sheet does NOT delete the Budget Pool. Use the app's Delete action instead."],
    ['All-or-nothing', 'The entire file is validated before anything is saved. If any row has an error, nothing is created or updated.'],
    ['Date format', "Start Month / End Month use YYYY-MM, e.g. 2026-01. Budget Year (BE) is informational — the pool's real year is always derived from Start Month."],
    ['Spend Types', 'Comma-separated. Accepts Software, Hardware, Team Activity, Client Expense, Deployment, Infra, Others (or short codes SL, HW, INT, ENT, DEP). Blank = all types.'],
    [''],
    ['Common Errors', 'Meaning', 'Resolution'],
    ['Unknown Pool ID', 'The Pool ID does not match any existing Budget Pool.', 'Leave Pool ID blank to create a new pool, or correct the ID.'],
    ['Duplicate Pool ID', 'The same Pool ID appears on more than one row in this file.', 'Each Pool ID may appear on only one row per upload.'],
    ['Blank Pool ID matching existing Pool', 'An existing Budget Pool already has this Project + Pool Name + Budget Year, but Pool ID is blank.', 'Restore the Pool ID to update it, or change Project / Pool Name / Budget Year to create a new pool.'],
    ['Invalid Month', 'Start Month / End Month could not be read as a valid month.', 'Use YYYY-MM, e.g. 2026-01.'],
    ['Duplicate Identity', 'Two rows resolve to the same Project + Pool Name + Budget Year.', 'Each Budget Pool must have a unique Project + Pool Name + Budget Year.'],
    ['Invalid Spend Type', 'A Spend Type value was not recognized.', 'Use Software, Hardware, Team Activity, Client Expense, Deployment, Infra, or Others.'],
    [''],
    ['Note', 'Two Budget Pools may intentionally share the same Project + Spend Type + Period (e.g. separate budget buckets for the same purpose). This is allowed and is not an error.'],
  ]);
  instructions['!cols'] = [{ wch: 34 }, { wch: 70 }, { wch: 50 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Budget Pools');
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  XLSX.writeFile(workbook, 'budget_pool_template.xlsx');
}

// ══════════════════════════════════════════════════════════════════
// BUDGET POOL — EXCEL BULK UPLOAD (Phase 7A-9D)
// ══════════════════════════════════════════════════════════════════
// Backward/forward-compatible Spend Type token resolution: accepts a canonical Spend Type name
// (e.g. "Software", "Infra") case-insensitively, or a legacy short memo-type code (sl, hw, int,
// ent, dep, infra, other/others — the same codes previous templates used). Returns the short code
// (what memoTypes already expects downstream) or null if the token is unrecognized.
function resolveSpendTypeToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const canonicalMatch = SPEND_TYPE_VALUES.find(value => value.toLowerCase() === lower);
  if (canonicalMatch) return SPEND_TYPE_TO_MEMO_TYPE[canonicalMatch];
  const shortCode = lower === 'others' ? 'other' : lower;
  return ['sl','hw','int','ent','dep','infra','other'].includes(shortCode) ? shortCode : null;
}

// Phase 7A-9C/D: parsing only — every field-level, duplicate, overlap, Pool ID, and identity check
// is delegated to the shared validateBudgetPoolImportBatch() (app.js), the same canonical validator
// manual add/edit uses. Import is strict all-or-nothing: if any row fails, nothing is imported (see
// _showPoolImportErrors below) — there is no partial-success path.
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
    alert('ไม่สามารถอ่านไฟล์ได้ — กรุณาใช้ไฟล์ .xlsx\n' + e.message);
    return;
  }

  if (!rows.length) { alert('ไม่พบข้อมูลในไฟล์'); return; }

  const defaultYear = document.getElementById('bset-year')?.value || '2569';
  const parsed = rows.map(row => {
    const keys = Object.keys(row);
    const findKey = prefix => keys.find(k => k.toLowerCase().replace(/[\s(]/g,'').startsWith(prefix.toLowerCase().replace(/[\s(]/g,'')));
    const get = prefix => {
      const key = findKey(prefix);
      return key ? String(row[key] || '').trim() : '';
    };
    // Start/End Month need the RAW cell value (not pre-stringified by get()) so
    // excelImportMonthValue() can tell an Excel serial/Date apart from typed text.
    const getRaw = prefix => {
      const key = findKey(prefix);
      return key ? row[key] : '';
    };
    const id     = get('poolid');
    const proj   = get('project');
    // "pool" is a looser fallback than "poolname" — guard it from matching the "Pool ID" column
    // (which also normalizes to a "pool..." prefix) when "Pool Name" itself can't be found.
    const name   = get('poolname') || (findKey('pool') && findKey('pool') !== findKey('poolid') ? get('pool') : '');
    // Preserve the sign — a mistyped negative budget must be REJECTED by validation, not silently
    // flipped positive by stripping the minus sign (Phase 7A-9C bug fix).
    const budget = parseFloat(String(get('budget')).replace(/[^0-9.\-]/g,'')) || 0;
    const yr     = get('budgetyear') || get('year') || defaultYear;
    const start  = excelImportMonthValue(getRaw('startmonth') || getRaw('start'));
    const end    = excelImportMonthValue(getRaw('endmonth')   || getRaw('end'));
    // Accepts the new "Spend Types" column (canonical names) as well as the previous "Memo Types"
    // header (short codes) for backward compatibility. Split on comma/semicolon/pipe only — NOT
    // whitespace — since canonical names like "Team Activity" contain spaces.
    const typesRaw = get('spendtypes') || get('memotypes') || get('memo') || '';
    const tokens = typesRaw ? typesRaw.split(/[,;|]+/).map(t => t.trim()).filter(Boolean) : [];
    const memoTypes = [];
    const invalidSpendTypes = [];
    tokens.forEach(token => {
      const code = resolveSpendTypeToken(token);
      if (code) memoTypes.push(code); else invalidSpendTypes.push(token);
    });
    return { id, proj, name, budget, yr, start, end, memoTypes, invalidSpendTypes };
  });

  const result = validateBudgetPoolImportBatch(parsed, loadBudgetPools());
  if (!result.valid) {
    _showPoolImportErrors(result.rowResults);
    return;
  }
  _showPoolImportPreview(result.rowResults);
}

function _showPoolImportErrors(rowResults) {
  document.getElementById('pool-import-preview')?.remove();
  document.getElementById('pool-import-errors')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'pool-import-errors';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center';

  const tdS = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:11px';
  const errorRows = rowResults.filter(r => !r.ok);
  const rows = errorRows.map(r =>
    '<tr>' +
      '<td style="' + tdS + '">' + r.row + '</td>' +
      '<td style="' + tdS + '">' + esc(r.input?.id || '—') + '</td>' +
      '<td style="' + tdS + '">' + esc(r.input?.proj || '') + '</td>' +
      '<td style="' + tdS + '">' + esc(r.input?.name || '') + '</td>' +
      '<td style="' + tdS + ';color:var(--red)">' + r.errors.map(esc).join('<br>') + '</td>' +
    '</tr>'
  ).join('');

  modal.innerHTML =
    '<div class="card" style="width:820px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;padding:0;overflow:hidden">' +
      '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:15px;font-weight:700;color:var(--red)">พบข้อผิดพลาด ' + errorRows.length + ' จาก ' + rowResults.length + ' รายการ</span>' +
        '<button class="btn-sm" onclick="document.getElementById(\'pool-import-errors\').remove()" style="padding:4px 10px">✕</button>' +
      '</div>' +
      '<div style="padding:12px 20px;font-size:12px;color:var(--text-3)">' +
        '<div style="font-weight:600;color:var(--text)">Created 0 · Updated 0 · No Changes 0 · Errors ' + errorRows.length + ' — ไม่มีการ import บางส่วน (all-or-nothing)</div>' +
        'Budget Pool import เป็นแบบ all-or-nothing — หากมีแถวที่ผิดพลาดแม้เพียงรายการเดียว ระบบจะไม่สร้างหรืออัปเดตรายการใดเลย กรุณาแก้ไขไฟล์แล้วอัปโหลดใหม่' +
      '</div>' +
      '<div style="overflow:auto;flex:1">' +
        '<table class="hist-table" style="min-width:740px">' +
          '<thead><tr>' +
            '<th>Row</th>' +
            '<th>Pool ID</th>' +
            '<th>Project</th>' +
            '<th>Pool Name</th>' +
            '<th>ปัญหา</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
      '<div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px">' +
        '<button class="btn-primary" onclick="document.getElementById(\'pool-import-errors\').remove()">ปิด</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);
}

// Action → Thai label/color, including the round-trip-safe 'none' (No Changes) state — a row whose
// Pool ID matched an existing pool but every effective field is identical, so nothing will be saved.
const BGT_POOL_IMPORT_ACTION_LABELS = { create: 'สร้างใหม่', update: 'อัปเดต', none: 'ไม่มีการเปลี่ยนแปลง' };
const BGT_POOL_IMPORT_ACTION_COLORS = { create: 'var(--green-800)', update: 'var(--amber-800)', none: 'var(--text-3)' };

function _showPoolImportPreview(rowResults) {
  document.getElementById('pool-import-preview')?.remove();

  const modal = document.createElement('div');
  modal.id    = 'pool-import-preview';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center';

  const tdS  = 'padding:7px 12px;border-bottom:1px solid var(--border);font-size:11px';
  const counts = { create: 0, update: 0, none: 0 };
  rowResults.forEach(r => { counts[r.action] = (counts[r.action] || 0) + 1; });

  const rows = rowResults.map(r => {
    const p = r.record;
    const actionLabel = BGT_POOL_IMPORT_ACTION_LABELS[r.action] || r.action;
    const actionColor = BGT_POOL_IMPORT_ACTION_COLORS[r.action] || 'var(--text)';
    // For an Update whose Period or Budget Year differs from the existing pool, warn that Actual
    // Spend mappings against this pool may be affected — display-only, no new mapping logic.
    const periodChanged = r.action === 'update' && r.previous && (
      r.previous.startMonth !== p.startMonth ||
      r.previous.endMonth !== p.endMonth ||
      String(r.previous.year || '') !== String(p.year || '')
    );
    const warning = periodChanged ? '<div style="color:var(--amber-800);font-size:10px;margin-top:2px">⚠ ช่วงเวลา/ปีเปลี่ยน — อาจกระทบการ mapping เดิม</div>' : '';
    return '<tr>' +
      '<td style="' + tdS + '">' + esc(p.id && r.action !== 'create' ? p.id : '—') + '</td>' +
      '<td style="' + tdS + '">' + esc(p.project) + '</td>' +
      '<td style="' + tdS + '">' + esc(p.name) + '</td>' +
      '<td style="' + tdS + ';text-align:right">' + money(p.budget) + '</td>' +
      '<td style="' + tdS + '">' + esc(p.year) + '</td>' +
      '<td style="' + tdS + '">' + esc(formatMonthBE(p.startMonth) || '—') + ' → ' + esc(formatMonthBE(p.endMonth) || '—') + '</td>' +
      '<td style="' + tdS + '">' + (p.memoTypes.length ? p.memoTypes.map(t => t.toUpperCase()).join(', ') : 'ทุกประเภท') + '</td>' +
      '<td style="' + tdS + ';color:' + actionColor + ';font-weight:600">' + actionLabel + warning + '</td>' +
    '</tr>';
  }).join('');

  modal.innerHTML =
    '<div class="card" style="width:820px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;padding:0;overflow:hidden">' +
      '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:15px;font-weight:700">Preview — Budget Pool Import</span>' +
        '<button class="btn-sm" onclick="document.getElementById(\'pool-import-preview\').remove()" style="padding:4px 10px">✕</button>' +
      '</div>' +
      '<div style="padding:10px 20px;font-size:12px;color:var(--text-3);border-bottom:1px solid var(--border)">' +
        'Created ' + counts.create + ' · Updated ' + counts.update + ' · No Changes ' + counts.none + ' · Errors 0' +
      '</div>' +
      '<div style="overflow:auto;flex:1">' +
        '<table class="hist-table" style="min-width:760px">' +
          '<thead><tr>' +
            '<th>Pool ID</th>' +
            '<th>Project</th>' +
            '<th>Pool Name</th>' +
            '<th style="text-align:right">Budget</th>' +
            '<th>ปี</th>' +
            '<th>ช่วงเวลา</th>' +
            '<th>Spend Types</th>' +
            '<th>การดำเนินการ</th>' +
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
  window._poolImportPending = rowResults;
}

async function _confirmPoolImport() {
  const rowResults = window._poolImportPending;
  if (!rowResults) return;

  let created = 0, updated = 0, noChange = 0;
  // Phase 7A-9C/D: save every row with remap suppressed, then remap once at the end — the previous
  // per-row savePoolAsync() triggered a full Actual Spend remap on every single imported pool. A
  // 'none' row (round-trip-safe no-op) is skipped entirely: no save, no audit-field touch, no
  // contribution to the remap decision below.
  for (const r of rowResults) {
    if (r.action === 'none') { noChange++; continue; }
    await savePoolAsync(r.record, { skipRemap: true });
    if (r.action === 'update') updated++; else created++;
  }
  if (created || updated) remapActualSpendForBudgetPools();

  document.getElementById('pool-import-preview')?.remove();
  window._poolImportPending = null;
  alert('Import สำเร็จ — สร้างใหม่ ' + created + ' pool, อัปเดต ' + updated + ' pool, ไม่มีการเปลี่ยนแปลง ' + noChange + ' pool');
  renderBudgetSettings();
}

// Phase 7A-9D: single place that computes "the Budget Pools currently visible under Budget
// Settings' active filters" — used by both the on-screen list (renderBudgetSettings) and Download
// Template, so the two always agree and a future filter (Project, Spend Type, Search) only needs
// to be added here once instead of in every consumer.
// Phase 7A-9A note preserved: filters/groups by the canonical derived year, not a possibly-stale
// raw stored `year` — otherwise this list can disagree with the Edit modal (which already derives
// from normalized Start Month) for any legacy/mismatched pool.
function visibleBudgetSettingsPools() {
  const year = document.getElementById('bset-year')?.value || getCurrentBuddhistYear();
  const search = (document.getElementById('bset-search')?.value || '').trim().toLowerCase();
  return loadBudgetPools().map(createBudgetPoolRecord)
    .filter(p => p.year === year)
    .filter(p => !search || (p.project || '').toLowerCase().includes(search) || (p.name || '').toLowerCase().includes(search));
}

// Currency-revert-follow-up fix (2026-07-03): Budget Settings previously only read the
// synchronous local/localStorage pool cache (loadBudgetPools()), which stays empty until some
// other tab (Budget vs Actual) happens to call loadBudgetPoolsAsync() first in the same session —
// so a user who opens Budget Settings first saw stale/empty data. Fetch canonical Supabase pool
// data here too, mirroring the existing Budget vs Actual / Actual Spend render pattern.
async function renderBudgetSettings() {
  const body = document.getElementById('bset-budget-body');
  if (!body) return;
  await loadBudgetPoolsAsync();
  populateBudgetYearSelect('bset-year');
  const year  = document.getElementById('bset-year')?.value || getCurrentBuddhistYear();
  const pools = visibleBudgetSettingsPools();

  if (!pools.length) {
    body.innerHTML = `<div class="hist-empty">No budget pools found for ${year} — click "+ Add Pool" to get started.</div>`;
    return;
  }

  const tdS = 'padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px';
  // Group by project
  const byProj = {};
  pools.forEach(p => { if (!byProj[p.project]) byProj[p.project] = []; byProj[p.project].push(p); });

  body.innerHTML = Object.entries(byProj).map(([proj, projPools]) => `
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:6px">${esc(proj)}</div>
      <table class="hist-table bpool-table">
        <thead><tr>
          <th>Pool Name</th>
          <th>ช่วงเวลา</th>
          <th style="text-align:right">Budget (฿)</th>
          <th style="text-align:center">Actions</th>
        </tr></thead>
        <tbody>
          ${projPools.map(p => `<tr>
            <td style="${tdS};font-weight:500">${esc(p.name)}</td>
            <td style="${tdS};font-size:11px;color:var(--text-3)">${formatMonthBE(p.startMonth) || '—'} → ${formatMonthBE(p.endMonth) || '—'}</td>
            <td style="${tdS};text-align:right;font-weight:600">${money(p.budget || 0)}</td>
            <td style="${tdS};text-align:center">
              <button class="btn-sm" style="font-size:11px;padding:2px 7px" onclick="openBudgetPoolModal('${p.id}')" title="แก้ไข">✎</button>
              <button class="btn-sm" style="font-size:11px;padding:2px 7px;color:var(--red)" onclick="deleteBudgetPool('${p.id}')" title="ลบ">✕</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('');
}

// Phase 7A-9B: Budget Year is now user-selectable — changing it auto-populates Start/End Month to
// the full year (Jan-Dec) as a sensible default, since a pool can never span multiple years
// (validateBudgetPoolRecord already rejects that — see docs/BvA_REQUIREMENT.md "Phase 7A-1" §2).
// The user can still narrow the range afterward via the Start/End Month selects. This only fires on
// a user-driven change (wired via onchange on `bpool-year`), never during openBudgetPoolModal()'s
// initial population of an existing pool's own months. Year itself is never persisted independently
// — createBudgetPoolRecord() still re-derives `year` from whatever Start Month this produces, so the
// data contract (year is derived, never an independent source of truth) is unchanged.
function _onBpoolYearChange() {
  populateMonthSelect('bpool-start-month', 1);
  populateMonthSelect('bpool-end-month', 12);
}

// Structurally keeps End Month from preceding Start Month — bumps End up to match Start rather than
// silently allowing an invalid range the user would otherwise only discover as a save-time error.
function _onBpoolStartMonthChange() {
  const startSel = document.getElementById('bpool-start-month');
  const endSel = document.getElementById('bpool-end-month');
  if (!startSel || !endSel) return;
  if (Number(endSel.value) < Number(startSel.value)) {
    populateMonthSelect('bpool-end-month', Number(startSel.value));
  }
}

function openBudgetPoolModal(editId) {
  const projects = getCanonicalProjectList();
  const pool    = editId ? loadBudgetPools().find(p => p.id === editId) : null;
  // Phase 7A-9A: createBudgetPoolRecord() is now the single Gregorian-safe canonicalizer, so the
  // date/year fields are sourced from it rather than re-normalizing ad hoc here. Other fields
  // (project, name, budget, memoTypes) stay sourced from the raw pool — unrelated to this phase's
  // date/year contract and unchanged in behavior.
  const canonicalPool = pool ? createBudgetPoolRecord(pool) : null;
  populateBudgetYearSelect('bset-year');
  const year    = document.getElementById('bset-year')?.value || getCurrentBuddhistYear();

  const g = (f, def = '') => pool ? (pool[f] ?? def) : def;
  const projOpts = projects.map(p => `<option value="${esc(p)}" ${g('project') === p ? 'selected' : ''}>${esc(p)}</option>`).join('');
  const initialStart = canonicalPool?.startMonth || '';
  const initialEnd   = canonicalPool?.endMonth || '';
  const initialYear  = canonicalPool?.year || g('year', year);
  // Start/End are now Month-only selects (1-12) sharing the one Budget Year select above — a pool
  // can never span multiple years, so there is exactly one year to pick, not one per field. Default
  // to January/December for a brand-new pool with no dates yet.
  const initialStartMonthNum = initialStart ? Number(initialStart.slice(5, 7)) : 1;
  const initialEndMonthNum   = initialEnd ? Number(initialEnd.slice(5, 7)) : 12;

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
          <select id="bpool-project" class="ri" required><option value="">— เลือก —</option>${projOpts}</select>
        </div>
        <div class="fg"><label>Pool Name *</label>
          <input id="bpool-name" class="ri" required placeholder="เช่น SL 2025, HW Q1" value="${esc(g('name'))}">
        </div>
        <div class="fg"><label>Budget (฿) *</label>
          <input id="bpool-budget" class="ri" type="number" min="0.01" step="0.01" required value="${g('budget')}">
        </div>
        <div class="fg"><label>Budget Year (พ.ศ.) *</label>
          <select id="bpool-year" class="ri" required onchange="_onBpoolYearChange()"></select>
        </div>
        <div class="fg"><label>Start Month *</label>
          <select id="bpool-start-month" class="ri" required onchange="_onBpoolStartMonthChange()"></select>
        </div>
        <div class="fg"><label>End Month *</label>
          <select id="bpool-end-month" class="ri" required></select>
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
  // Populated after the modal is in the DOM (selects start empty in the template above), matching
  // the pattern already used for bset-year/bva-year — not baked into the HTML string, so an
  // existing pool's own (possibly outside current±1) year is always representable.
  populateBudgetYearSelect('bpool-year', initialYear);
  populateMonthSelect('bpool-start-month', initialStartMonthNum);
  populateMonthSelect('bpool-end-month', initialEndMonthNum);
}

async function saveBudgetPool() {
  const g      = id => document.getElementById(id)?.value?.trim() || '';
  const project = g('bpool-project');
  const name    = g('bpool-name');
  const budget  = parseFloat(g('bpool-budget')) || 0;
  const yearBE  = g('bpool-year');
  const startMonthNum = g('bpool-start-month');
  const endMonthNum   = g('bpool-end-month');
  // Phase 7A-9B: Start/End are now Year(BE)-select + Month-select, so there is no free-text BE/CE
  // ambiguity left to normalize here — the "3112" bug's root cause (a typed BE string treated as
  // Gregorian) is structurally impossible once the value always comes from a controlled dropdown.
  // createBudgetPoolRecord() still re-derives `year` from the constructed startMonth below, so the
  // derived-year contract is enforced the same way regardless of how the UI collected the input.
  const yearCE  = financialYearToGregorian(yearBE);
  const start   = (yearCE && startMonthNum) ? `${yearCE}-${String(startMonthNum).padStart(2, '0')}` : null;
  const end     = (yearCE && endMonthNum)   ? `${yearCE}-${String(endMonthNum).padStart(2, '0')}`   : null;
  const editId  = g('bpool-edit-id');

  const memoTypes = Object.keys(BGT_TYPE_LABELS).filter(k => document.getElementById('bpool-type-' + k)?.checked);

  const id    = editId || `pool-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
  // Milestone 2 Task 2.3 — Created By / Updated By metadata, same pattern as
  // saveManualExpenseFromModal(): preserve the existing pool's creator on
  // edit, always stamp the acting user as the updater.
  const existingPool = editId ? loadBudgetPools().find(p => p.id === editId) : null;
  const entry = {
    id, project, name, budget, year: yearBE, startMonth: start, endMonth: end, memoTypes,
    createdBy: existingPool?.createdBy || currentUser(),
    updatedBy: currentUser(),
  };
  const validation = validateBudgetPoolChange(entry, loadBudgetPools(), editId || null);
  if (!validation.valid) { alert(validation.errors.join('\n')); return; }
  // Business rule update: overlapping Project + Spend Type + Period is an allowed, intentional PMO
  // workflow (separate budget buckets for the same project/type/period) -- no warning/confirmation
  // is shown for it. validation.conflicts is still computed by validateBudgetPoolChange() but is no
  // longer treated as blocking here. Exact duplicate identity (Project + Pool Name + Year) remains
  // blocked above via validation.valid/validation.errors, unchanged.
  try {
    await savePoolAsync(entry);
    document.getElementById('bpool-modal')?.remove();
    renderBudgetSettings();
  } catch(e) { console.warn('Pool save error:', e); }
}

function deleteBudgetPool(id) {
  const manualExpenses = typeof loadManualExpenses === 'function' ? loadManualExpenses() : [];
  const memos = typeof loadMemos === 'function' ? loadMemos() : [];
  const records = loadActualSpendRecords();
  const pool = loadBudgetPools().map(createBudgetPoolRecord).find(p => p.id === id);
  const poolLabel = pool ? `${pool.project} / ${pool.name}` : id;
  const blockers = budgetPoolDeletionBlockers(id, records, manualExpenses, memos);
  if (blockers.length) {
    // Phase 7A-9B: explain WHY deletion is blocked and WHAT still references the pool, by source,
    // instead of a bare count — behavior is unchanged (still a hard block; delete-to-Unbudgeted
    // cascade is a separate, later reviewed phase per docs/BvA_REQUIREMENT.md "Phase 7A-1" §9).
    const canonicalCount = records.filter(r => getFinalBudgetPoolId(r) === id).length;
    const manualCount = manualExpenses.filter(e => e && e.budgetPoolId === id).length;
    const memoCount = memos.filter(m => m && m.budgetPoolId === id).length;
    const parts = [];
    if (canonicalCount) parts.push(`Actual Spend ${canonicalCount} รายการ`);
    if (manualCount) parts.push(`Manual Expense ${manualCount} รายการ`);
    if (memoCount) parts.push(`Memo ${memoCount} รายการ`);
    alert(`ไม่สามารถลบ Pool "${poolLabel}" ได้ เนื่องจากยังมีรายการอ้างอิงอยู่:\n${parts.join('\n')}\n\nกรุณาย้ายหรือยกเลิกการอ้างอิงเหล่านี้ก่อน หรือแก้ไข Pool แทนการลบ`);
    return;
  }
  if (!confirm(`ลบ Budget Pool "${poolLabel}" นี้?`)) return;
  deletePoolAsync(id)
    .then(() => renderBudgetSettings())
    .catch(e => console.warn('Pool delete error:', e));
}
