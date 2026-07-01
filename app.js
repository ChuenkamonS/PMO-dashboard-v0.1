// ─────────────────────────────────────────
// Supabase client + storage layer
// Replaces localStorage for memos, licenses, devices
// ─────────────────────────────────────────
const SUPA_URL = 'https://wokqtivoytzgfuelgeho.supabase.co';
const SUPA_KEY = 'sb_publishable_38ZMjNiHDP4li7dJB6G2Ng_iwqp5Ty0';

// ── Supabase REST helper ──
async function supaFetch(table, method='GET', body=null, query='') {
  const url = SUPA_URL + '/rest/v1/' + table + query;
  const headers = {
    'apikey': SUPA_KEY,
    'Authorization': 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json',
    'Prefer': (method === 'POST' && query.includes('on_conflict')) ? 'return=representation,resolution=merge-duplicates' : 'return=representation',
  };
  if(method === 'GET') headers['Accept'] = 'application/json';
  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  if(!resp.ok) {
    const err = await resp.text();
    throw new Error('Supabase ' + method + ' ' + table + ': ' + err);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

// ── Shared financial models (Phase 1A — local storage only) ──
const SPEND_TYPES = Object.freeze({
  SOFTWARE: 'Software',
  HARDWARE: 'Hardware',
  TEAM_ACTIVITY: 'Team Activity',
  CLIENT_EXPENSE: 'Client Expense',
  DEPLOYMENT: 'Deployment',
  INFRA: 'Infra',
  OTHERS: 'Others',
});
const SPEND_TYPE_VALUES = Object.freeze(Object.values(SPEND_TYPES));
const MEMO_TYPE_TO_SPEND_TYPE = Object.freeze({
  sl: SPEND_TYPES.SOFTWARE,
  hw: SPEND_TYPES.HARDWARE,
  int: SPEND_TYPES.TEAM_ACTIVITY,
  ent: SPEND_TYPES.CLIENT_EXPENSE,
  dep: SPEND_TYPES.DEPLOYMENT,
  infra: SPEND_TYPES.INFRA,
  other: SPEND_TYPES.OTHERS,
});
const SPEND_TYPE_TO_MEMO_TYPE = Object.freeze({
  [SPEND_TYPES.SOFTWARE]: 'sl',
  [SPEND_TYPES.HARDWARE]: 'hw',
  [SPEND_TYPES.TEAM_ACTIVITY]: 'int',
  [SPEND_TYPES.CLIENT_EXPENSE]: 'ent',
  [SPEND_TYPES.DEPLOYMENT]: 'dep',
  [SPEND_TYPES.INFRA]: 'infra',
  [SPEND_TYPES.OTHERS]: 'other',
});
const ACTUAL_SPEND_SOURCES = Object.freeze({
  APPROVED_MEMO: 'Approved Memo',
  MANUAL_EXPENSE: 'Manual / Historical Expense',
  INFRA_COST: 'Infra Cost',
});
const ACTUAL_SPEND_SOURCE_VALUES = Object.freeze(Object.values(ACTUAL_SPEND_SOURCES));
const FINANCIAL_STORAGE_KEYS = Object.freeze({
  actualSpend: 'orbit-pmo-actual-spend-v1',
  budgetPools: 'orbit-pmo-budget-pools-v1',
});
const BUDGET_STATUSES = Object.freeze({
  MANUAL_OVERRIDE: 'Manual Override',
  MAPPED: 'Mapped',
  NEEDS_PMO_REVIEW: 'Needs PMO Review',
  UNBUDGETED: 'Unbudgeted',
});

function spendTypeFromMemoType(memoType) {
  return MEMO_TYPE_TO_SPEND_TYPE[String(memoType || '').trim().toLowerCase()] || SPEND_TYPES.OTHERS;
}

function parseStrictCalendarValue(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] == null ? null : Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day != null) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  }
  return { text, year, month, day, precision: day == null ? 'month' : 'date' };
}

function isValidCalendarRange(startValue, endValue) {
  const start = parseStrictCalendarValue(startValue);
  const end = parseStrictCalendarValue(endValue);
  if (!start || !end || start.precision !== end.precision) return false;
  return start.text <= end.text;
}

function inclusiveCoverageMonths(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = parseStrictCalendarValue(startDate);
  const end = parseStrictCalendarValue(endDate);
  if (!start || !end || !isValidCalendarRange(startDate, endDate)) return null;
  return (end.year - start.year) * 12 + end.month - start.month + 1;
}

function generateFinancialRecordId(prefix = 'record') {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}

function createActualSpendRecord(input = {}) {
  const now = new Date().toISOString();
  const startDate = input.startDate || null;
  const endDate = input.endDate || null;
  const coverageMonths = inclusiveCoverageMonths(startDate, endDate);
  const coverageStatus = !startDate || !endDate ? 'Missing Coverage'
    : coverageMonths ? 'Complete' : 'Invalid Coverage';
  const effectiveDate = startDate || input.date || null;
  return {
    id: input.id || generateFinancialRecordId('actual-spend'),
    source: input.source || '',
    referenceNo: input.referenceNo || '',
    memoId: input.memoId || null,
    project: input.project || '',
    spendType: input.spendType || SPEND_TYPES.OTHERS,
    amount: Number(input.amount) || 0,
    currency: input.currency || 'THB',
    startDate,
    endDate,
    month: input.month || (effectiveDate ? String(effectiveDate).slice(0, 7) : null),
    year: input.year || (effectiveDate ? String(effectiveDate).slice(0, 4) : null),
    coverageMonths,
    coverageStatus,
    vendorProgram: input.vendorProgram || '',
    description: input.description || '',
    autoBudgetPoolId: input.autoBudgetPoolId || null,
    manualBudgetPoolId: input.manualBudgetPoolId || null,
    finalBudgetPoolId: input.manualBudgetPoolId || input.finalBudgetPoolId || input.autoBudgetPoolId || null,
    budgetStatus: input.budgetStatus || 'Unbudgeted',
    createdBy: input.createdBy || '',
    createdAt: input.createdAt || now,
    updatedBy: input.updatedBy || '',
    updatedAt: input.updatedAt || now,
  };
}

function validateActualSpendRecord(input) {
  const record = createActualSpendRecord(input);
  const errors = [];
  if (!ACTUAL_SPEND_SOURCE_VALUES.includes(record.source)) errors.push('Invalid Source');
  if (!record.referenceNo) errors.push('Reference No is required');
  if (!record.project) errors.push('Project is required');
  if (!SPEND_TYPE_VALUES.includes(record.spendType)) errors.push('Invalid Spend Type');
  if (!(record.amount > 0)) errors.push('Amount must be greater than zero');
  if (record.currency !== 'THB') errors.push('Current calculations support THB only');
  if (record.startDate && !parseStrictCalendarValue(record.startDate)) errors.push('Invalid Start Date');
  if (record.endDate && !parseStrictCalendarValue(record.endDate)) errors.push('Invalid End Date');
  if (record.coverageStatus === 'Invalid Coverage') errors.push('Invalid coverage period');
  return { valid: errors.length === 0, errors, record };
}

function actualSpendDuplicateKey(input = {}) {
  const record = createActualSpendRecord(input);
  return [
    record.source,
    record.referenceNo,
    record.project,
    record.spendType,
    record.amount,
    record.startDate || '',
    record.endDate || '',
  ].map(v => String(v).trim().toLowerCase()).join('|');
}

function validateActualSpendImport(rows, existingRows = []) {
  const existingKeys = new Set(existingRows.map(actualSpendDuplicateKey));
  const batchKeys = new Set();
  const records = [];
  const duplicates = [];
  const errors = [];
  (rows || []).forEach((row, index) => {
    const result = validateActualSpendRecord(row);
    if (!result.valid) {
      errors.push({ row: index + 1, errors: result.errors });
      return;
    }
    const key = actualSpendDuplicateKey(result.record);
    if (existingKeys.has(key) || batchKeys.has(key)) {
      duplicates.push({ row: index + 1, record: result.record });
      return;
    }
    batchKeys.add(key);
    records.push(result.record);
  });
  return {
    valid: errors.length === 0,
    errors,
    duplicates,
    records: errors.length ? [] : records,
  };
}

function createBudgetPoolRecord(input = {}) {
  const hasCanonicalTypes = Object.prototype.hasOwnProperty.call(input, 'spendTypes');
  const legacyTypes = Array.isArray(input.memoTypes)
    ? (input.memoTypes.length ? input.memoTypes.map(spendTypeFromMemoType) : SPEND_TYPE_VALUES)
    : [];
  const spendTypes = (hasCanonicalTypes && Array.isArray(input.spendTypes) ? input.spendTypes : legacyTypes)
    .filter(t => SPEND_TYPE_VALUES.includes(t));
  const memoTypes = spendTypes.map(t => SPEND_TYPE_TO_MEMO_TYPE[t]).filter(Boolean);
  return {
    id: input.id || '',
    project: input.project || '',
    name: input.name || '',
    budget: Number(input.budget) || 0,
    currency: input.currency || 'THB',
    spendTypes,
    startDate: input.startDate || input.startMonth || null,
    endDate: input.endDate || input.endMonth || null,
    year: input.year || null,
    startMonth: input.startMonth || input.startDate || null,
    endMonth: input.endMonth || input.endDate || null,
    memoTypes,
    createdBy: input.createdBy || '',
    createdAt: input.createdAt || new Date().toISOString(),
    updatedBy: input.updatedBy || '',
    updatedAt: input.updatedAt || new Date().toISOString(),
  };
}

function validateBudgetPoolRecord(input) {
  const record = createBudgetPoolRecord(input);
  const errors = [];
  if (!record.id) errors.push('ID is required');
  if (!record.project) errors.push('Project is required');
  if (!(record.budget > 0)) errors.push('Budget must be greater than zero');
  if (record.currency !== 'THB') errors.push('Current calculations support THB only');
  if (!record.spendTypes.length) errors.push('At least one Spend Type is required');
  if (!record.startDate || !record.endDate || !isValidCalendarRange(record.startDate, record.endDate)) {
    errors.push('Valid start/end month or date range is required');
  }
  return { valid: errors.length === 0, errors, record };
}

function loadFinancialRecords(storageKey) {
  try {
    const rows = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch(e) { return []; }
}

function storeFinancialRecords(storageKey, rows) {
  if (!Array.isArray(rows)) throw new Error('Financial storage requires an array');
  let validated;
  if (storageKey === FINANCIAL_STORAGE_KEYS.actualSpend) {
    validated = rows.map(validateActualSpendRecord);
  } else if (storageKey === FINANCIAL_STORAGE_KEYS.budgetPools) {
    validated = rows.map(validateBudgetPoolRecord);
  } else {
    throw new Error('Unsupported financial storage key');
  }
  const invalid = validated.find(result => !result.valid);
  if (invalid) throw new Error(invalid.errors.join('; '));
  const records = validated.map(result => result.record);
  localStorage.setItem(storageKey, JSON.stringify(records));
  return records;
}

function loadActualSpendRecords() {
  return loadFinancialRecords(FINANCIAL_STORAGE_KEYS.actualSpend).map(createActualSpendRecord);
}

function storeActualSpendRecords(rows) {
  return storeFinancialRecords(FINANCIAL_STORAGE_KEYS.actualSpend, rows.map(createActualSpendRecord));
}

function loadBudgetPoolRecords() {
  return loadFinancialRecords(FINANCIAL_STORAGE_KEYS.budgetPools).map(createBudgetPoolRecord);
}

function storeBudgetPoolRecords(rows) {
  return storeFinancialRecords(FINANCIAL_STORAGE_KEYS.budgetPools, rows.map(createBudgetPoolRecord));
}

function queryActualSpend(filters = {}, rows = loadActualSpendRecords()) {
  return rows.filter(record =>
    (!filters.source || record.source === filters.source) &&
    (!filters.project || record.project === filters.project) &&
    (!filters.spendType || record.spendType === filters.spendType) &&
    (!filters.currency || record.currency === filters.currency) &&
    (!filters.budgetStatus || record.budgetStatus === filters.budgetStatus) &&
    (!filters.fromDate || (record.startDate && record.startDate >= filters.fromDate)) &&
    (!filters.toDate || (record.endDate && record.endDate <= filters.toDate))
  );
}

function queryBudgetPools(filters = {}, rows = loadBudgetPoolRecords()) {
  return rows.filter(pool =>
    (!filters.project || pool.project === filters.project) &&
    (!filters.spendType || pool.spendTypes.includes(filters.spendType)) &&
    (!filters.currency || pool.currency === filters.currency) &&
    (!filters.date || ((!pool.startDate || filters.date >= pool.startDate) && (!pool.endDate || filters.date <= pool.endDate)))
  );
}

function getActualSpendByProject(project, rows) {
  return queryActualSpend({ project }, rows || loadActualSpendRecords());
}

function getBudgetPoolsByProject(project, rows) {
  return queryBudgetPools({ project }, rows || loadBudgetPoolRecords());
}

function getFinalBudgetPoolId(actualSpend = {}) {
  return actualSpend.manualBudgetPoolId || actualSpend.finalBudgetPoolId || actualSpend.autoBudgetPoolId || null;
}

function calendarValueInRange(value, startValue, endValue) {
  const date = parseStrictCalendarValue(value);
  const start = parseStrictCalendarValue(startValue);
  const end = parseStrictCalendarValue(endValue);
  if (!date || !start || !end) return false;
  if (date.precision === 'date' && start.precision === 'date' && end.precision === 'date') {
    return date.text >= start.text && date.text <= end.text;
  }
  const monthIndex = part => part.year * 12 + part.month;
  return monthIndex(date) >= monthIndex(start) && monthIndex(date) <= monthIndex(end);
}

function actualSpendMappingDate(actualSpend = {}) {
  return actualSpend.startDate || actualSpend.month || (actualSpend.year ? `${actualSpend.year}-01` : null);
}

function findMatchingBudgetPools(actualSpend, pools = []) {
  const mappingDate = actualSpendMappingDate(actualSpend);
  if (!mappingDate) return [];
  return pools.filter(pool =>
    pool.project === actualSpend.project &&
    Array.isArray(pool.spendTypes) && pool.spendTypes.includes(actualSpend.spendType) &&
    calendarValueInRange(mappingDate, pool.startDate || pool.startMonth, pool.endDate || pool.endMonth)
  );
}

function mapBudgetPool(actualSpend, pools = []) {
  if (actualSpend.manualBudgetPoolId) {
    return {
      ...actualSpend,
      finalBudgetPoolId: actualSpend.manualBudgetPoolId,
      budgetStatus: BUDGET_STATUSES.MANUAL_OVERRIDE,
    };
  }
  const matches = findMatchingBudgetPools(actualSpend, pools);
  if (matches.length === 1) {
    return {
      ...actualSpend,
      autoBudgetPoolId: matches[0].id,
      finalBudgetPoolId: matches[0].id,
      budgetStatus: BUDGET_STATUSES.MAPPED,
    };
  }
  return {
    ...actualSpend,
    autoBudgetPoolId: null,
    finalBudgetPoolId: null,
    budgetStatus: matches.length > 1 ? BUDGET_STATUSES.NEEDS_PMO_REVIEW : BUDGET_STATUSES.UNBUDGETED,
  };
}

function mapActualSpendRecords(records = [], pools = []) {
  return records.map(record => mapBudgetPool(record, pools));
}

function calculateActualSpend(records = [], filters = {}) {
  return queryActualSpend(filters, records).reduce((sum, record) => sum + (Number(record.amount) || 0), 0);
}

function actualSpendMonthlyAllocations(record = {}) {
  const start = String(record.startDate || record.month || '').slice(0, 7);
  const end = String(record.endDate || record.month || start).slice(0, 7);
  const months = inclusiveCoverageMonths(start, end);
  if (!months) {
    const fallback = String(record.createdAt || record.updatedAt || '').slice(0, 7);
    return fallback ? { [fallback]: Number(record.amount) || 0 } : {};
  }
  const result = {};
  const startParts = start.split('-').map(Number);
  const monthlyAmount = (Number(record.amount) || 0) / months;
  for (let index = 0; index < months; index++) {
    const date = new Date(Date.UTC(startParts[0], startParts[1] - 1 + index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    result[key] = monthlyAmount;
  }
  return result;
}

function calculateActualSpendInRange(records = [], fromMonth, toMonth, filters = {}) {
  return queryActualSpend(filters, records).reduce((sum, record) => {
    const allocations = actualSpendMonthlyAllocations(record);
    return sum + Object.entries(allocations).reduce((subtotal, [month, amount]) =>
      subtotal + ((!fromMonth || month >= fromMonth) && (!toMonth || month <= toMonth) ? amount : 0), 0);
  }, 0);
}

function calculateForecast(records = [], asOfDate = new Date(), filters = {}) {
  const anchor = new Date(asOfDate);
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth();
  const months = [];
  for (let offset = -5; offset <= 6; offset++) {
    const date = new Date(anchorYear, anchorMonth + offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      kind: offset <= 0 ? 'actual' : 'forecast',
    });
  }
  const eligible = queryActualSpend(filters, records).filter(record =>
    (record.spendType === SPEND_TYPES.SOFTWARE || record.spendType === SPEND_TYPES.INFRA) &&
    record.coverageStatus === 'Complete'
  );
  const grouped = new Map();
  eligible.forEach(record => {
    const program = record.vendorProgram || record.description || record.referenceNo || record.spendType;
    const key = [record.project, program, record.spendType].join('\u0000');
    if (!grouped.has(key)) grouped.set(key, {
      project: record.project,
      program,
      spendType: record.spendType,
      values: Object.fromEntries(months.map(month => [month.key, 0])),
    });
    const row = grouped.get(key);
    const allocations = actualSpendMonthlyAllocations(record);
    const coverageEnd = String(record.endDate).slice(0, 7);
    const monthlyCost = (Number(record.amount) || 0) / record.coverageMonths;
    months.forEach(month => {
      const allocated = Number(allocations[month.key]) || 0;
      const carriedForecast = month.kind === 'forecast' && month.key > coverageEnd ? monthlyCost : 0;
      row.values[month.key] += allocated || carriedForecast;
    });
  });
  const rows = [...grouped.values()].sort((a, b) =>
    a.project.localeCompare(b.project) || a.spendType.localeCompare(b.spendType) || a.program.localeCompare(b.program)
  ).map(row => ({
    ...row,
    total: months.reduce((sum, month) => sum + row.values[month.key], 0),
  }));
  return { months, rows };
}

function forecastExportDataset(forecast = { months:[], rows:[] }) {
  const months = forecast.months || [];
  const rows = forecast.rows || [];
  return {
    headers: ['Project','Program','Spend Type', ...months.map(month => `${month.key} ${month.kind}`), 'Total'],
    rows: rows.map(row => [
      row.project, row.program, row.spendType,
      ...months.map(month => row.values[month.key] || 0),
      row.total,
    ]),
  };
}

function calculateBudgetUtilization(pool, records = []) {
  const actual = calculateActualSpend(
    records.filter(record => getFinalBudgetPoolId(record) === pool.id),
    { project: pool.project },
  );
  const budget = Number(pool.budget) || 0;
  return {
    budget,
    actual,
    remaining: budget - actual,
    utilizationPercent: budget > 0 ? actual / budget * 100 : 0,
  };
}

const FINANCIAL_HELPERS = Object.freeze({
  queryActualSpend,
  queryBudgetPools,
  getActualSpendByProject,
  getBudgetPoolsByProject,
  getFinalBudgetPoolId,
  findMatchingBudgetPools,
  mapBudgetPool,
  mapActualSpendRecords,
  calculateActualSpend,
  actualSpendMonthlyAllocations,
  calculateActualSpendInRange,
  calculateForecast,
  forecastExportDataset,
  calculateBudgetUtilization,
});

function importActualSpendRecords(rows) {
  const existing = loadActualSpendRecords();
  const result = validateActualSpendImport(rows, existing);
  if (!result.valid) return { ...result, saved: 0 };
  storeActualSpendRecords([...existing, ...result.records]);
  return { ...result, saved: result.records.length };
}

function memoCoveragePeriod(memo = {}) {
  const ranges = (memo.slItems || [])
    .filter(item => item.startMonth && item.endMonth && isValidCalendarRange(item.startMonth, item.endMonth));
  if (ranges.length) {
    return {
      startDate: ranges.map(item => item.startMonth).sort()[0],
      endDate: ranges.map(item => item.endMonth).sort().at(-1),
    };
  }
  if (memo.depStart && memo.depEnd && isValidCalendarRange(memo.depStart, memo.depEnd)) {
    return { startDate: memo.depStart, endDate: memo.depEnd };
  }
  return { startDate: null, endDate: null };
}

function actualSpendFromMemo(memo, existing = null) {
  if (!memo || memo.status !== 'completed') return null;
  const coverage = memoCoveragePeriod(memo);
  const effectiveDate = String(memo.approvedAt || memo.updatedAt || memo.createdAt || '').slice(0, 10);
  return createActualSpendRecord({
    ...existing,
    id: existing?.id || `actual-spend-memo-${memo.memoNo}`,
    source: ACTUAL_SPEND_SOURCES.APPROVED_MEMO,
    referenceNo: memo.memoNo,
    memoId: memo.memoNo,
    project: memo.project,
    spendType: spendTypeFromMemoType(memo.type),
    amount: memo.total,
    currency: 'THB',
    startDate: coverage.startDate,
    endDate: coverage.endDate,
    date: parseStrictCalendarValue(effectiveDate) ? effectiveDate : null,
    vendorProgram: (memo.slItems || []).map(item => item.name).filter(Boolean).join(', '),
    description: memo.subject || memo.reason || '',
    manualBudgetPoolId: memo.manualBudgetPoolId || memo.budgetPoolId || existing?.manualBudgetPoolId || null,
    createdBy: memo.requesterName || existing?.createdBy || '',
    createdAt: existing?.createdAt || memo.createdAt,
    updatedBy: currentUser(),
  });
}

function syncMemoToActualSpend(memo, pools = loadBudgetPoolRecords()) {
  const records = loadActualSpendRecords();
  const index = records.findIndex(record => record.memoId === memo.memoNo || (
    record.source === ACTUAL_SPEND_SOURCES.APPROVED_MEMO && record.referenceNo === memo.memoNo
  ));
  if (memo.status !== 'completed') {
    if (index >= 0) storeActualSpendRecords(records.filter((_, i) => i !== index));
    return null;
  }
  const mapped = mapBudgetPool(actualSpendFromMemo(memo, index >= 0 ? records[index] : null), pools);
  if (index >= 0) records[index] = mapped; else records.push(mapped);
  storeActualSpendRecords(records);
  return mapped;
}

function updateActualSpendBudgetOverride(memoNo, manualBudgetPoolId, pools = loadBudgetPoolRecords()) {
  const records = loadActualSpendRecords();
  const index = records.findIndex(record => record.memoId === memoNo);
  if (index < 0) return null;
  const updated = mapBudgetPool({ ...records[index], manualBudgetPoolId: manualBudgetPoolId || null }, pools);
  records[index] = updated;
  storeActualSpendRecords(records);
  return updated;
}

// ══════════════════════════════════════════════════════════════════
// GLOBAL: User profiles & authority limits cache
// ══════════════════════════════════════════════════════════════════
let _userProfilesCache = null;
let _authorityCache    = null;

async function loadUserProfilesAsync() {
  if(_userProfilesCache) return _userProfilesCache;
  try {
    const rows = await supaFetch('user_profiles','GET',null,'?order=full_name.asc');
    if(rows && rows.length){ _userProfilesCache = rows; return rows; }
  } catch(e){ console.warn('user_profiles load failed',e.message); }
  _userProfilesCache = [
    {id:1, full_name:'นาย นวพล งามวรโรจน์สกุล',  title:'ผู้อำนวยการโครงการ',     name_aliases:['นวพล','Nawaphon'],      is_approver:true, can_review:true, can_approve:true, is_active:true, is_pmo:true, email:'nawaphon@orbitdigital.co.th'},
    {id:2, full_name:'นาย ปกรณ์ เจียมสกุลทิพย์', title:'ประธานเจ้าหน้าที่บริหาร', name_aliases:['ปกรณ์','CEO','Pakorn'],  is_approver:true, can_review:true, can_approve:true, is_active:true, is_pmo:true, email:'pakorn@orbitdigital.co.th'},
    {id:3, full_name:'นางสาว ชื่นกมล สารมานิตย์', title:'ผู้จัดการโครงการ',        name_aliases:['ชื่นกมล','Chuenkamon'], is_approver:true, can_review:true, can_approve:true, is_active:true, is_pmo:true, email:'somying@orbitdigital.co.th'},
  ];
  return _userProfilesCache;
}
async function loadAuthorityAsync() {
  if(_authorityCache) return _authorityCache;
  try {
    const rows = await supaFetch('authority_limits','GET',null,'?order=title.asc');
    if(rows && rows.length){ _authorityCache = rows; return rows; }
  } catch(e){ console.warn('authority_limits load failed',e.message); }
  return null;
}
function getApprovers(stage = 'approve') {
  return (_userProfilesCache||[]).filter(u => {
    if (u.is_active === false) return false;
    if (stage === 'review') return u.can_review ?? u.is_approver;
    return u.can_approve ?? u.is_approver;
  });
}
function findUserByName(name) {
  if(!name||!_userProfilesCache) return null;
  const n = name.trim();
  return _userProfilesCache.find(u=>u.full_name===n||(u.name_aliases||[]).some(a=>a.toLowerCase()===n.toLowerCase()))||null;
}
function getAuthorityLimit(title, memoType) {
  if(_authorityCache){
    const r = _authorityCache.find(r=>r.title===title&&r.memo_type===memoType);
    if(r) return Number(r.limit_thb)||0;
  }
  const fb={
    'ประธานเจ้าหน้าที่บริหาร':          {sl:2000000,hw:2000000,int:0,ent:150000,dep:2000000},
    'ประธานเจ้าหน้าที่สายการเงิน (CFO)':{sl:1000000,hw:500000, int:0,ent:50000, dep:500000},
    'ผู้อำนวยการ (Team Director)':       {sl:500000, hw:500000, int:0,ent:50000, dep:500000},
    'ผู้อำนวยการโครงการ':                {sl:500000, hw:500000, int:0,ent:50000, dep:500000},
    'Senior Manager / Manager':          {sl:50000,  hw:50000,  int:0,ent:10000, dep:50000},
    'Team Leader':                       {sl:30000,  hw:30000,  int:0,ent:5000,  dep:30000},
  };
  return fb[title]?.[memoType]??0;
}

// isPMO — single source of truth (moved from budget.js)
function currentUserProfileId() {
  const raw = document.getElementById('sb-user-btn')?.dataset?.profileId;
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}
function currentUserProfile() {
  const id = currentUserProfileId();
  if (id == null) return null;
  return (_userProfilesCache || []).find(u => Number(u.id) === id) || null;
}
function isPMO() {
  const simulated = document.getElementById('sb-user-btn')?.dataset?.isPmo;
  if (simulated === 'true' || simulated === 'false') return simulated === 'true';
  const profile = currentUserProfile();
  if (profile) return profile.is_pmo === true;
  return (document.getElementById('sb-urole')?.textContent?.trim()||'') === 'PMO';
}
// currentUser — single source of truth (moved from pending.js)
function currentUser() {
  return document.getElementById('sb-uname')?.textContent?.trim()||'';
}

function profileMatches(profileId, name, targetProfileId = currentUserProfileId(), targetName = currentUser()) {
  if (profileId != null && targetProfileId != null) return Number(profileId) === Number(targetProfileId);
  if (!name || !targetName) return false;
  if (String(name).trim() === String(targetName).trim()) return true;
  const profile = (_userProfilesCache || []).find(u => Number(u.id) === Number(targetProfileId));
  return !!profile && (
    profile.full_name === name ||
    (profile.name_aliases || []).some(alias => String(alias).toLowerCase() === String(name).toLowerCase())
  );
}

function memoCurrentStageIndex(memo) {
  return memo?.status === 'pending_a2' ? 1 : memo?.status === 'pending_a3' ? 2 : 0;
}
function memoCurrentApprover(memo) {
  return (memo?.approvers || [])[memoCurrentStageIndex(memo)] || null;
}
function isMemoRequester(memo) {
  return profileMatches(memo?.requesterProfileId, memo?.requesterName);
}
function isMemoCurrentApprover(memo) {
  const approver = memoCurrentApprover(memo);
  if (!approver) return false;
  return profileMatches(approver.profileId, approver.name);
}
function isMemoVisibleInPending(memo) {
  if (!memo || !['pending','pending_a2','pending_a3'].includes(memo.status)) return false;
  return isPMO() || isMemoRequester(memo) || isMemoCurrentApprover(memo);
}
function canCurrentUserActOnMemo(memo) {
  if (!memo || !['pending','pending_a2','pending_a3'].includes(memo.status)) return false;
  if (isMemoRequester(memo)) return false;
  return isMemoCurrentApprover(memo) || isPMO();
}

function prepareMemoForSubmission(data, now = new Date().toISOString()) {
  const approvers = (data.approvers || []).map(a => ({...a}));
  const requesterProfileId = data.requesterProfileId ?? currentUserProfileId();
  const requesterName = data.requesterName || currentUser();
  const selfA1 = !!approvers[0] && profileMatches(
    approvers[0].profileId,
    approvers[0].name,
    requesterProfileId,
    requesterName
  );
  const next = selfA1 ? approvers[1] : approvers[0];
  if (selfA1) {
    approvers[0] = {
      ...approvers[0],
      status: 'approved',
      approvedAt: now,
      approvedBy: requesterName,
      approvedByProfileId: requesterProfileId,
      selfReviewed: true,
    };
  }
  const status = next ? (selfA1 ? 'pending_a2' : 'pending') : 'completed';
  const auditLog = [...(data.auditLog || [])];
  if (selfA1) {
    auditLog.push({
      actor: requesterName,
      actorProfileId: requesterProfileId,
      action: 'A1 Self-reviewed on submission',
      comment: 'Requester is also the A1 reviewer; routed directly to A2',
      timestamp: now,
      statusBefore: data.status || 'draft',
      statusAfter: status,
    });
  }
  return {
    ...data,
    requesterProfileId,
    approvers,
    auditLog,
    status,
    submittedAt: data.submittedAt || now,
    selfReviewedAt: selfA1 ? now : null,
    currentApproverProfileId: next?.profileId ?? null,
    approvedAt: status === 'completed' ? now : null,
  };
}

function draftFromMemo(memo, sourceMemoNo = memo?.memoNo) {
  return {
    ...memo,
    id: undefined,
    memoNo: undefined,
    date: undefined,
    status: 'draft',
    sourceMemoNo,
    createdAt: undefined,
    updatedAt: undefined,
    submittedAt: undefined,
    approvedAt: undefined,
    rejectedAt: undefined,
    cancelledAt: undefined,
    selfReviewedAt: undefined,
    approvedBy: undefined,
    rejectedBy: undefined,
    cancelledBy: undefined,
    approvalNote: undefined,
    rejectionReason: undefined,
    cancellationReason: undefined,
    currentApproverProfileId: null,
    auditLog: [],
    approvers: (memo?.approvers || []).map(a => ({
      ...a,
      status: 'pending',
      approvedAt: null,
      approvedBy: null,
      approvedByProfileId: null,
      rejectedAt: null,
      rejectedBy: null,
      selfReviewed: false,
    })),
  };
}

// ── Memo field mapping: JS camelCase ↔ DB snake_case ──
function memoToDb(m) {
  return {
    id: m.id || m.memoNo,
    memo_no: m.memoNo,
    type: m.type, type_label: m.typeLabel,
    status: m.status || 'pending',
    project: m.project, subject: m.subject, reason: m.reason,
    to: m.to, date: m.date, total: Number(m.total)||0,
    amount_words: m.amountWords,
    requester_name: m.requesterName, requester_title: m.requesterTitle,
    requester_profile_id: m.requesterProfileId || null,
    current_approver_profile_id: m.currentApproverProfileId || null,
    self_reviewed_at: m.selfReviewedAt || null,
    source_memo_no: m.sourceMemoNo || null,
    reviewer_name: m.reviewerName, reviewer_title: m.reviewerTitle, reviewer_date: m.reviewerDate,
    approver_name: m.approverName, approver_title: m.approverTitle, approver_date: m.approverDate,
    approvers: m.approvers || [],
    approved_by: m.approvedBy, rejected_by: m.rejectedBy,
    approval_note: m.approvalNote, rejection_reason: m.rejectionReason,
    cancellation_reason: m.cancellationReason || null,
    cancelled_by: m.cancelledBy || null,
    pmo_override_note: m.pmoOverrideNote || null,
    pmo_override_by: m.pmoOverrideBy || null,
    fx_rate: m.fxRate || null,
    sections: m.sections || [], sl_items: m.slItems || [], audit_log: m.auditLog || [],
    budget_source:  m.budgetSource  || null,
    budget_pool_id: m.budgetPoolId  || null,
    // INT fields
    int_activity:  m.intActivity  || null,
    int_date:      m.intDate      || null,
    int_headcount: m.intHeadcount || null,
    int_pp:        m.intPP        || null,
    // ENT fields
    ent_client: m.entClient || null,
    ent_date:   m.entDate   || null,
    ent_time:   m.entTime   || null,
    ent_place:  m.entPlace  || null,
    ent_people: m.entPeople || null,
    // DEP fields
    dep_location:  m.depLocation  || null,
    dep_start:     m.depStart     || null,
    dep_end:       m.depEnd       || null,
    dep_emp_count: m.depEmpCount  || null,
    pmo_evidence_url:      m.pmoEvidenceUrl      || null,
    approval_evidence_url: m.approvalEvidenceUrl || null,
    submitted_at: m.submittedAt || null,
    approved_at: m.approvedAt || null, rejected_at: m.rejectedAt || null,
    cancelled_at: m.cancelledAt || null,
    created_at: m.createdAt || new Date().toISOString(),
    updated_at: m.updatedAt || new Date().toISOString(),
  };
}
function dbToMemo(r) {
  return {
    id: r.memo_no, memoNo: r.memo_no,
    type: r.type, typeLabel: r.type_label,
    status: r.status, project: r.project, subject: r.subject, reason: r.reason,
    to: r.to, date: r.date, total: Number(r.total)||0, amountWords: r.amount_words,
    requesterName: r.requester_name, requesterTitle: r.requester_title,
    requesterProfileId: r.requester_profile_id || null,
    currentApproverProfileId: r.current_approver_profile_id || null,
    selfReviewedAt: r.self_reviewed_at || null,
    sourceMemoNo: r.source_memo_no || null,
    reviewerName: r.reviewer_name, reviewerTitle: r.reviewer_title, reviewerDate: r.reviewer_date,
    approverName: r.approver_name, approverTitle: r.approver_title, approverDate: r.approver_date,
    approvers: r.approvers || [],
    approvedBy: r.approved_by, rejectedBy: r.rejected_by,
    approvalNote: r.approval_note, rejectionReason: r.rejection_reason,
    cancellationReason: r.cancellation_reason || null,
    cancelledBy: r.cancelled_by || null,
    pmoOverrideNote: r.pmo_override_note || null, pmoOverrideBy: r.pmo_override_by || null,
    entClient: r.ent_client || null, entDate: r.ent_date || null,
    entTime: r.ent_time || null, entPlace: r.ent_place || null, entPeople: r.ent_people || null,
    intActivity:  r.int_activity  || null,
    intDate:      r.int_date      || null,
    intHeadcount: r.int_headcount || null,
    intPP:        r.int_pp        || null,
    depLocation:  r.dep_location  || null,
    depStart:     r.dep_start     || null,
    depEnd:       r.dep_end       || null,
    depEmpCount:  r.dep_emp_count || null,
    fxRate: r.fx_rate, sections: r.sections || [], slItems: r.sl_items || [], auditLog: r.audit_log || [],
    budgetSource:  r.budget_source   || null,
    budgetPoolId:  r.budget_pool_id  || null,
    pmoEvidenceUrl:      r.pmo_evidence_url      || null,   // available after ALTER TABLE
    approvalEvidenceUrl: r.approval_evidence_url || null,   // available after ALTER TABLE
    submittedAt: r.submitted_at, approvedAt: r.approved_at, rejectedAt: r.rejected_at,
    cancelledAt: r.cancelled_at || null,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// ── Memo storage (async, with localStorage fallback) ──
const MEMO_KEY = 'orbit-pmo-memos-v1';
let _memCache = null;
let _supaAvailable = null;

async function checkSupa() {
  if(_supaAvailable !== null) return _supaAvailable;
  try {
    await supaFetch('memos', 'GET', null, '?limit=1');
    _supaAvailable = true;
  } catch(e) {
    console.warn('Supabase unavailable, using localStorage', e.message);
    _supaAvailable = false;
  }
  return _supaAvailable;
}

async function loadMemosAsync() {
  if(await checkSupa()) {
    try {
      const rows = await supaFetch('memos', 'GET', null, '?order=created_at.desc&limit=500');
      _memCache = (rows||[]).map(dbToMemo);
      return _memCache;
    } catch(e) {
      console.warn('Supabase read failed, using cache');
      if (_memCache) return _memCache;
    }
  }
  // Offline fallback: localStorage
  try { const p = JSON.parse(localStorage.getItem(MEMO_KEY)||'[]'); return Array.isArray(p)?p:[]; }
  catch(e) { return []; }
}

async function saveMemoAsync(data) {
  const now = new Date().toISOString();
  const existing = loadMemos().find(m => m.memoNo === data.memoNo);
  const saved = { ...data, id:data.memoNo, status:data.status||'pending',
    createdAt: existing ? existing.createdAt : now, updatedAt: now };

  if(await checkSupa()) {
    try {
      const db = memoToDb(saved);
      await supaFetch('memos', 'POST', db, '?on_conflict=memo_no');
      // update cache directly — no need to re-fetch
      if (_memCache) {
        const ci = _memCache.findIndex(m => m.memoNo === saved.memoNo);
        if (ci >= 0) _memCache[ci] = saved; else _memCache.unshift(saved);
      } else {
        _memCache = [saved];
      }
      if (saved.status === 'completed') {
        const actualSpend = syncMemoToActualSpend(saved);
        if (actualSpend) Object.assign(saved, {
          autoBudgetPoolId: actualSpend.autoBudgetPoolId,
          manualBudgetPoolId: actualSpend.manualBudgetPoolId,
          finalBudgetPoolId: actualSpend.finalBudgetPoolId,
          budgetStatus: actualSpend.budgetStatus,
        });
      }
      return saved;
    } catch(e) { console.warn('Supabase save failed', e.message); }
  }
  // Offline fallback: localStorage
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === data.memoNo);
  if(idx>=0) memos[idx]=saved; else memos.push(saved);
  storeMemos(memos);
  if (saved.status === 'completed') {
    const actualSpend = syncMemoToActualSpend(saved);
    if (actualSpend) Object.assign(saved, {
      autoBudgetPoolId: actualSpend.autoBudgetPoolId,
      manualBudgetPoolId: actualSpend.manualBudgetPoolId,
      finalBudgetPoolId: actualSpend.finalBudgetPoolId,
      budgetStatus: actualSpend.budgetStatus,
    });
    storeMemos(memos);
  }
  return saved;
}

async function updateMemoStatusAsync(memoNo, status, extra={}) {
  // Read from cache first (fastest), fall back to Supabase if not found
  let memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) {
    const freshMemos = await loadMemosAsync();
    memo = freshMemos.find(m => m.memoNo === memoNo);
  }
  if (!memo) return null;

  // ── Terminal state guard ──
  // completed and rejected memos cannot be changed except by PMO override
  const isPmoOverride = extra.pmoOverrideNote || extra.pmoOverrideBy;
  const isTerminal    = memo.status === 'completed' || memo.status === 'rejected' || memo.status === 'cancelled';
  if (isTerminal && !isPmoOverride) return memo;

  // ── Approver order enforcement ──
  // Prevent A2 from approving if A1 hasn't approved yet
  if (status === 'approved_a2' && memo.status !== 'pending_a2') return memo;
  if (status === 'approved_a3' && memo.status !== 'pending_a3') return memo;

  const now     = new Date().toISOString();
  const deferRender = !!extra._deferRender;
  const updated = { ...memo, ...extra, status, updatedAt: now };
  delete updated._deferRender;
  delete updated.throwOnSyncError;

  // ── Multi-approver flow logic ──
  const approvers = memo.approvers || [];
  const currentPendingIdx = approvers.findIndex(a => !a.status || a.status === 'pending');

  if (status === 'approved_a1' || status === 'approved_a2' || status === 'approved_a3') {
    // Find which approver is approving
    const approvingIdx = status === 'approved_a1' ? 0 : status === 'approved_a2' ? 1 : 2;
    const nextIdx = approvingIdx + 1;

    updated.approvers = approvers.map((a, i) =>
      i === approvingIdx
        ? {
            ...a,
            status: 'approved',
            approvedAt: now,
            approvedBy: extra.approvedBy || currentUser(),
            approvedByProfileId: currentUserProfileId(),
          }
        : a
    );

    if (nextIdx < approvers.length && approvers[nextIdx]) {
      // Still more approvers
      updated.status = nextIdx === 1 ? 'pending_a2' : 'pending_a3';
      updated.currentApproverProfileId = approvers[nextIdx].profileId || null;
      updated.approvedAt = null;
    } else {
      // All done
      updated.status    = 'completed';
      updated.approvedAt = now;
      updated.currentApproverProfileId = null;
    }
  } else if (status === 'cancelled') {
    updated.cancelledAt = extra.cancelledAt || now;
    updated.currentApproverProfileId = null;
  } else if (status === 'rejected') {
    updated.rejectedAt = now;
    updated.currentApproverProfileId = null;
    const pendingIdx = approvers.findIndex(a => !a.status || a.status === 'pending');
    if (pendingIdx >= 0) {
      updated.approvers = approvers.map((a, i) =>
        i === pendingIdx ? {
          ...a,
          status: 'rejected',
          rejectedAt: now,
          rejectedBy: extra.rejectedBy || currentUser(),
          rejectedByProfileId: currentUserProfileId(),
        } : a
      );
    }
  }

  if (updated.status === 'completed') {
    updated.approvedAt = updated.approvedAt || now;
    updated.currentApproverProfileId = null;
  } else if (['pending','pending_a2','pending_a3'].includes(updated.status)) {
    updated.currentApproverProfileId = memoCurrentApprover(updated)?.profileId || null;
  } else if (['rejected','cancelled'].includes(updated.status)) {
    updated.currentApproverProfileId = null;
  }

  // Sync to Supabase
  const supaReady = await checkSupa();
  if (!supaReady && extra.throwOnSyncError) {
    throw new Error('Supabase is unavailable');
  }
  if (supaReady) {
    try {
      const toSnake = s => s.replace(/([A-Z])/g, '_$1').toLowerCase();
      // Only exclude auditLog (handled separately above) and evidence URLs (now in DB)
      const PENDING_COLUMNS = new Set(['auditLog', 'throwOnSyncError', '_deferRender']);
      const patch = {
        status: updated.status,
        updated_at: now,
        approvers: updated.approvers,
        audit_log: extra.auditLog || updated.auditLog || memo.auditLog || [],
        current_approver_profile_id: updated.currentApproverProfileId || null,
        ...Object.fromEntries(
          Object.entries(extra)
            .filter(([k]) => !PENDING_COLUMNS.has(k))
            .map(([k,v]) => [toSnake(k), v])
        )
      };
      if (updated.approvedAt)  patch.approved_at  = updated.approvedAt;
      if (updated.rejectedAt)  patch.rejected_at  = updated.rejectedAt;
      if (updated.cancelledAt) patch.cancelled_at = updated.cancelledAt;
      await supaFetch('memos', 'PATCH', patch, '?memo_no=eq.' + encodeURIComponent(memoNo));
    } catch(e) {
      console.warn('Supabase patch failed', e.message);
      if(extra.throwOnSyncError) throw e;
    }
  }

  // Update in-memory cache (always — whether Supabase succeeded or not)
  if (!_memCache) _memCache = [];
  const cacheIdx = _memCache.findIndex(m => m.memoNo === memoNo);
  if (cacheIdx >= 0) _memCache[cacheIdx] = updated;
  else _memCache.unshift(updated);
  // Keep the offline backup current as well. Without this, status changes made
  // while Supabase is unavailable disappear on the next page load.
  storeMemos(_memCache);
  const actualSpend = syncMemoToActualSpend(updated);
  if (actualSpend) {
    Object.assign(updated, {
      autoBudgetPoolId: actualSpend.autoBudgetPoolId,
      manualBudgetPoolId: actualSpend.manualBudgetPoolId,
      finalBudgetPoolId: actualSpend.finalBudgetPoolId,
      budgetStatus: actualSpend.budgetStatus,
    });
    storeMemos(_memCache);
  }

  // Side effects on completion
  if (updated.status === 'completed') {
    if (typeof createPurchaseOrdersFromMemo === 'function') {
      createPurchaseOrdersFromMemo(updated);
    }
  }

  // Safe render — only if DOM is ready
  if(!deferRender) {
    try { if (typeof renderPendingMemos === 'function') renderPendingMemos(); } catch(e) {}
    try { if (typeof renderHistoryMemos === 'function') renderHistoryMemos(); } catch(e) {}
  }

  return updated;
}

// ── Sync: push all localStorage memos to Supabase ──
async function syncLocalToSupabase() {
  if(!(await checkSupa())) return { ok:false, msg:'Supabase unavailable' };
  const local = loadMemos();
  if(!local.length) return { ok:true, pushed:0 };
  let pushed = 0;
  for(const m of local) {
    try {
      await supaFetch('memos', 'POST', memoToDb(m), '?on_conflict=memo_no');
      pushed++;
    } catch(e) { console.warn('Sync failed for', m.memoNo, e.message); }
  }
  _memCache = null;
  return { ok:true, pushed };
}

// ─────────────────────────────────────────
// app.js — shared utils, storage, nav, PDF
// ─────────────────────────────────────────

// ── Date helpers ──
const MONTHS_TH = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
function thaiDate(d) { return `${d.getDate()} ${MONTHS_TH[d.getMonth()]} พ.ศ. ${d.getFullYear()+543}`; }
const TODAY = thaiDate(new Date());
const todayISO = new Date().toISOString().slice(0,10);

// ── Shared utils ──
function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function val(sel, root=document) { return root.querySelector(sel)?.value?.trim() || ''; }
function money(n) { return '฿' + (Number(n)||0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
function shortDate(iso) {
  if(!iso) return '-';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()+543).slice(-2)}`;
}
function dateInput(v) {
  if(!v) return '-';
  const d = new Date(v + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? v : thaiDate(d);
}
function badgeClass(type) {
  return { sl:'badge-blue', hw:'badge-gray', int:'badge-green', ent:'badge-amber', dep:'badge-purple' }[type] || 'badge-gray';
}
function table(headers, rows, numericIndexes=[], centerIndexes=[]) {
  const thStyle = 'background:#e8e8e8;color:#111;font-weight:600;padding:7px 10px;text-align:center;border:1px solid #ccc;font-size:12px';
  const tdBase  = 'padding:7px 10px;border:1px solid #ccc;font-size:12px';
  // Last row = total row if numericIndexes provided
  const bodyRows = rows.map((row, ri) => {
    const isLast = ri === rows.length - 1 && numericIndexes.length > 0;
    return '<tr>' + row.map((c,i) => {
      const align = numericIndexes.includes(i) ? 'center' : centerIndexes.includes(i) ? 'center' : 'left';
      const weight = numericIndexes.includes(i) ? 'font-weight:700;' : '';
      const bg = isLast ? 'background:#f0f0f0;' : '';
      return '<td style="' + tdBase + ';text-align:' + align + ';' + weight + bg + '">' + esc(c) + '</td>';
    }).join('') + '</tr>';
  });
  return '<table style="width:100%;border-collapse:collapse;margin:6px 0">'
    + '<thead><tr>' + headers.map(h => '<th style="' + thStyle + '">' + esc(h) + '</th>').join('') + '</tr></thead>'
    + '<tbody>' + bodyRows.join('') + '</tbody>'
    + '</table>';
}

// ── Storage ──
// _memCache is the single source of truth — populated from Supabase on app init
// localStorage kept only as offline fallback
let _memMemos = [];
function canUseLocalStorage() {
  try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return true; }
  catch(e) { return false; }
}
const HAS_LS = canUseLocalStorage();

function loadMemos() {
  // Prefer in-memory cache (populated from Supabase by loadMemosAsync on app init)
  // An empty array is a valid, authoritative result from Supabase.
  if (_memCache !== null) return _memCache;
  // Offline fallback: localStorage
  if (!HAS_LS) return _memMemos;
  try { const p = JSON.parse(localStorage.getItem(MEMO_KEY)||'[]'); return Array.isArray(p)?p:[]; }
  catch(e) { return _memMemos; }
}

function storeMemos(memos) {
  _memMemos = Array.isArray(memos) ? memos : [];
  // Always keep in-memory cache in sync
  _memCache = _memMemos;
  // localStorage as offline backup only
  if (!HAS_LS) return;
  try { localStorage.setItem(MEMO_KEY, JSON.stringify(_memMemos)); }
  catch(e) { console.warn('localStorage write failed'); }
}
function currentMemoPrefix() {
  const d = new Date();
  return `ORB-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}`;
}
function nextMemoNo() {
  const prefix = currentMemoPrefix();
  const max = loadMemos().reduce((m,memo) => {
    const match = String(memo.memoNo||'').match(new RegExp(`^${prefix}-(\\d{3})$`));
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `${prefix}-${String(max+1).padStart(3,'0')}`;
}
function setNextMemoNo() {
  const el = document.getElementById('f-memo-no');
  if(el && !el.value.trim()) el.value = nextMemoNo();
}
function saveMemo(data) {
  // Sync version for backward compat — pushes to Supabase async in background
  const now = new Date().toISOString();
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === data.memoNo);
  const existing = idx >= 0 ? memos[idx] : null;
  const saved = {
    ...data,
    id:          data.memoNo,
    status:      data.status || 'pending',
    createdAt:   existing?.createdAt || data.createdAt || now,
    updatedAt:   now,
  };
  if (!saved.submittedAt && saved.status !== 'draft') {
    saved.submittedAt = existing?.submittedAt || now;
  }
  // Update in-memory cache immediately
  if (!_memCache) _memCache = [];
  const ci = _memCache.findIndex(m => m.memoNo === saved.memoNo);
  if (ci >= 0) _memCache[ci] = saved; else _memCache.unshift(saved);
  // Async push to Supabase in background
  saveMemoAsync(saved).catch(e => console.warn('Background Supabase save failed', e));
  return saved;
}
function updateMemoStatus(memoNo, status, extra={}) {
  const memos = loadMemos();
  const idx = memos.findIndex(m => m.memoNo === memoNo);
  if(idx<0) { alert('ไม่พบ Memo ที่เลือก'); return null; }
  memos[idx] = { ...memos[idx], ...extra, status, updatedAt: new Date().toISOString() };
  if(status==='completed') memos[idx].approvedAt = memos[idx].updatedAt;
  if(status==='rejected')  memos[idx].rejectedAt = memos[idx].updatedAt;
  storeMemos(memos);
  const actualSpend = syncMemoToActualSpend(memos[idx]);
  if (actualSpend) Object.assign(memos[idx], {
    autoBudgetPoolId: actualSpend.autoBudgetPoolId,
    manualBudgetPoolId: actualSpend.manualBudgetPoolId,
    finalBudgetPoolId: actualSpend.finalBudgetPoolId,
    budgetStatus: actualSpend.budgetStatus,
  });
  storeMemos(memos);
  // _memCache is already updated by storeMemos — do not null it here
  // Auto-create purchase orders for HW memos (sync only — avoid double-firing)
  if(status === 'completed' && memos[idx].type === 'hw') {
    if(typeof createPurchaseOrdersFromMemo === 'function') {
      createPurchaseOrdersFromMemo(memos[idx]);
    }
  }
  updateMemoStatusAsync(memoNo, status, { ...extra, _deferRender:true })
    .then(() => { renderPendingMemos(); renderHistoryMemos(); })
    .catch(e => console.warn('Supabase status update failed', e));
  return memos[idx];
}

// ── Navigation ──
function swView(id, el, title) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.sb-sub-item').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s => s.classList.remove('active'));
  document.getElementById('view-'+id).classList.add('active');
  document.getElementById('page-title').textContent = title;
  if(el) el.classList.add('active');
  if(['create','pending','history'].includes(id)) document.getElementById('nav-memo').classList.add('active');
  if(id === 'budget')  renderBudget();
  if(id === 'license') renderLicense();
  if(id === 'device')  renderDevice();
  if(id === 'history') { renderHistoryMemos(); if(typeof populateHistTabCounts==='function') populateHistTabCounts(); }
  if(id === 'pending') renderPendingMemos();

  if(id === 'resource') { if(typeof renderResource==='function') renderResource(); }
  if(id === 'settings') { if(typeof renderSettings==='function') renderSettings(); }
}
function toggleMemoSub(el) {
  el.classList.add('active');
  swView('create', document.querySelector('#memo-sub .sb-sub-item'), 'Create Memo');
}

// ── PDF ──
function renderMemoPdf(data) {
  // Use server CSS classes (.mp-*) — injected by PDF server with THSarabun font
  // Auto-derive data.to from last approver title if not set
  if(!data.to && data.approvers && data.approvers.length > 0) {
    data = Object.assign({}, data, { to: data.approvers[data.approvers.length-1].title || '' });
  }

  function fmtDate(v) {
    if(!v || v === '-') return '';
    // Already a Thai full date string e.g. "17 มิถุนายน 2569" — return as-is
    if(/[ก-๙]/.test(v)) return v;
    // ISO YYYY-MM-DD or any parseable → full Thai date
    const d = new Date(v.length===10 ? v+'T00:00:00' : v);
    if(isNaN(d.getTime())) return v;
    return thaiDate(d); // "17 มิถุนายน พ.ศ. 2569"
  }
  // YYYY-MM → "มิถุนายน 2569"
  function fmtMonth(v) {
    if(!v || v==='-') return v;
    const m = v.match(/^(\d{4})-(\d{2})$/);
    if(!m) return v;
    return `${MONTHS_TH[parseInt(m[2],10)-1]} ${parseInt(m[1])+543}`;
  }

  // ── Authority — dynamic from Supabase (_authorityCache) with fallback ──
  function getAuthority(memoType) {
    const approvers = data.approvers || [];
    const finalApprover = approvers.length > 0 ? approvers[approvers.length-1] : null;
    const title = finalApprover?.title || data.approverTitle || 'ประธานเจ้าหน้าที่บริหาร';
    const limit = getAuthorityLimit(title, memoType);
    return { title, limit };
  }
  function fmtLimit(n) { return (Number(n)||0).toLocaleString('th-TH',{maximumFractionDigits:0}); }

  // ── SL: collect software names from slItems ──
  const slProgramNames = (data.slItems||[]).filter(it=>it.name&&it.name!=='-').map(it=>it.name);
  const slProgramStr   = slProgramNames.length ? slProgramNames.join(', ') : 'โปรแกรม';

  const typeBody = {
    sl: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} - บริษัท ออร์บิท ดิจิทัล จำกัด มีความจำเป็นต้องใช้งานโปรแกรม ${esc(slProgramStr)} ${esc(data.reason||'')} จึงขออนุมัติงบประมาณเพื่อจัดซื้อโปรแกรมดังกล่าว ตามรายละเอียดดังต่อไปนี้`,
    hw: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด มีความจำเป็นต้องจัดซื้ออุปกรณ์ Hardware ${esc(data.reason||'')} จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    int: `เนื่องด้วยโครงการ ${esc(data.project||'-')} มีความประสงค์จัดกิจกรรม Team Activity ${esc(data.reason||'')} จึงขออนุมัติงบประมาณตามรายละเอียดดังต่อไปนี้`,
    ent: `สืบเนื่องจากพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด ได้วางแผนจัดงานบริษัทเลี้ยงรับรองลูกค้าเพื่อขอบคุณ ซึ่งจะจัดวันที่ ${esc(fmtDate(data.entDate)||'-')} สถานที่จัดคือ ${esc(data.entPlace||'-')} จำนวนผู้เข้าร่วมโดยประมาณ ${esc(data.entPeople||'-')} คน โดยกำหนดงบประมาณสำหรับค่าใช้จ่ายงานเลี้ยงรับรองลูกค้าเป็นจำนวนเงินไม่เกิน ${data.total ? (Number(data.total)||0).toLocaleString('th-TH',{maximumFractionDigits:0}) : '-'} บาท`,
    dep: `เนื่องด้วยพนักงานโครงการ ${esc(data.project||'-')} บริษัท ออร์บิท ดิจิทัล จำกัด วางแผนดำเนินการปฏิบัติงานที่ ${esc(data.depLocation||'-')} ในช่วงวันที่ ${esc(fmtDate(data.depStart)||'-')}${data.depEnd && data.depEnd !== data.depStart ? ` – ${esc(fmtDate(data.depEnd))}` : ''} โดยมีจำนวนทั้งสิ้น ${data.depEmpCount||'-'} คน โดยมีรายละเอียดดังต่อไปนี้`,
  };
  const bodyText = typeBody[data.type] || `ด้วยฝ่าย PMO มีความประสงค์ขออนุมัติรายการตามรายละเอียดด้านล่าง เพื่อสนับสนุนการดำเนินงานของโครงการ ${esc(data.project||'-')} ให้เป็นไปตามแผนงาน`;

  const amtStr = data.total ? `<strong>${(Number(data.total)||0).toLocaleString('th-TH', {maximumFractionDigits:0})} บาท</strong> (${esc(data.amountWords||'-')})` : '';
  const totalNoSign = data.total ? (Number(data.total)||0).toLocaleString('th-TH',{maximumFractionDigits:0}) : '-';

  const closingMap = {
    // SL — ค่าบริการ พ.ศ. 2566
    sl: data.total ? (function(){
      const slSection = (data.sections||[]).find(s => s.title === 'รายการ Software');
      let totalSeats = 0, months = 12;
      if(slSection && slSection.html) {
        const doc = new DOMParser().parseFromString(slSection.html, 'text/html');
        doc.querySelectorAll('tbody tr').forEach(row => {
          const cells = row.querySelectorAll('td');
          if(cells.length >= 5) {
            const mo  = parseInt(cells[4]?.textContent)||0;
            const qty = parseInt(cells[5]?.textContent)||0;
            if(mo)  months = mo;
            totalSeats += qty;
          }
        });
      }
      const auth = getAuthority('sl');
      const seatsStr  = totalSeats ? `จำนวนรวมทั้งหมด ${totalSeats} Seats ` : '';
      const monthsStr = `ระยะเวลา ${months} เดือน `;
      const limitStr  = auth.limit>0 ? `ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท` : `ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
      return `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณสำหรับค่าใช้จ่ายดังกล่าว รวมเป็นจำนวนเงินไม่เกิน ${amtStr} ${seatsStr}${monthsStr}อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระค่าบริการ ${limitStr}`;
    })() : '',
    // HW — ค่าสวัสดิการพนักงาน พ.ศ. 2566
    hw: data.total ? (function(){
      const auth = getAuthority('hw');
      const limitStr = auth.limit>0 ? `ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท` : `ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
      return `จึงขอความกรุณาโปรดพิจารณาอนุมัติค่าใช้จ่ายสำหรับรายการจัดซื้อข้างต้น ในวงเงิน ${amtStr} อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระเงินค่าสวัสดิการพนักงาน ${limitStr}`;
    })() : '',
    // INT — ไม่มี authority reference ตาม policy
    int: data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณสำหรับค่ากิจกรรมทีม ${esc(data.project||'-')} เพื่อใช้จัดกิจกรรมดังกล่าว เป็นวงเงินจำนวนไม่เกิน ${totalNoSign} บาท (${esc(data.amountWords||'-')})` : '',
    // ENT — ค่าเลี้ยงรับรอง พ.ศ. 2564
    ent: data.total ? (function(){
      const auth = getAuthority('ent');
      const limitStr = auth.limit>0 ? `วงเงินไม่เกิน ${fmtLimit(auth.limit)} บาท ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ` : `ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
      return `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณค่ารับรองลูกค้าจาก ${esc(data.entClient||data.project||'-')} ในช่วงเวลาดังกล่าว อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2564 ข้อ 3.2 หมวดค่าเลี้ยงรับรอง ${limitStr}`;
    })() : '',
    // DEP — ค่าสวัสดิการพนักงาน พ.ศ. 2566
    dep: data.total ? (function(){
      const auth = getAuthority('dep');
      const limitStr = auth.limit>0 ? `ซึ่งให้อำนาจแก่${esc(auth.title)}ไม่เกิน ${fmtLimit(auth.limit)} บาท` : `ซึ่งให้อำนาจแก่${esc(auth.title)}ในการอนุมัติงบประมาณ`;
      return `จึงขอความอนุเคราะห์อนุมัติการจัดซื้อสำหรับรายการจัดซื้อข้างต้น ในวงเงิน ${amtStr} อ้างอิงอำนาจอนุมัติจากคู่มืออำนาจอนุมัติ พ.ศ. 2566 ข้อ 3.2 การชำระเงินที่มี (การตั้งงบประมาณไว้) หมวดการชำระเงินค่าสวัสดิการพนักงาน ${limitStr}`;
    })() : '',
  };
  const closingText = closingMap[data.type] || (data.total ? `ในการนี้จึงขอให้ท่านโปรดพิจารณาอนุมัติงบประมาณรวมเป็นจำนวนเงินไม่เกิน ${amtStr}` : '');

  // sectionsHtml rendered inline below with fxNote injection

  const fxNote = data.type === 'sl'
    ? `<p class="mp-note">* <u>หมายเหตุ</u> : เรทราคาโปรแกรมดังกล่าวแปลงเรทเงินตราจากหน่วย USD เป็น THB ณ วันที่ ${esc(fmtDate(data.date)||TODAY)}${data.fxRate ? ` (1 USD = ฿${data.fxRate})` : ''}</p>`
    : '';

  // Dates stored as Thai strings from dateInput() — display directly
  // fmtDate only as safety net for raw ISO strings
  const reviewerDate = data.reviewerDate && data.reviewerDate !== '-' ? data.reviewerDate : (data.date||'');
  const approverDate = data.approverDate && data.approverDate !== '-' ? data.approverDate : (data.date||'');

  return `<div class="preview-wrap">
    <!-- Header row: memo no + date (logo injected by server) -->
    <div class="mp-hdr">
      <div class="mp-hdr-right">
        <div><strong>เลขที่</strong>&nbsp;&nbsp;${esc(data.memoNo)}</div>
        <div><strong>ลงวันที่</strong>&nbsp;&nbsp;${esc(fmtDate(data.date)||TODAY)}</div>
      </div>
    </div>

    <!-- Title -->
    <div class="mp-title">บันทึกข้อความ</div>

    <!-- เรื่อง / เรียน -->
    <div class="mp-field"><span class="mp-field-label">เรื่อง</span><span class="mp-field-value">${esc(data.subject||'-')}</span></div>
    <div class="mp-field"><span class="mp-field-label">เรียน</span><span class="mp-field-value">${esc(data.to||'-')}</span></div>

    <!-- Body -->
    <div class="mp-body"><p style="font-size:14pt;line-height:1.8;text-indent:2.5em">${bodyText}</p></div>

    <!-- Sections with fxNote after SL table -->
    ${(data.sections||[]).map(function(s){
      let html = s.html;

      if(s.title === 'รายการ Software') {
        const renameHeader = (from, to) => {
          html = html.replace(new RegExp('<th([^>]*)>' + from + '<\/th>', 'g'), '<th$1>' + to + '</th>');
        };
        renameHeader('#', 'No');
        renameHeader('ชื่อ Software', 'Item');
        renameHeader('฿\/เดือน', 'Price/Month (THB)');
        renameHeader('จำนวน', 'QTY (License)');
        renameHeader('รวม', 'Amount (THB)');
        renameHeader('เดือน', 'Month');
        renameHeader('เริ่ม', 'Start');
        renameHeader('สิ้นสุด', 'End');
        html = html.replace(/>([0-9]{4}-[0-9]{2})</g, function(m, v) {
          var parts = v.match(/^([0-9]{4})-([0-9]{2})$/);
          if (!parts) return m;
          return '>' + MONTHS_TH[parseInt(parts[2],10)-1] + ' ' + (parseInt(parts[1])+543) + '<';
        });
        html = html.replace(/<tr>(.*?)<\/tr>/gs, function(match, cells) {
          if(match.includes('<th')) return match;
          var tds = [];
          var idx = 0;
          cells.replace(/<td([^>]*)>(.*?)<\/td>/gs, function(m, attrs, content) {
            var isLeft = (idx === 1 || idx === 2);
            var isBold = attrs.includes('font-weight:700');
            tds.push('<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:'+(isLeft?'left':'center')+';'+(isBold?'font-weight:700;':'')+'">'+content+'</td>');
            idx++;
            return m;
          });
          return tds.length ? '<tr>'+tds.join('')+'</tr>' : match;
        });
        if(!html.includes('Total Amount') && data.total) {
          var totalRow = '<tr><td colspan="8" style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">Total Amount</td><td style="text-align:center;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
          html = html.replace('</tbody></table>', totalRow+'</tbody></table>');
        }
      }

      if(s.title === 'ตาราง Account') {
        html = html.replace('<thead><tr>', '<thead><tr><th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:40px">No</th>');
        var rowNum = 0;
        html = html.replace(/<tr>(.*?)<\/tr>/gs, function(match, cells) {
          if(match.includes('<th')) return match;
          rowNum++;
          var tds = ['<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center">'+rowNum+'</td>'];
          var idx = 0;
          cells.replace(/<td([^>]*)>(.*?)<\/td>/gs, function(m, attrs, content) {
            var isLeft = idx === 0;
            tds.push('<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:'+(isLeft?'left':'center')+'">'+content+'</td>');
            idx++;
            return m;
          });
          return tds.length > 1 ? '<tr>'+tds.join('')+'</tr>' : match;
        });
      }

      if(s.title === 'รายการ Hardware') {
        if(!html.includes('Total Amount') && data.total) {
          var thMatch = html.match(/<thead>(.*?)<\/thead>/s);
          var colCount = thMatch ? (thMatch[1].match(/<th/g)||[]).length : 5;
          var totalRow = '<tr><td colspan="'+(colCount-1)+'" style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">Total Amount</td><td style="text-align:center;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
          html = html.replace('</tbody></table>', totalRow+'</tbody></table>');
        }
      }

      if(s.title === 'รายการค่าใช้จ่าย') {
        // Convert <ol> list to numbered table for DEP
        if(html.includes('<ol')) {
          var depItems = [];
          html.replace(/<li>(.*?)<\/li>/g, function(m, item) { depItems.push(item.trim()); });
          var depRows = depItems.map(function(item, i) {
            return '<tr>'
              + '<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center;width:50px;vertical-align:top">'+(i+1)+'.</td>'
              + '<td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:left">'+item+'</td>'
              + '</tr>';
          }).join('');
          html = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:50px">ที่</th>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt">รายการ</th>'
            + '</tr></thead><tbody>'+depRows+'</tbody></table>';
          if(!html.includes('Total Amount') && data.total) {
            var depTotal = '<tr><td style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center">รวม</td>'
              + '<td style="text-align:right;font-weight:700;background:#f0f0f0;padding:7px 10px;border:1px solid #ccc;font-size:13pt">'+esc(money(data.total))+'</td></tr>';
            html = html.replace('</tbody></table>', depTotal+'</tbody></table>');
          }
        }
      }

      if(s.title === 'รายชื่อผู้เข้าร่วม') {
        if(!html.includes('<table') && html.includes('<ol')) {
          var names = [];
          html.replace(/<li>(.*?)<\/li>/g, function(m, name) { names.push(name.trim()); });
          var rows = names.map(function(n,i) {
            return '<tr><td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:center;width:50px">'+(i+1)+'</td><td style="padding:7px 10px;border:1px solid #ccc;font-size:13pt;text-align:left">'+n+'</td></tr>';
          }).join('');
          html = '<table style="width:100%;border-collapse:collapse"><thead><tr>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt;width:50px">No.</th>'
            + '<th style="background:#e8e8e8;color:#111;font-weight:600;padding:8px 10px;text-align:center;border:1px solid #ccc;font-size:13pt">รายชื่อ</th>'
            + '</tr></thead><tbody>' + rows + '</tbody></table>';
        }
      }

      return '<div style="margin-top:12px"><p style="font-weight:700;margin-bottom:6px">'+esc(s.title)+'</p>'+html+(s.title==='รายการ Software'?fxNote:'')+'</div>';
    }).join('')}



    <!-- Closing -->
    ${closingText ? `<div class="mp-closing"><p style="font-size:14pt;line-height:1.8;text-indent:2.5em">${closingText}</p></div>` : ''}

    <!-- Signature boxes -->
    ${(function(){
      // Build approver array — always minimum 2 (reviewer + approver)
      let arr = data.approvers && data.approvers.length > 0
        ? [...data.approvers]
        : [];
      // If only 1 approver, prepend a reviewer slot
      if(arr.length < 2) {
        const revName  = data.reviewerName  && data.reviewerName  !== '-' ? data.reviewerName  : '';
        const revTitle = data.reviewerTitle && data.reviewerTitle !== '-' ? data.reviewerTitle : 'ผู้จัดการโครงการ';
        if(revName) {
          // Use the actual status from approvers if the reviewer is already in the list
          const revEntry = (data.approvers||[]).find(a => a.name === revName);
          arr.unshift({ name: revName, title: revTitle,
            status: revEntry?.status || 'pending',
            approvedAt: revEntry?.approvedAt || null });
        } else if(arr.length === 1) {
          // Duplicate as reviewer — copy full entry including status
          arr.unshift({ ...arr[0], title: 'ผู้จัดการโครงการ' });
        } else {
          arr = [
            { name: data.reviewerName||'-', title: data.reviewerTitle||'ผู้จัดการโครงการ', status:'pending' },
            { name: data.approverName||'-', title: data.approverTitle||'ประธานเจ้าหน้าที่บริหาร', status:'pending' },
          ];
        }
      }
      return '<div class="mp-approval" style="display:grid;grid-template-columns:repeat('+arr.length+',1fr);gap:0;width:100%;margin-top:8px">'
        + arr.map(function(a, i) {
          const isFirst = i === 0;
          const isLast  = i === arr.length - 1;
          // A1 always has headText
          const headText = isFirst
            ? 'เรียน ' + esc(data.to || 'ผู้อำนวยการโครงการ') + ' เพื่อโปรดพิจารณาอนุมัติดำเนินการ'
            : '';
          // Options: A1=เห็นชอบ (multi) or อนุมัติ (single), Last=อนุมัติ, Middle=เห็นชอบ
          const optText = isFirst && arr.length === 1
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; อนุมัติ, เพื่อโปรดพิจารณาดำเนินการ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : isFirst && arr.length > 1
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; เห็นชอบ, เพื่อโปรดพิจารณาอนุมัติ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : isLast
            ? '<div class="mp-appr-opt" style="font-size:12pt">&#9675; อนุมัติ, เพื่อโปรดพิจารณาดำเนินการ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>'
            : '<div class="mp-appr-opt" style="font-size:12pt">&#9675; เห็นชอบ, เพื่อโปรดพิจารณาอนุมัติ</div><div class="mp-appr-opt" style="font-size:12pt">&#9675; อื่นๆ ..............................………</div>';
          const sigDate = data.date || '';
          const isApproved = a.status === 'approved';
          const sigImgUrl  = isApproved ? getSignatureFromCache(a.name) : null;
          const sigHtml    = sigImgUrl
            ? `<div style="text-align:center;height:54px;display:flex;align-items:center;justify-content:center">` +
              `<img src="${sigImgUrl}" style="max-width:170px;max-height:52px;object-fit:contain"></div>`
            : `<div class="mp-sig-space" style="height:54px"></div>`;
          return '<div class="mp-appr-cell" style="font-size:12pt;padding:10px 12px;min-height:160px;display:flex;flex-direction:column;border:1px solid #000;'+(i>0?'margin-left:-1px;':'')+'">'
            + (headText ? '<div class="mp-appr-head" style="font-size:12pt">'+headText+'</div>' : '')
            + optText
            + '<div style="flex:1"></div>'
            + sigHtml
            + '<div class="mp-sig-name" style="font-size:12pt;font-weight:600;text-align:center">( '+esc(a.name||'-')+' )</div>'
            + '<div class="mp-sig-role" style="font-size:12pt;text-align:center">'+esc(a.title||'-')+'</div>'
            + '<div class="mp-sig-date" style="font-size:12pt;text-align:center">'+(isApproved ? sigDate : '')+'</div>'
            + '</div>';
        }).join('')
        + '</div>';
    })()}
    </div>
  </div>`;
}

const LOGO_B64 = 'data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCACSANcDASIAAhEBAxEB/8QAHAABAQACAwEBAAAAAAAAAAAAAAYFBwMECAEC/8QARxAAAQQBAgQDBgIFCQQLAAAAAQACAwQFBhEHEiExCBNBIjJRYXGBFEIVI1KRoRYkMzhicnOxswk0Q8ElNjdEdHWCk7LR4f/EABoBAQADAQEBAAAAAAAAAAAAAAADBAUBAgb/xAA5EQABAwIDBAgEBQMFAAAAAAABAAIDBBEhMUESUWFxBRMigZGhwdEUMlKxFSNigvAkM0JDcpKi4f/aAAwDAQACEQMRAD8A9loiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIi455o4InSzPbHGwbuc47ABM1wkAXK5Fjc3nMVhYDNk70NdvoHO6n6BTFnUWZ1HZko6SiEVZp5ZclM32R8eQepXewehcRTmF3Ic+WyBO7rFs8/X5A9AropmRY1Bsdwz79B9+Cy/jpKk2pG3H1H5e7V3kOKxz9e3si4s0zpm/kR6Tyjy4/4r8k8VLp5m/oTFtPYbGUj+KvWNaxoa0BrR0AA2AX1d+LjZ/biHfifbyXsUUz8ZZnHlZo8sfNQBw3E93tfywxrT8BQbsuJ9Xi7UPNFlMDkQPyyQGPf7hbERd/EHasaf2j0XodHNGT3/wDI+q1rJrnWeF3OpdDTvhb71jGyea0fPbuqDSnEDS2pH+Tj8mxloe9WnHlyg/3SqrZTGrtBaX1QzmyWMjbZHVluD9XMw/EOb1/evQmpJcJGbB3tx8j6ELvU1UWLH7Q3O9x7KnBRajnm15w0JkmfPq7TDPecR/PKrfjv+cBbF0pqTD6nxMeUwtxlqu/vt7zD+y4ehUVRROiaJGkOYdR9jqDwPcpoapsh2HDZduPpvCy6IipqyiIiIiIiIiIiIiIiIiIiIiIiIiIiIuOzNFXgfNNII442lznHsAodsdvXdwvldLW07C/ZrAdnWyPU/wBldjUD5dTZ8adrPLaFciS/I383wYq+rBFXrsggjEcUbQ1jQNgArzT8KwO/zPkPc+SxXX6SlLP9Fpsf1EZj/aNd5wyC+U60FSuytWhZDDGNmMYNgAuZEVIkk3K2QA0WGSJuvj3BrS5xAAG5J7BRN/N5bUt2TF6WcK9WM8tjJOG4HxDB6n5qWGB0pNsAMycgqtVWMpgAcXHIDM/zU5BZvUWqsJghtfutEp92GMc8jvoAp7+WGqMl10/o+YxH3ZrsnltP2HVZzTmkMNhz57YDauu6vtWPbkcfv2+yodlY6ymiwY3aO84DwHqVXEVbPjI/YG5uJ7yfQKAc/ixN7bIdO1wfykvd/wA1wyZTixQHNNp/CZJg7ivO5jz9N1sVCuiubrE23I+917+AIyldfmPZa3r8VqFSyKmrcJktPSuPLzzx88J/9Y9Fh9S6cnw9p3EPhZNBKXfrMhjIXbwXmdyWge6/b4LbF+lUvVnVrtaGzC4bOjlYHNP2K1pmeHmU0zakzvDO6aU4PPNiJnF1WwPUAH3D9Fdo6mn2+x2CcCDixw3HUc8bbwop4Zw3t9sDUYOHEaHy71Z6C1Zi9Y6fhy+LeeV3szQu6PheO7HD0IVAvNmP1fW0/qx+tsXUlxsEsza2q8G8bOrPJ2Fhg9W79yPivR1SxFarRWYJGyRStD2OaehBG4Kr9J0BpXhzR2XZX0OoPLQ6ggqxRVQnbYnEefH+ZFcqIiy1dRERERERERERERERERERERYvVOSGJwli73ka3ljHxeegWUKk9Xf9Iajw+H7x+YbEw+TeysUzA+QbWQxPIYrP6UnfDTOMfzGzRzcbDwvdd7RGLOMwrDN1tWT507j3Lj6fZZ5fAAB07L6opZDI8vOqs01OymhbEzICyIUXSzl5mNxVm8/tFGXAfE+i8taXEAaqSWRsTC9xsBiVNaps2s5lxpfGyuiiA5r87e7GfsD5lVGLoVcbSip04mxQxDZrR/mfmsNoHHPq4f8AGWRvcvO8+Zx79eoH7lRq1UvA/JZ8rfM6n24LN6Nhc8GrlHbf/wBW6D1O8oiIqi1UU3qPWeHws34Vzpbl09qtVvO/7/BdfVmVv2sizTeCeGXJW81ix6V4/wD7KyWmdM4zAw7VofMsO6y2ZPakkd6klXGRRxtD5sb5AfcnQLLfVTVEroqawDcC44i+4DU79BxU27VGurf6zGaIEcR9027YaT9gF1p9a62xY83M6Ankrj3pKNkSEfPlI6rY6L2KuHIwttzdfxupBRzDHr3X5Nt4WWg+IlbTnEnGWc3o6wIdUU4HNsUZmeXLZh29qJ7D7x26g9eoWS8KGrpMxpKxpu88/jcO/lYHH2jCSdh9iCPuFacQOHuN1I0ZCi84jP1/bqZGsOV7XjsH7e80+u68/cNMnlNKeIxtXNVm0rN5zqt1kfSORzhuJG/Ilo/ivpqUQ9I9GTQRnFg2gD8wtmAdWkXtqD3LOf1lLVse8fNgSMjfhofuvW6Ii+KX0KItf+IHXWQ4c8M7mqcZTr3LMEsbGxTkhhDjse3Vdbw6cQslxL4eN1JlKNalYdZlh8uBxLdmuIB6oi2SiIiIi8reITjDxV0nxqpae05jCMWPJ8mP8G6X8dzO2d7Y7bfwXpDNagrYHR82pM1HJXgq1RYtMY3mczoC4AeuxKIsyih+E3FPSnE+pdtaWktvjpPbHN+Ih8s7kAjbqd+hVwiIiIiIeylKP844j3pD/wB2qNY35bkKrKlNP9Nc5wHuWsI+itU3yyHh6hZPSWMtO3Qv+zXFVYREVVayKV4jOMtCljwf97tMYfpv1VUpXW/TL4BzvdFzr/BWqL++07r+QWV02f6F432HcSAVURMbGxrGjZrRsF+kRVVqAWwRcN6ZtapLYd2jYXn7Bcyxmqg52nL4b73kO2XuNoc8A6qKpkMcL3jMAnyWI4d1S7Hz5icb2chK6Rzj3DQdmhVSw+ii12lccWdvJAWYUtU4umcTvVXoqMR0UQG4HmTiT3lERFXWgi0P4pMEypf0xrmqwMsU8lDXsPHdzC7dpP02I+63wtV+KVzBwoma7bmferNj/veYP/1a/QMro+kItnU2PI4FU69gfTuvpj4L9+IriLleHXDCLVWFqVbVl9mGLy7G/Jyva4k9PXotHXfFvn5dJUIMNpmC9qiYPfbEccj4IAHENAa3dziRsT2CuvGtuPDpSB7i5U3/APbcubwPaYw9Tg9DnRRgkyORsyumnewF/K13K1oJ7AbfxWS4WJCtjJdLxGZjJag8H8Gay8LYL92OpNYjEZYGvJ3I5T1H0K1VwU45t4fcJKeldPYKxn9U2rkz212tdyRNc4kE8oJcfkB91vfxsAN8P2Ua0AAWINgP76jvARpHExaJu6wlrRS5S3bfAyVzQTFGw7crfhuRuuLqksh4j+NumJ4rmrNBVq2Pe4dJKssII+Ak3IB+oXo/grxS0/xS02cph+evagIZcpSkeZA8/Tu0+hVXqPCYzUWFtYfMVIrdK1GY5Y3tB3BG3T4H5rxN4T5LGk/E/kNLVJ3OqS/iacg36OEfttJ+Y22RFtrj1xuz+iOM2K0nQwmHuVpmV3efZa4ysMkha7lI7dAsr4wdV6wwuiWYzAae/SWNylWVmTs+W534Rns7O3HQdz3Wl/F//WewX+FR/wBYr1Px3/7EdUf+WP8A8giLxd4dNe8RtFYrKwaD0f8AyhhsSsfYf5T3+U4NAA9n4jZe7OG+VzGc0NiMtn8f+jsparNks1eUt8p5HVux6rzl/s6v+reqB6fi4v8ATavVyIiIiIilID+F4kzsPQW6gLfmWkKrUnrgGhkcTnGj2a8/lSn+w7orVJi4s+oEeo81k9MdiJk/0ODu7I+RKrB2RfGODmBzTuCNwV9VVayKX4jxubhob7Bu6nYZL9t+qqF18jVju0Z6kw3ZMwtP3U0EnVyNedFT6QpjU0z4hmRhz081yVZWzwRzMO7JGhzT8iuRSugLsjK8+BuHa5jncmx/Mz8rlVLk8XVSFv8ALLtDVCqgbLqcxuOo7ii47EbZoHxP917S0/QhciFRZK0QCLFSOgrJpS3NN2jyz05C6IH88TuoIVcFN6wwNi++HKYmYV8tU6xPPaQfsO+S62B1rSmnGNzbf0TlG9Hw2PZa8/Frj0IV6WI1A66PE6jUHfyKxqOYUNqSc2A+QnIjQX3jK2uYVai+Mc17Q5rg5p7EHcFfixNDXidLPLHFG0bl73BoH3Ko8Fs3FrrkXnnxJ6hjzmuNL6AoSCRzchFPcDTuAeb2Wn57cx/crjV3Ep12eTT3D6JuYzDgWyW2/wC60x6ve/t077LTXAvAtzvHie/+Mfk4cSHz2Lj+00x9ncfLcnb6L63oPo/4YSVtRh1bSQNbnAE7sct6xa6rExbBFjtGxOnH/wBVp46mCLgMyNvZmSrtH2a9ZjwW/wBX/C/4s/8AqOWx9faN09rrA/oPU1EXaHmtm8ouI9tu+x6fUrl0TpXB6M09DgNPUxTx8Bc6OIHfYuO5/iV8kttau8bX9X/K/wDiYP8A5rz/AOFXjTV4ZVpcHq2taj09kpjNUusiLhFJ2eNvzN33323IK9oa50pgtaaflwGo6YuY+VzXviLtty07gqeg4PcOotGDR501Ulw7ZXSshlHMWPd1LmnuCiKA4keKLh5htOWJNMZF2cy0kRFaKKF7Y2PI6Oe5wAAHfbqVrPwOaIy+W1nkuKGYikbW5ZI6sr27fiJpD7b2792gbjf5rc+K8NXCDH5Bl1mmRO5juYRzyl8e/wDdW26NWrSqR1acEUFeJobHHG0Na0D0ACIvEXi//rPYL/Co/wCsV6w4y0rOS4P6jpU4nSzy4x4Yxo3JO2//ACXX1lwj0Hq7VMGps/hWW8pXEbY5i8gtDHczf3Eq6DQGcm3s7bbfJEXhrwYcU9G8PsbnaOrcg/Hutyxywv8AJe9p5WhpaeUEggj1XtXTWbxuo8FUzeIsfiKFyMSwS8pbztPY7HqFCam4DcKdQ5OXJZHSVP8AEzOLpHxDk5ye5IHqrvTOExum8DTweHrivQpxCKCIHflaOwRFkURERF0s5QjyeKsUZR7MzC0H4H0P713UXWuLSHDMLxJG2VhY8XBwKmtBZGSxj34y4S29j3eVK09yPRypVIavpWsZkY9U4uMvkhHLchb/AMWL4/UKkxGRq5THxXqkokhlG4PwPqD81aqWB35zMj5HUeoWZ0bK6O9HKe0zI/U3Q+h48120RFUWspXWOKuR2otRYZu+Qqj9ZGP+PH6t+qy2m85SzuPbaqP6jpLGfejd6ghZQhSWodL2WXzm9NWBRyXeSM/0Vj5OHx+auRvZMwRyGxGR9Dw46LJlhlpJTPANprvmbx+pvHeNearUUZjtd14LDcfqerJhrvbeUfqn/Nruyrq1iCzEJa00c0Z7OY4OB+4UM1PJD8479DyKuU1ZDUj8t1zqNRzGYXKsbm8His1X8jJ0YbLfQub1H0KySKNr3MO002KnkjZI0teLjioKbhhj2uP6NzeZx7P2IrJIH71wN4S4KeQOzOTy+WA/JYtHlP1AVNqjWGnNNQOlzOXrViO0ZeDI75Bo6lQF7M604isfWwME+l9NOB8/KWhyTzM9fLaew29VtU8lfK3bL9lv1HDwOZPAYrIkpqCJ2y1gc76R7ZAc1N8X9VYzF4PIaM0LDXpVa0ROYvV2gMgZ28oOHeRx2G3zVZ4ZtGO0toJty5D5eQyrhYlDh7TWfkafsSfupDRemcVrDUcGJwVZzNC6fsebNO7qcrcH5nH8zQdyvQbGhrQ1rQ0AbAD0VrpWrFPSihjv2jtOvmd21x1tpgM7r1QwGSX4h2mAtl3fa+uKmdf6rdpuKhUo4+TJ5jKT+RQpscG87gN3Oc49GsaO5+YWv9fZzVjc3ovG6jw8dB9nUEBis0LJkgcAHbxv3AIPUdxsVYcTcFmreQwWptOwxW8lhJ5Hfg5XhgswyAB7Q49Gu9lpBPToVPaog1zrHNaWst0y7D4zGZeK1bZasRumkDQerQ0kBo3+p3XzK2FRZCzjm8Z8ZUfjnPvuxEj2W/OIDGc7t2cnY9fVcF3WOocnqXI4bRmCq348U8RXbl2wYovN23MTNgS5w9TtsD03Xbv4PJy8YcbqBkDTjoMU+vJJzDcSF7iBt37ELAY4ag0dq7UbcRhv5SYvJXTcLalqNk9Od43cyRryPZJ3IPwKIs5w91ta1Pns/hr2EmxVrCviimZI8O5nPaSS0joW9OhHdTuByj4+COoclpLGNx88H410cctku5XtB5pA7vv6gfEL9cIHZibiXr6xm44IrT5KZMUDuZsLfKOzC4dC4DusjofSmXqcLMzpy/GytcvG42PdwcAJQQ0nb6oi7fC7OZ6Xh3XzOrmVYWR0mz/iIpjI6RgaS5z9x0PTsN1j6Gt9Z5HEu1NR0bE7AFjpYWPtBt2aEA7SBnujfbcAnfZdzROLy97htNpHUWGkxMkNI0TL5zJGzAtLfMZyk9Ox2PxWLwdjiHidKs0e/SbbNytXNSvlG2oxVfGG8rHuG/ODttu3buiLr6w1U/VXhuyOqIIZaDrlJ72MDiHxgSFo6+h6LaOMJOOrEnc+U3/ILV0GjdRs8OEmjpoI5M46rLG5geA17zM52+/YAg7radBjoqMEbxs5kbWuHzARFzIiIiIiIi+OAcCCAQe4KiMnQyGkshLl8JC6zjJjzW6Te7D+2wK4QjopoZzEThcHMb1Tq6NtSAb2cMQRmD7bxqsfgsxQzVFtvHztljPcfmYfgR6FZBSOc0g8XnZfTds4rInq8N/opvk5vZdSDW9nEStqawxcuPk32FuJpfA/57jspzSiXtU5vw1Hv3eCrMr3QdisGz+ofKe//HkfEq5RdPG5THZKETULsFlh9Y3grubqm5pabELTa9rxdpuF1shQpZCua96rDYiPdsjQ4KQtcNMMJTNibmQw8h6/zWchu/07K4TdTQ1U0OEbiB5eCrz0VPUG8jATv18c1r9+itVs9mvxCygZ6eYwOK4n8OMreHLl9e56yw9445PLB/cr+1arVYXTWZ4oY29S6RwaB+9QWe4rYWK0cbpqrZ1JlCeVsNJpcwH+0/sAtCnqK6c/lDv2Wi3fbBUpaSihH5hPIucfK+K7uK0BofS7H5SSjAZIW88ly8/zHN29eZ3ZR+VyuY4uXn4HTT58do+J/JfygBa62B3ji+R+KyEGhtTa2tR5DiNeEVBrueLB03kRD4eY4e8Vs+hTq0KcVSnXjr14mhsccbQ1rQPQAKSSqFO7bc/rJd+bW8t58hxXuKn61uy1uxHuyJ57h58l19P4fHYHEVsViqzK1SswMjjaO3zPxK76IsZzi4lzjclaYAaLBERF5XUUlqPQeNyuafnKl/JYbKSxiKezj7LojOwdg8Do7b0J7KtREWF0jpnFaXx8lTGRyF00hmsTzSGSaeQ93veerj9VmkRERERERERERERERERERERERcc8EM8Top4mSxu7te3cH7LkRMlwgHAqPyfDnTdqY2KkM2MsE7+ZSlMZ3+g6LonR2rKh2xeu7wYPdbajbL/mFfIrjekKgCxdccQD97qg7oulJu1uyf0kt+1lAOw3FAeyzV2MI+LqI3XFJpPiDc6XeIDoWnuKlVrD+/ZbERe/xGQZNaP2t9k/DYtXOP7ne613BwmwU8wm1Bkctn5B12uWnFm/90HZW2Gw+Lw1UVcVj61KEflhjDQfrt3XeRQzVk84tI8kbtPDJWIaSGE3jaAd+vjmiIirKwiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIv/2Q==';
// ── Normalise memo data before PDF render ────────────────────────
// Rebuilds sections[] from raw item fields when sections is empty.
// This ensures PDF output is identical whether generated at create-time
// or downloaded later from History/Pending tab.
function _normalisePdfData(data) {
  const d = Object.assign({}, data, { sections: (data.sections || []).slice() });

  function _tbl(headers, rows, numericIdx) {
    const thStyle = 'background:#e8e8e8;color:#111;font-weight:600;padding:5px 8px;border:1px solid #ccc;font-size:12pt;text-align:center';
    const ths = headers.map(h => `<th style="${thStyle}">${h}</th>`).join('');
    const trs = rows.map(r => `<tr>${r.map((c, i) => {
      const align = numericIdx.includes(i) ? 'right' : i <= 1 ? 'left' : 'center';
      return `<td style="padding:6px 8px;border:1px solid #ccc;font-size:12pt;text-align:${align}">${c ?? ''}</td>`;
    }).join('')}</tr>`).join('');
    return `<table style="width:100%;border-collapse:collapse"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  // Account PDF: omit unnamed application columns and require a real email row.
  d.sections = d.sections.flatMap(section => {
    if(section.title !== 'ตาราง Account' || !section.html) return [section];
    const doc = new DOMParser().parseFromString(section.html, 'text/html');
    const headers = Array.from(doc.querySelectorAll('thead th')).map(th => th.textContent.trim());
    const keep = headers.map((header, i) => i === 0 || header ? i : -1).filter(i => i >= 0);
    const rows = Array.from(doc.querySelectorAll('tbody tr')).map(row =>
      Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim())
    ).filter(row => row[0] && row[0] !== '-' && row[0] !== '—');
    if(keep.length < 2 || !rows.length) return [];
    return [{ title:section.title, html:_tbl(keep.map(i => headers[i]), rows.map(row => keep.map(i => row[i] || '')), []) }];
  });

  // SL — rebuild from slItems if no software section
  if (d.type === 'sl' && !(d.sections.find(s => s.title === 'รายการ Software')) && (d.slItems||[]).length) {
    const rows = d.slItems.map((it, i) => [
      i+1, it.name||'—', it.plan||'—',
      it.price ? money(it.price) : '—',
      it.months||'—', it.qty||'—',
      it.startMonth||'—', it.endMonth||'—',
      (it.price&&it.months&&it.qty) ? money(it.price*it.months*it.qty) : '—',
    ]);
    d.sections.unshift({ title:'รายการ Software', html: _tbl(
      ['#','ชื่อ Software','Plan','฿/เดือน','เดือน','จำนวน','เริ่ม','สิ้นสุด','รวม'], rows, [3,8]
    )});
  }

  // HW — rebuild from hwItems if no hardware section
  if (d.type === 'hw' && !(d.sections.find(s => s.title === 'รายการ Hardware')) && (d.hwItems||[]).length) {
    const rows = d.hwItems.map((it, i) => [
      i+1, it.name||'—',
      it.price ? money(it.price) : '—',
      it.qty||'—',
      (it.price&&it.qty) ? money(it.price*it.qty) : '—',
    ]);
    d.sections.push({ title:'รายการ Hardware', html: _tbl(
      ['#','ชื่ออุปกรณ์','ราคา/ชิ้น','จำนวน','รวม'], rows, [2,4]
    )});
  }

  return d;
}

async function downloadMemoPdf(data) {
  // ── Ensure sections are populated before PDF render ──────────────
  data = _normalisePdfData(data);

  // ── Preload signatures for all approvers ─────────────────────────
  // Also include legacy reviewerName/approverName fields used in PDF arr construction
  if (typeof _preloadSignatures === 'function') {
    const approversList = [...(data.approvers || [])];
    // Add legacy reviewer/approver if they have names not already in list
    if (data.reviewerName && data.reviewerName !== '-') {
      if (!approversList.find(a => a.name === data.reviewerName)) {
        approversList.push({ name: data.reviewerName, status: 'pending' });
      }
    }
    if (data.approverName && data.approverName !== '-') {
      if (!approversList.find(a => a.name === data.approverName)) {
        approversList.push({ name: data.approverName, status: 'pending' });
      }
    }
    await _preloadSignatures(approversList);
  }

  const stage = document.getElementById('pdf-stage');
  stage.innerHTML = renderMemoPdf(data);
  // File naming: [TYPE]_[MemoNo]_[Project]_[Extra]_[Date].Ver1.0.0
  const typeTag = ({ sl:'SL', hw:'HW', int:'INT', ent:'EXT', dep:'DEP' }[data.type] || data.type?.toUpperCase() || 'MEMO');
  const proj    = (data.project || '').replace(/\s+/g,'');
  const memoNo  = (data.memoNo  || 'memo').replace(/\s+/g,'');
  const dateStr = (data.date    || new Date().toISOString().slice(0,10)).replace(/\//g,'-').replace(/\s.*/,'');

  let extra = '';
  if(data.type === 'sl') {
    // Read first software name from memo sections data, NOT from live form DOM
    const slSection = (data.sections||[]).find(s => s.title === 'รายการ Software');
    let firstName = '';
    if (slSection?.html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = slSection.html;
      const firstTd = tmp.querySelector('tbody tr td:nth-child(2)');
      firstName = firstTd?.textContent?.trim() || '';
    }
    // Fallback to slItems array
    if (!firstName) {
      firstName = (data.slItems||[]).find(it => it.name && it.name !== '-')?.name || '';
    }
    extra = firstName ? '_' + firstName.replace(/\s+/g,'') : '';
  }

  const filename = `[${typeTag}]_${memoNo}_${proj}${extra}_${dateStr}.Ver1.0.0.pdf`;
  async function fetchWithRetry(url, opts, ms=55000, retries=2) {
    for(let i=0; i<=retries; i++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try {
        const r = await fetch(url, {...opts, signal:ctrl.signal});
        clearTimeout(t); return r;
      } catch(e) { clearTimeout(t); if(i===retries) throw e; await new Promise(r=>setTimeout(r,2000)); }
    }
  }
  // ── Show loading indicator ────────────────────────────────────────
  const loadingEl = document.createElement('div');
  loadingEl.id = 'pdf-loading-overlay';
  loadingEl.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center';
  loadingEl.innerHTML = '<div style="background:#fff;border-radius:12px;padding:28px 36px;text-align:center;font-family:\'IBM Plex Sans Thai\',sans-serif">'
    + '<div style="font-size:15px;font-weight:600;color:#185FA5;margin-bottom:8px">⏳ กำลังสร้าง PDF...</div>'
    + '<div id="pdf-loading-msg" style="font-size:12px;color:#666">กรุณารอสักครู่</div>'
    + '</div>';
  document.body.appendChild(loadingEl);
  const setMsg = msg => { const el = document.getElementById('pdf-loading-msg'); if(el) el.textContent = msg; };

  try {
    setMsg('กำลังติดต่อ PDF server...');
    const html = stage.firstElementChild?.outerHTML || stage.innerHTML;
    console.log('[PDF] Sending to server, html length:', html.length, 'filename:', filename);
    const resp = await fetchWithRetry('https://memo-pdf-server.onrender.com/generate-pdf', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ html, filename, logoBase64: LOGO_B64 })
    });
    if(!resp.ok) throw new Error('Server '+resp.status);
    setMsg('กำลัง download...');
    const blob = await resp.blob();
    console.log('[PDF] Received blob, size:', blob.size, 'bytes');
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a'); a.href=url; a.download=filename; a.click();
    URL.revokeObjectURL(url);
    console.log('[PDF] Download triggered:', filename);
  } catch(err) {
    console.warn('[PDF] Server failed, fallback to print:', err.message);
    setMsg('Server ไม่ตอบสนอง — เปิด Print dialog แทน');
    await new Promise(r => setTimeout(r, 800));
    document.body.classList.add('printing-pdf');
    try { window.print(); } finally { document.body.classList.remove('printing-pdf'); }
  } finally {
    loadingEl.remove();
  }
}
function openMemoPdf(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if(!memo) { alert('ไม่พบ Memo'); return; }
  downloadMemoPdf(memo);
}

// ── Init ──
// ── Shared CSV export helper ──────────────────────────────────────
// UTF-8 CSV with BOM so Excel opens Thai text correctly
function _downloadCSV(filename, headers, rows) {
  const esc = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename + '_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Sidebar collapse ──────────────────────────────────────────────
function toggleSidebar() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  const collapsed = sb.classList.toggle('collapsed');
  try { localStorage.setItem('orbit-sb-collapsed', collapsed ? '1' : '0'); } catch(e) {}
}
function initSidebarState() {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  try {
    const savedState = localStorage.getItem('orbit-sb-collapsed');
    const compactScreen = window.matchMedia?.('(max-width: 700px)').matches;
    if (savedState === '1' || (savedState === null && compactScreen)) sb.classList.add('collapsed');
  } catch(e) {}
}

function initApp() {
  ['f-date','f-signdate','f-apprdate','sl-ratedate'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = todayISO;
  });

  renderPendingMemos();
  renderHistoryMemos();
  rebuildAcct();
  setInterval(() => fetch('https://memo-pdf-server.onrender.com/ping').catch(()=>{}), 4*60*1000);

  // Load all Supabase data on startup in parallel
  Promise.all([
    loadMemosAsync(),
    loadUserProfilesAsync(),
    loadAuthorityAsync(),
    typeof loadManualLicensesAsync === 'function' ? loadManualLicensesAsync() : Promise.resolve(),
    typeof loadInfraCostsAsync     === 'function' ? loadInfraCostsAsync()     : Promise.resolve(),
    typeof loadBudgetsAsync        === 'function' ? loadBudgetsAsync()        : Promise.resolve(),
    typeof loadDevicesAsync        === 'function' ? loadDevicesAsync()        : Promise.resolve(),
    typeof loadPurchaseOrdersAsync === 'function' ? loadPurchaseOrdersAsync() : Promise.resolve(),
    typeof initSettings            === 'function' ? initSettings()            : Promise.resolve(),
  ]).then(() => {
    renderPendingMemos();
    renderHistoryMemos();
    if(typeof refreshApproverDropdowns === 'function') refreshApproverDropdowns();
  }).catch(e => console.warn('Supabase init load failed', e));
}
