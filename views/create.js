// ─────────────────────────────────────────
// views/create.js — form, type, validate, PDF collect
// ─────────────────────────────────────────

let selectedType = null;
let _editingSourceMemoNo = null;
let _editingDraftMemoNo = null;

// collectMemoData() stores dates via dateInput() as print-ready Thai Buddhist-
// calendar text (e.g. "3 กรกฎาคม พ.ศ. 2569"), not ISO — so restoring a saved
// memo into an <input type="date"> needs the reverse conversion.
function thaiDateToISO(str) {
  if (!str || typeof str !== 'string') return '';
  const m = str.match(/^(\d{1,2})\s+(\S+)\s+พ\.ศ\.\s+(\d{4})$/);
  if (!m) return '';
  const monthIdx = MONTHS_TH.indexOf(m[2]);
  if (monthIdx < 0) return '';
  const yyyy = String(parseInt(m[3], 10) - 543).padStart(4, '0');
  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(parseInt(m[1], 10)).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
const TYPE_LABELS = { sl:'Software License', hw:'Hardware', int:'Team Activity', ent:'Client Expense', dep:'Deployment' };
const TYPE_CFG = {
  sl:  { title:'รายการ Software *', to:'ประธานเจ้าหน้าที่บริหาร', apprTitle:'ประธานเจ้าหน้าที่บริหาร',
         reasons:['เป็นโปรแกรมที่ได้รับการอนุมัติและใช้งานอยู่เดิม เพื่อให้การดำเนินโครงการเป็นไปอย่างต่อเนื่องและมีประสิทธิภาพ','เป็นโปรแกรมใหม่ที่จำเป็นต้องใช้เพื่อพัฒนาโครงการ','เพื่ออัปเกรดการใช้งานโปรแกรมให้รองรับการทำงานของทีมที่เพิ่มขึ้น'] },
  hw:  { title:'รายการ Hardware *', to:'ประธานเจ้าหน้าที่บริหาร', apprTitle:'ประธานเจ้าหน้าที่บริหาร',
         reasons:['เพื่อใช้ในการพัฒนาและทดสอบระบบของโครงการ','เพื่อทดแทนอุปกรณ์เดิมที่เสื่อมสภาพและไม่สามารถใช้งานได้','เพื่อรองรับการขยายทีมและเพิ่มประสิทธิภาพการทำงาน'] },
  int: { title:'รายชื่อผู้เข้าร่วม *', to:'Project director โครงการ', apprTitle:'ผู้อำนวยการโครงการ',
         reasons:['เพื่อเสริมสร้างกำลังใจในการปฏิบัติงาน และส่งเสริมการทำงานเป็นทีม','เพื่อเสริมสร้างความสัมพันธ์ในทีมและพัฒนาการทำงานร่วมกัน'] },
  ent: { title:'รายละเอียดงานเลี้ยงรับรอง', to:'ประธานเจ้าหน้าที่บริหาร', apprTitle:'ประธานเจ้าหน้าที่บริหาร',
         reasons:['เพื่อขอบคุณลูกค้าในโครงการ','เพื่อเสริมสร้างความสัมพันธ์กับลูกค้า'] },
  dep: { title:'รายละเอียด Deployment', to:'ผู้อำนวยการโครงการ', apprTitle:'ผู้อำนวยการโครงการ',
         reasons:['เพื่อความละเอียดในการเบิกแยก Online / Onsite','เพื่อสนับสนุนการ Deployment ให้เป็นไปอย่างราบรื่นและมีประสิทธิภาพ'] }
};

function selectType(type, btn) {
  // If already have a type selected, confirm before clearing
  if(selectedType && selectedType !== type) {
    if(!confirm('การเปลี่ยนประเภท Memo จะล้างข้อมูลที่กรอกไว้ทั้งหมด\nต้องการดำเนินการต่อไหม?')) return;
    // Clear all form fields
    document.querySelectorAll('#form-body input[type="text"], #form-body input[type="number"], #form-body input[type="date"], #form-body textarea').forEach(el => {
      el.value = '';
      if(el.classList.contains('acct-col')) delete el.dataset.manual;
    });
    document.querySelectorAll('#form-body select').forEach(el => { el.selectedIndex = 0; });
    // Reset subject manual edit flag
    const subjectEl = document.getElementById('f-subject');
    if(subjectEl) { subjectEl.value = ''; subjectEl.dataset.manualEdit = 'false'; }
    // Reset SL/HW rows to single empty row
    const slRows = document.getElementById('sl-rows');
    if(slRows) { slRows.innerHTML = ''; addSLRow(); }
    const hwRows = document.getElementById('hw-rows');
    if(hwRows) { hwRows.innerHTML = ''; addHWRow(); }
    // Reset name lists
    ['int-names','ent-names'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.innerHTML = '';
    });
    // Reset DEP items
    const depItems = document.getElementById('dep-items');
    if(depItems) depItems.innerHTML = '';
    // Reset totals
    ['sl-total','hw-total','int-total','ent-total','dep-total'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.textContent = '฿0';
    });
  }
  selectedType = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.querySelectorAll('.fs').forEach(s => s.classList.remove('active'));
  document.getElementById('fs-'+type).classList.add('active');
  const cfg = TYPE_CFG[type];
  document.getElementById('detail-title').textContent = cfg.title;
  // Use settings if available, fallback to TYPE_CFG defaults
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const sCfg = s?.typeCfg?.[type];
  // Set เรียน dropdown to matching option if exists, else blank
  const toSel = document.getElementById('f-to');
  if(toSel) {
    const toDefault = sCfg?.to || cfg.to;
    const matchOpt = [...toSel.options].find(o => o.value === toDefault || o.textContent === toDefault);
    toSel.value = matchOpt ? matchOpt.value : '';
    document.getElementById('to-other-wrap') && (document.getElementById('to-other-wrap').style.display = 'none');
  }
  // Always reset approver title to blank — user must choose
  const apprTitleSel = document.getElementById('f-appr-title');
  if(apprTitleSel) { apprTitleSel.value = ''; }
  const apprTitleOther = document.getElementById('f-appr-title-other');
  if(apprTitleOther) { apprTitleOther.style.display = 'none'; apprTitleOther.value = ''; }
  const rs = document.getElementById('f-reason');
  rs.innerHTML = '<option value="">— เลือกเหตุผล —</option>';
  (sCfg?.reasons || cfg.reasons).forEach(r => { const o=document.createElement('option'); o.value=r; o.textContent=r; rs.appendChild(o); });
  rs.innerHTML += '<option value="other">อื่นๆ (กรอกเอง)</option>';
  // Apply default reviewer/approver from settings
  if(s?.defaultReviewer?.name) {
    const revNameSel = document.getElementById('f-reviewer-name');
    if(revNameSel && !revNameSel.value) {
      // Check if name exists in options
      const opt = [...revNameSel.options].find(o => o.value === s.defaultReviewer.name);
      if(opt) revNameSel.value = s.defaultReviewer.name;
    }
    const revTitleSel = document.getElementById('f-reviewer-title');
    if(revTitleSel && !revTitleSel.value && s.defaultReviewer.title) {
      const opt = [...revTitleSel.options].find(o => o.value === s.defaultReviewer.title);
      if(opt) revTitleSel.value = s.defaultReviewer.title;
    }
    if(s.defaultApprover?.name) {
      const apprNameSel = document.getElementById('f-approver-name');
      if(apprNameSel && !apprNameSel.value) {
        const opt = [...apprNameSel.options].find(o => o.value === s.defaultApprover.name);
        if(opt) apprNameSel.value = s.defaultApprover.name;
      }
    }
  }
  document.getElementById('form-hint').style.display = 'none';
  document.getElementById('form-body').style.display = 'block';
  document.getElementById('acct-card').style.display = type==='sl' ? 'block' : 'none';
  document.getElementById('rev-num').textContent = type==='sl' ? '5' : '4';
  // Init DEP items if switching to dep
  if (type === 'dep') setTimeout(initDepItems, 50);
  setTimeout(initApproverRows, 50);
}

function toggleOtherProject() {
  const sel = document.getElementById('f-project');
  const wrap = document.getElementById('project-other-wrap');
  if(wrap) wrap.style.display = sel.value==='other' ? 'block' : 'none';
  if(sel.value==='other') document.getElementById('f-project-other')?.focus();
}
function toggleOther() {
  const sel = document.getElementById('f-reason');
  document.getElementById('other-wrap').style.display = sel.value==='other' ? 'block' : 'none';
}

// ── Calculations ──
// Milestone 2 Task 2.1 — running totals must reflect the memo's own selected
// currency, never a hardcoded ฿ symbol (no FX conversion — THB and USD stay
// as entered).
function currentCurrencySymbol() {
  return document.getElementById('f-currency')?.value === 'USD' ? '$' : '฿';
}
function onCurrencyChange() {
  // Re-run whichever type's calc is active so the total symbol refreshes immediately.
  if (selectedType === 'sl') calcSL();
  else if (selectedType === 'hw') calcHW();
  else if (selectedType === 'int') calcINT();
  else if (selectedType === 'dep') calcDepGrand();
}
function calcSL() {
  let t = 0;
  document.querySelectorAll('#sl-rows .item-row').forEach(r => {
    t += (parseFloat(r.querySelector('.sl-price')?.value)||0) *
         (parseInt(r.querySelector('.sl-mo')?.value)||0) *
         (parseInt(r.querySelector('.sl-qty')?.value)||0);
  });
  document.getElementById('sl-total').textContent = currentCurrencySymbol()+t.toLocaleString('th-TH');
}
function calcHW() {
  let t = 0;
  document.querySelectorAll('#hw-rows .item-row').forEach(r => {
    t += (parseFloat(r.querySelector('.hw-price')?.value)||0) *
         (parseInt(r.querySelector('.hw-qty')?.value)||0);
  });
  document.getElementById('hw-total').textContent = currentCurrencySymbol()+t.toLocaleString('th-TH');
}
function calcINT() {
  const pp = parseFloat(document.getElementById('int-pp')?.value)||0;
  const n  = document.querySelectorAll('.int-name').length;
  document.getElementById('int-total').textContent = currentCurrencySymbol()+(pp*n).toLocaleString('th-TH');
  checkIntHeadcount();
}

// ── Row helpers ──
const TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
function rmRow(btn, cid) {
  const c = document.getElementById(cid);
  if(c.querySelectorAll('.item-row').length > 1) btn.closest('.item-row').remove();
  if(cid === 'sl-rows') syncAcctColsFromSoftware();
}
// ── Normalize: trim + title case for consistent storage ──
function normalizeSLText(str) {
  if (!str) return '';
  return str.trim().replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

// ── Gather existing license names and plans from all SL memos ──
function getExistingSLSuggestions() {
  const memos = loadMemos().filter(m => m.type === 'sl');
  const names = new Set();
  const plans = new Set();
  memos.forEach(m => {
    (m.slItems || []).forEach(it => {
      if (it.name && it.name !== '-') names.add(normalizeSLText(it.name));
      if (it.plan) plans.add(normalizeSLText(it.plan));
    });
  });
  return { names: [...names].sort(), plans: [...plans].sort() };
}

// ── Attach typeahead to an input using a suggestion list ──
function attachTypeahead(input, suggestions, datalistId) {
  let dl = document.getElementById(datalistId);
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = datalistId;
    document.body.appendChild(dl);
  }
  dl.innerHTML = suggestions.map(s => `<option value="${s}">`).join('');
  input.setAttribute('list', datalistId);
  input.addEventListener('blur', () => {
    input.value = normalizeSLText(input.value);
  });
}

function addSLRow() {
  const d = document.createElement('div'); d.className='item-row'; d.style.gridTemplateColumns='2fr 1.2fr 1.2fr 0.8fr 0.8fr 1fr 1fr 30px';
  d.innerHTML = `<input class="ri sl-name" type="text" placeholder="ชื่อ Software"><input class="ri sl-plan" type="text" placeholder="Plan (เช่น Pro, Business)"><input class="ri sl-price" type="number" placeholder="ราคา" oninput="calcSL()"><input class="ri sl-mo" type="number" value="12" oninput="calcSL()"><input class="ri sl-qty" type="number" placeholder="จำนวน" oninput="calcSL()"><input class="ri sl-start" type="month" placeholder="YYYY-MM"><input class="ri sl-end" type="month" placeholder="YYYY-MM"><button class="rm-btn" onclick="rmRow(this,'sl-rows');calcSL()" title="ลบ">${TRASH}</button>`;
  document.getElementById('sl-rows').appendChild(d);
  const sugg = getExistingSLSuggestions();
  attachTypeahead(d.querySelector('.sl-name'), sugg.names, 'dl-sl-names');
  attachTypeahead(d.querySelector('.sl-plan'), sugg.plans, 'dl-sl-plans');
  d.querySelector('.sl-name').addEventListener('input', syncAcctColsFromSoftware);
  d.querySelector('.sl-name').addEventListener('blur', syncAcctColsFromSoftware);
  syncAcctColsFromSoftware();
}
function addHWRow() {
  const d = document.createElement('div'); d.className='item-row'; d.style.gridTemplateColumns='3fr 1.4fr 1fr 30px';
  d.innerHTML = `<input class="ri" type="text" placeholder="ชื่ออุปกรณ์"><input class="ri hw-price" type="number" placeholder="ราคา" oninput="calcHW()"><input class="ri hw-qty" type="number" placeholder="จำนวน" oninput="calcHW()"><button class="rm-btn" onclick="rmRow(this,'hw-rows');calcHW()" title="ลบ">${TRASH}</button>`;
  document.getElementById('hw-rows').appendChild(d);
}
// ── DEP items — two types: calc (price×qty) and text (free text) ──
function _depItemNum() {
  return document.querySelectorAll('#dep-items .dep-row').length + 1;
}

function addDepCalcItem() {
  const container = document.getElementById('dep-items');
  if (!container) return;
  const qty = parseInt(document.getElementById('dep-emp-count')?.value) || 0;
  const n   = _depItemNum();
  const row = document.createElement('div');
  row.className = 'dep-row dep-calc-row';
  row.style.cssText = 'margin-bottom:8px';
  row.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <span style="font-size:11px;color:var(--text-3);min-width:18px">${n}.</span>
      <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#E6F1FB;color:#0C447C;font-weight:500">คำนวณ</span>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;align-items:center">
      <input class="ri dep-item-name" type="text" placeholder="ชื่อรายการ เช่น ค่าอาหารมื้อหลัก" style="font-size:12px">
      <input class="ri dep-item-price" type="number" placeholder="ราคา/หัว (฿)" min="0" style="font-size:12px" oninput="calcDepRow(this)">
      <input class="ri dep-item-qty dep-qty-auto" type="number" placeholder="จำนวนคน" min="1" value="${qty||''}" style="font-size:12px" oninput="calcDepRow(this)">
      <input class="ri dep-item-total" type="text" readonly style="background:var(--bg);font-weight:600;font-size:12px" placeholder="฿0">
      <button class="rm-btn" onclick="rmDepRow(this)" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
    </div>`;
  container.appendChild(row);
}

function addDepTextItem() {
  const container = document.getElementById('dep-items');
  if (!container) return;
  const n = _depItemNum();
  const row = document.createElement('div');
  row.className = 'dep-row dep-text-row';
  row.style.cssText = 'margin-bottom:8px';
  row.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
      <span style="font-size:11px;color:var(--text-3);min-width:18px">${n}.</span>
      <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#F1EFE8;color:#444441;font-weight:500">ขอสนับสนุน</span>
      <span style="font-size:10px;color:var(--text-3)">ไม่ระบุจำนวนเงิน</span>
      <button class="rm-btn" onclick="rmDepRow(this)" title="ลบ" style="margin-left:auto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
    </div>
    <textarea class="ri dep-item-text" rows="2" style="width:100%;font-size:12px;resize:vertical" placeholder="อธิบายรายการที่ขอสนับสนุน เช่น ขอสนับสนุนอุปกรณ์อิเล็กทรอนิกส์ รายละเอียดตามใบแจ้งอุปกรณ์..."></textarea>`;
  container.appendChild(row);
}

function rmDepRow(btn) {
  btn.closest('.dep-row').remove();
  depRenumber();
  calcDepGrand();
}

function depRenumber() {
  document.querySelectorAll('#dep-items .dep-row').forEach((row, i) => {
    const numEl = row.querySelector('span:first-child');
    if (numEl && numEl.style.minWidth) numEl.textContent = (i + 1) + '.';
  });
}

function calcDepRow(inp) {
  const row   = inp.closest('.dep-calc-row');
  if (!row) return;
  const price = parseFloat(row.querySelector('.dep-item-price')?.value) || 0;
  const qty   = parseInt(row.querySelector('.dep-item-qty')?.value)   || 0;
  const total = price * qty;
  const totalInp = row.querySelector('.dep-item-total');
  if (totalInp) totalInp.value = total > 0 ? currentCurrencySymbol() + total.toLocaleString() : '';
  calcDepGrand();
}

function calcDepGrand() {
  let grand = 0;
  document.querySelectorAll('#dep-items .dep-calc-row').forEach(row => {
    const price = parseFloat(row.querySelector('.dep-item-price')?.value) || 0;
    const qty   = parseInt(row.querySelector('.dep-item-qty')?.value)   || 0;
    grand += price * qty;
  });
  const grandEl = document.getElementById('dep-grand-total');
  if (grandEl) grandEl.textContent = currentCurrencySymbol() + grand.toLocaleString();
  const totalEl = document.getElementById('dep-total');
  if (totalEl) { totalEl.value = grand; totalEl.dispatchEvent(new Event('input')); }
  // updateTotal() removed — function does not exist; dep-total input event handles display
}

function depSyncQty() {
  const n = parseInt(document.getElementById('dep-emp-count')?.value) || 0;
  document.querySelectorAll('#dep-items .dep-qty-auto').forEach(inp => {
    if (!inp.dataset.edited) { inp.value = n; calcDepRow(inp); }
  });
}

// Init one calc row on form load
function initDepItems() {
  const container = document.getElementById('dep-items');
  if (!container || container.children.length > 0) return;
  addDepCalcItem();
}

function addName(cid, cls, doCalc) {
  const c = document.getElementById(cid);
  const n = c.querySelectorAll('.row-name').length + 1;
  const d = document.createElement('div'); d.className='row-name';
  const calc = doCalc ? ';calcINT()' : '';
  d.innerHTML = `<span class="name-num">${n}.</span><input class="ri ${cls}" type="text" placeholder="ชื่อ-นามสกุล ตำแหน่ง" oninput="${doCalc?'calcINT()':''}"><button class="rm-btn" onclick="rmName(this,'${cid}')${calc}" title="ลบ">${TRASH}</button>`;
  c.appendChild(d);
}
function rmName(btn, cid) {
  const c = document.getElementById(cid);
  if(c.querySelectorAll('.row-name').length > 1) btn.closest('.row-name').remove();
  c.querySelectorAll('.name-num').forEach((el,i) => el.textContent=(i+1)+'.');
}

// ── Account table ──
function getAcctCols() { return Array.from(document.querySelectorAll('.acct-col')).map(i=>i.value.trim()).filter(c=>c); }
function getAcctColEntries() {
  return Array.from(document.querySelectorAll('.acct-col'))
    .map((input, index) => ({ name:input.value.trim(), index }))
    .filter(col => col.name);
}
function markAcctColEdited(input) {
  input.dataset.manual = 'true';
  rebuildAcct();
}
function syncAcctColsFromSoftware() {
  const names = getSlAccountSoftwareNames();
  const wrap = document.getElementById('acct-cols');
  if(!wrap) return;
  while(wrap.querySelectorAll('.acct-col').length < Math.max(5, names.length)) {
    const input = document.createElement('input');
    input.className = 'ri acct-col';
    input.type = 'text';
    input.placeholder = `Application ${wrap.querySelectorAll('.acct-col').length + 1}`;
    input.style.cssText = 'font-size:11px;padding:5px 7px';
    input.addEventListener('input', () => markAcctColEdited(input));
    wrap.appendChild(input);
  }
  Array.from(wrap.querySelectorAll('.acct-col')).forEach((input, i) => {
    if(input.dataset.manual === 'true') return;
    input.value = names[i] || '';
  });
  rebuildAcct();
}
function rebuildAcct() {
  const cols = getAcctColEntries(); const show = cols.length ? cols : [{name:'Col 1', index:0}];
  const head = document.getElementById('acct-head');
  const body = document.getElementById('acct-body');
  head.innerHTML = `<tr style="background:var(--bg)"><th style="padding:6px 10px;text-align:left;border:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase">Email</th>${show.map(c=>`<th style="padding:6px 10px;text-align:center;border:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-3);width:80px">${c.name}</th>`).join('')}<th style="width:36px;border:1px solid var(--border)"></th></tr>`;
  Array.from(body.querySelectorAll('tr')).forEach(tr => {
    const email = tr.querySelector('.acct-email')?.value||'';
    const vals = {};
    tr.querySelectorAll('.acct-val').forEach(input => { vals[Number(input.dataset.colIndex)] = input.checked ? '✓' : ''; });
    tr.innerHTML = _buildAcctRow(email, vals, show);
  });
  if(!body.children.length) addAcctRow();
}
function _buildAcctRow(email, vals, cols) {
  const entries = Array.isArray(cols) ? cols : Array.from({length:cols}, (_, index) => ({index}));
  let h = `<td style="padding:3px 6px;border:1px solid var(--border)"><input type="text" class="ri acct-email" placeholder="email@orbitdigital.co.th" value="${email}" style="font-size:11px;padding:3px 7px"></td>`;
  entries.forEach((col, i) => {
    const value = Array.isArray(vals) ? vals[i] : vals[col.index];
    h += `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center"><input type="checkbox" class="acct-val" data-col-index="${col.index}" aria-label="ใช้งาน Application"${value==='Y'||value==='✓'?' checked':''} style="width:18px;height:18px;accent-color:var(--blue);cursor:pointer"></td>`;
  });
  h += `<td style="padding:3px 4px;border:1px solid var(--border);text-align:center"><button class="rm-btn" onclick="this.closest('tr').remove()" style="width:24px;height:24px" title="ลบ">${TRASH}</button></td>`;
  return h;
}
function addAcctRow(email) {
  const cols = getAcctColEntries();
  const tr = document.createElement('tr');
  tr.innerHTML = _buildAcctRow(email||'', [], cols.length ? cols : [{name:'Col 1', index:0}]);
  document.getElementById('acct-body').appendChild(tr);
}

// ── Collect & Validate ──
function selectedReason() {
  const r = val('#f-reason');
  return r==='other' ? val('#f-reason-other') : r;
}
function memoSubject(data) {
  if(data.subject) return data.subject;
  const p = data.project || 'โครงการ';
  switch(data.type) {
    case 'sl':  return `ขออนุมัติงบประมาณเพื่อการจัดซื้อโปรแกรมสำหรับการพัฒนาในโครงการ ${p} โดยชำระเงินผ่านบัตรเครดิตบริษัท Orbit Digital 0321`;
    case 'hw': {
      const hwFirst = document.querySelector('#fs-hw .hw-rows input[type="text"]')?.value?.trim() || 'Hardware';
      return `ขออนุมัติงบประมาณค่าใช้จ่ายเพื่อจัดซื้อ${hwFirst} สำหรับโครงการ ${p}`;
    }
    case 'int': return `ขออนุมัติงบประมาณจัดกิจกรรมของทีม ${p}`;
    case 'ent': {
      const client = document.querySelector('#fs-ent input')?.value?.trim() || 'ลูกค้า';
      return `ขออนุมัติงบประมาณค่าใช้จ่ายเลี้ยงรับรองลูกค้า ${client}`;
    }
    case 'dep': {
      const start    = document.getElementById('dep-start')?.value ? dateInput(document.getElementById('dep-start').value) : 'วันที่เริ่ม';
      const end      = document.getElementById('dep-end')?.value   ? dateInput(document.getElementById('dep-end').value)   : 'วันที่สิ้นสุด';
      const location = document.getElementById('dep-location')?.value.trim();
      const locStr   = location ? ` ณ ${location}` : '';
      return `ขออนุมัติงบประมาณค่าใช้จ่ายสำหรับพนักงานที่ปฏิบัติการ Deployment ของ ${p}${locStr} ในวันที่ ${start} – ${end}`;
    }
    default: return 'ขออนุมัติ Memo';
  }
}

// Auto-update subject field when key inputs change
function updateSubjectPreview() {
  const subjectEl = document.getElementById('f-subject');
  if(!subjectEl || subjectEl.dataset.manualEdit === 'true') return;
  subjectEl.placeholder = memoSubject({ type: selectedType, project: val('#f-project')==='other' ? val('#f-project-other') : val('#f-project') });
}

function collectMemoData() {
  // เรียน: auto-derive from title of last approver (A2 or A3)
  // Read approvers first to determine last approver title
  const _toApprRows = document.querySelectorAll('#approver-rows-form .appr-form-row');
  const _toApprArr  = Array.from(_toApprRows).map(row => {
    const titleSel = row.querySelector('.appr-title-sel');
    const titleOth = row.querySelector('.appr-title-other');
    return titleSel?.value === 'other' ? (titleOth?.value.trim()||'') : (titleSel?.value||'');
  }).filter(Boolean);
  const toVal = _toApprArr.length > 0 ? _toApprArr[_toApprArr.length - 1] : 'ประธานเจ้าหน้าที่บริหาร';

  // Read reviewer name/title from dropdowns
  const revNameSel = document.getElementById('f-reviewer-name');
  // Read approvers from dynamic rows
  const approverRows = document.querySelectorAll('#approver-rows-form .appr-form-row');
  const approversArr = Array.from(approverRows).map(row => {
    const nameSel  = row.querySelector('.appr-name-sel');
    const nameOth  = row.querySelector('.appr-name-other');
    const titleSel = row.querySelector('.appr-title-sel');
    const titleOth = row.querySelector('.appr-title-other');
    const name  = nameSel?.value === 'other' ? (nameOth?.value.trim() || '') : (nameSel?.value || '');
    const title = titleSel?.value === 'other' ? (titleOth?.value.trim() || '') :
                  titleSel?.value ? titleSel.value :
                  (titleOth?.value.trim() || titleSel?.dataset?.autofill || '');
    const profile = typeof findUserByName === 'function' ? findUserByName(name) : null;
    return { profileId: profile?.id || null, name, title, status: 'pending', approvedAt: null, approvedBy: null };
  }).filter(a => a.name);

  // Backward compat aliases
  const revName   = approversArr[0]?.name  || '';
  const revTitle  = approversArr[0]?.title || '';
  const apprName  = approversArr[1]?.name  || '';
  const apprTitle = approversArr[1]?.title || '';

  // Get current logged-in user from sidebar
  const requesterName  = document.querySelector('.sb-uname')?.textContent?.trim() || 'User';
  const requesterTitle = document.querySelector('.sb-urole')?.textContent?.trim() || '';

  const data = {
    type: selectedType, typeLabel: TYPE_LABELS[selectedType]||'-',
    memoNo: val('#f-memo-no'), date: dateInput(val('#f-date')),
    project: val('#f-project')==='other' ? val('#f-project-other') : val('#f-project'),
    to: toVal, subject: '', reason: selectedReason(),
    requesterProfileId: typeof currentUserProfileId === 'function' ? currentUserProfileId() : null,
    requesterName, requesterTitle,
    sourceMemoNo: _editingSourceMemoNo,
    // Milestone 2 Task 2.1 — currency is stored explicitly at the memo level.
    // No FX conversion: THB and USD amounts are never converted into one another.
    currency: val('#f-currency') || 'THB',
    reviewerName: revName || '-', reviewerTitle: revTitle || '-',
    reviewerDate: dateInput(val('#f-signdate')) || TODAY,
    approverName: apprName || '-', approverTitle: apprTitle || '-',
    approverDate: dateInput(val('#f-signdate')) || TODAY,
    // Build approvers chain from dynamic rows
    approvers: approversArr,
    sections: [], total: 0, amountWords: ''
  };
  // Use typed subject if user filled it, else auto-generate from current form state
  const typedSubject = val('#f-subject')?.trim();
  data.subject = typedSubject || memoSubject(data);
  if(data.type==='sl') {
    const rows = Array.from(document.querySelectorAll('#sl-rows .item-row')).map((row,i) => {
      const name  = normalizeSLText(row.querySelector('.sl-name')?.value || '');
      const plan  = normalizeSLText(row.querySelector('.sl-plan')?.value || '');
      const price = Number(row.querySelector('.sl-price')?.value)||0;
      const months= Number(row.querySelector('.sl-mo')?.value)||0;
      const qty   = Number(row.querySelector('.sl-qty')?.value)||0;
      const startMonth = row.querySelector('.sl-start')?.value || null;
      const endMonth   = row.querySelector('.sl-end')?.value || null;
      return { no:i+1, name: name||'-', plan, price, months, qty, subtotal:price*months*qty, startMonth, endMonth };
    });
    data.total = rows.reduce((s,r)=>s+r.subtotal, 0);
    data.slItems = rows.map(r => ({ name:r.name, plan:r.plan, price:r.price, months:r.months, qty:r.qty, startMonth:r.startMonth, endMonth:r.endMonth }));
    data.amountWords = val('#fs-sl .form-grid .fg:nth-child(2) input');
    data.sections.push({ title:'รายการ Software', html:table(['#','ชื่อ Software','Plan','฿/เดือน','เดือน','จำนวน','เริ่ม','สิ้นสุด','รวม'], rows.map(r=>[r.no,r.name,r.plan||'-',money(r.price),r.months,r.qty,r.startMonth||'-',r.endMonth||'-',money(r.subtotal)]), [3,8]) });
    const acctCols = getAcctCols();
    // Raw structured copy (email + checkbox states) so a Draft re-edit or
    // Duplicate can rebuild the account table exactly — the `sections` entry
    // below is a read-only HTML render and cannot be restored into form inputs.
    data.acctCols = acctCols;
    data.acctRows = Array.from(document.querySelectorAll('#acct-body tr'))
      .map(tr => ({
        email: (val('.acct-email', tr) || '').trim(),
        checks: Array.from(tr.querySelectorAll('.acct-val')).map(input => !!input.checked),
      }))
      .filter(r => r.email);
    const acctRows = Array.from(document.querySelectorAll('#acct-body tr'))
      .map(tr=>[val('.acct-email',tr).trim(),...Array.from(tr.querySelectorAll('.acct-val')).map(input=>input.checked ? '✓' : '')])
      .filter(r=>r[0]);
    if(acctCols.length && acctRows.length) data.sections.push({ title:'ตาราง Account', html:table(['Email',...acctCols], acctRows, []) });
  }
  if(data.type==='hw') {
    const rows = Array.from(document.querySelectorAll('#hw-rows .item-row')).map((row,i) => {
      const inp = row.querySelectorAll('input');
      const price=Number(inp[1]?.value)||0, qty=Number(inp[2]?.value)||0;
      return { no:i+1, name:inp[0]?.value.trim()||'-', price, qty, subtotal:price*qty };
    });
    data.total = rows.reduce((s,r)=>s+r.subtotal,0);
    // Raw structured copy — `sections` below is a read-only HTML render.
    data.hwItems = Array.from(document.querySelectorAll('#hw-rows .item-row')).map(row => {
      const inp = row.querySelectorAll('input');
      return { name: inp[0]?.value.trim()||'', price: Number(inp[1]?.value)||0, qty: Number(inp[2]?.value)||0 };
    });
    data.amountWords = val('#fs-hw .form-grid .fg:nth-child(1) input');
    const owner = val('#fs-hw .form-grid .fg:nth-child(2) input');
    data.hwOwner = owner || '';
    data.sections.push({ title:'รายการ Hardware', html:table(['#','ชื่ออุปกรณ์','ราคา/ชิ้น','จำนวน','รวม'], rows.map(r=>[r.no,r.name,money(r.price),r.qty,money(r.subtotal)]), [2,4]) });
    if(owner) data.sections.push({ title:'ผู้รับผิดชอบดูแลอุปกรณ์', html:`<p>${esc(owner)}</p>` });
  }
  if(data.type==='int') {
    const pp        = Number(document.getElementById('int-pp')?.value) || 0;
    const activity  = document.getElementById('int-activity')?.value.trim() || '';
    const dateVal   = document.getElementById('int-date')?.value || '';
    const headcount = parseInt(document.getElementById('int-headcount')?.value) || 0;
    // Raw participant names (untouched by the '-' display fallback used below)
    // so a Draft re-edit or Duplicate can rebuild the name rows exactly.
    data.intNames   = Array.from(document.querySelectorAll('.int-name')).map(i => i.value.trim());
    const names     = data.intNames.map((v, idx) => [idx+1, v || '-']);
    data.total       = pp * names.length;
    data.amountWords = document.getElementById('int-amount-words')?.value.trim() || '';
    data.intActivity  = activity;
    data.intDate      = dateInput(dateVal);
    data.intHeadcount = headcount;
    data.intPP        = pp;
    data.sections.push({ title:'รายละเอียดกิจกรรม', html:`<p>รายละเอียด / ชื่อกิจกรรม: ${esc(activity||'-')}<br>วันที่: ${esc(dateInput(dateVal))}<br>จำนวนผู้เข้าร่วม: ${headcount||names.length} คน<br>วงเงิน/คน: ${esc(money(pp))} บาท/คน</p>` });
    data.sections.push({ title:'รายชื่อผู้เข้าร่วม', html:table(['#','ชื่อ-นามสกุล / ตำแหน่ง'], names, []) });
  }
  if(data.type==='ent') {
    const inp = document.querySelectorAll('#fs-ent input');
    data.entClient   = inp[0]?.value.trim() || '';
    data.entDate     = dateInput(inp[1]?.value) || '';
    data.entPlace    = inp[2]?.value.trim() || '';
    data.entPeople   = inp[3]?.value || '';
    data.total       = Number(inp[4]?.value)||0;
    data.amountWords = inp[5]?.value.trim()||'';
  }
  if(data.type==='dep') {
    const start    = document.getElementById('dep-start')?.value || '';
    const end      = document.getElementById('dep-end')?.value   || '';
    const location = document.getElementById('dep-location')?.value.trim() || '';
    const empCount = parseInt(document.getElementById('dep-emp-count')?.value) || 0;
    data.amountWords = document.getElementById('dep-amount-words')?.value.trim() || '';
    data.depEmpCount = empCount;
    data.depLocation = location;
    data.depStart    = start ? dateInput(start) : '';
    data.depEnd      = end   ? dateInput(end)   : '';

    // Collect both item types
    let grandTotal = 0;
    const itemsHtml = [];
    // Raw structured copy — `sections` below is a read-only HTML render and
    // only includes filled-in rows, so it cannot rebuild the exact form state.
    data.depItems = [];

    document.querySelectorAll('#dep-items .dep-row').forEach((row, idx) => {
      const n = idx + 1;
      if (row.classList.contains('dep-calc-row')) {
        const name  = row.querySelector('.dep-item-name')?.value.trim() || '';
        const price = parseFloat(row.querySelector('.dep-item-price')?.value) || 0;
        const qty   = parseInt(row.querySelector('.dep-item-qty')?.value)   || 0;
        const total = price * qty;
        data.depItems.push({ kind:'calc', name, price, qty });
        if (name) {
          grandTotal += total;
          itemsHtml.push(`<li>${esc(name)} ราคา ${price.toLocaleString()} บาท × ${qty} คน = ${total.toLocaleString()} บาท (รวมภาษีมูลค่าเพิ่ม)</li>`);
        }
      } else if (row.classList.contains('dep-text-row')) {
        const text = row.querySelector('.dep-item-text')?.value.trim() || '';
        data.depItems.push({ kind:'text', text });
        if (text) itemsHtml.push(`<li>${esc(text)}</li>`);
      }
    });

    if (grandTotal > 0) data.total = grandTotal;

    data.sections.push({
      title: 'รายการค่าใช้จ่าย',
      html:  `<ol style="margin:0;padding-left:20px;line-height:2.2">${itemsHtml.join('')}</ol>`
    });
  }
  return data;
}
function validateMemo(data) {
  const missing = [];

  // ── Common fields ──
  if(!data.type) missing.push('ประเภท Memo');
  if(!val('#f-memo-no')) missing.push('เลขที่ Memo (บังคับกรอก)');
  if(!val('#f-date')) missing.push('วันที่ Memo');
  if(!val('#f-project')) missing.push('โครงการ');
  else if(val('#f-project')==='other' && !val('#f-project-other')) missing.push('ชื่อโครงการ');
  if(typeof SUPPORTED_CURRENCIES !== 'undefined' && !SUPPORTED_CURRENCIES.includes(data.currency)) {
    missing.push(`สกุลเงิน (รองรับเฉพาะ ${SUPPORTED_CURRENCIES.join(', ')})`);
  }
  // เรียน auto-derived from last approver — no validation needed
  if(!data.subject || !data.subject.trim()) missing.push('หัวข้อเรื่อง (ห้ามว่าง)');
  if(!data.reason) missing.push('เหตุผลในการขอ');

  // ── Signature fields — use approvers[] array ──
  if(!data.approvers || data.approvers.length < 2) missing.push('ต้องมี Approver อย่างน้อย 2 คน (A1 Reviewer + A2 Final Approver)');
  else {
    if(!data.approvers[0]?.name || data.approvers[0].name === '-') missing.push('ชื่อ Reviewer (A1)');
    if(!data.approvers[0]?.title || data.approvers[0].title === '-') missing.push('ตำแหน่ง Reviewer (A1)');
    if(!data.approvers[1]?.name || data.approvers[1].name === '-') missing.push('ชื่อ Final Approver (A2)');
    if(!data.approvers[1]?.title || data.approvers[1].title === '-') missing.push('ตำแหน่ง Final Approver (A2)');
    // A1 ≠ A2 check
    if(data.approvers[0]?.name && data.approvers[1]?.name && profileMatches(
      data.approvers[0].profileId, data.approvers[0].name,
      data.approvers[1].profileId, data.approvers[1].name
    ))
      missing.push('Reviewer (A1) กับ Final Approver (A2) ต้องไม่ใช่คนเดียวกัน');
    data.approvers.slice(1).forEach((approver, i) => {
      if (profileMatches(approver.profileId, approver.name, data.requesterProfileId, data.requesterName)) {
        missing.push(`Requester ต้องไม่เป็น A${i + 2} Approver`);
      }
    });
    for (let i = 0; i < data.approvers.length; i++) {
      for (let j = i + 1; j < data.approvers.length; j++) {
        if (profileMatches(
          data.approvers[i].profileId, data.approvers[i].name,
          data.approvers[j].profileId, data.approvers[j].name
        ) && !(i === 0 && j === 1)) {
          missing.push(`A${i + 1} และ A${j + 1} ต้องเป็นคนละคน`);
        }
      }
    }
  }
  if(!val('#f-signdate')) missing.push('วันที่ลงนาม');

  // ── SL ──
  if(data.type==='sl') {
    const slRows = Array.from(document.querySelectorAll('#sl-rows .item-row'));
    if(!slRows.some(r => r.querySelector('.sl-name')?.value?.trim()))
      missing.push('ชื่อ Software (อย่างน้อย 1 รายการ)');
    slRows.forEach((r, i) => {
      const name = r.querySelector('.sl-name')?.value?.trim();
      if(!name) return;
      if(!r.querySelector('.sl-plan')?.value?.trim()) missing.push(`Software แถว ${i+1}: Plan / Tier`);
      if(!(parseFloat(r.querySelector('.sl-price')?.value) > 0)) missing.push(`Software แถว ${i+1}: ราคา/เดือน`);
      if(!(parseInt(r.querySelector('.sl-mo')?.value) > 0))    missing.push(`Software แถว ${i+1}: จำนวนเดือน`);
      if(!(parseInt(r.querySelector('.sl-qty')?.value) > 0))   missing.push(`Software แถว ${i+1}: จำนวน (Qty)`);
      if(!r.querySelector('.sl-start')?.value) missing.push(`Software แถว ${i+1}: วันเริ่มต้น (บังคับ)`);
      if(!r.querySelector('.sl-end')?.value)   missing.push(`Software แถว ${i+1}: วันสิ้นสุด (บังคับ)`);
    });
    const amtWords = document.querySelector('#fs-sl .form-grid .fg:nth-child(2) input')?.value?.trim();
    if(!amtWords) missing.push('จำนวนเงินเป็นตัวอักษร (SL)');
  }

  // ── HW ──
  if(data.type==='hw') {
    const hwRows = Array.from(document.querySelectorAll('#hw-rows .item-row'));
    if(!hwRows.some(r => r.querySelector('input:first-child')?.value?.trim()))
      missing.push('ชื่ออุปกรณ์ (อย่างน้อย 1 รายการ)');
    hwRows.forEach((r, i) => {
      const name = r.querySelector('input:first-child')?.value?.trim();
      if(!name) return;
      if(!(parseFloat(r.querySelector('.hw-price')?.value) > 0)) missing.push(`Hardware แถว ${i+1}: ราคา/ชิ้น`);
      if(!(parseInt(r.querySelector('.hw-qty')?.value) > 0))     missing.push(`Hardware แถว ${i+1}: จำนวน`);
    });
    const amtWords = document.querySelector('#fs-hw .form-grid .fg:nth-child(1) input')?.value?.trim();
    if(!amtWords) missing.push('จำนวนเงินเป็นตัวอักษร (HW)');
  }

  // ── INT ──
  if(data.type==='int') {
    if(!document.getElementById('int-activity')?.value?.trim()) missing.push('รายละเอียด / ชื่อกิจกรรม');
    if(!document.getElementById('int-date')?.value) missing.push('วันที่จัดกิจกรรม');
    if(!(parseInt(document.getElementById('int-headcount')?.value) > 0)) missing.push('จำนวนผู้เข้าร่วม');
    if(!(parseFloat(document.getElementById('int-pp')?.value) > 0)) missing.push('วงเงินต่อคน');
    if(!document.getElementById('int-amount-words')?.value?.trim()) missing.push('จำนวนเงินรวมเป็นตัวอักษร');
    if(!Array.from(document.querySelectorAll('.int-name')).some(i => i.value.trim())) missing.push('รายชื่อผู้เข้าร่วม (อย่างน้อย 1 คน)');
    // Headcount must match names exactly (mandatory)
    const hc = parseInt(document.getElementById('int-headcount')?.value)||0;
    const ac = Array.from(document.querySelectorAll('.int-name')).filter(i=>i.value.trim()).length;
    if (hc > 0 && ac !== hc) {
      missing.push(`จำนวนผู้เข้าร่วมที่ระบุ ${hc} คน แต่กรอกรายชื่อแล้ว ${ac} คน — ต้องให้ตรงกัน`);
    }
  }

  // ── ENT ──
  if(data.type==='ent') {
    const entInp = document.querySelectorAll('#fs-ent input');
    if(!entInp[0]?.value?.trim()) missing.push('ชื่อลูกค้า / บริษัท');
    if(!entInp[1]?.value?.trim()) missing.push('วันที่จัดงาน');
    if(!entInp[2]?.value?.trim()) missing.push('สถานที่จัดงาน');
    if(!(parseInt(entInp[3]?.value) > 0))    missing.push('จำนวนผู้เข้าร่วม');
    if(!(parseFloat(entInp[4]?.value) > 0))  missing.push('วงเงินรวม');
    if(!entInp[5]?.value?.trim())             missing.push('จำนวนเงินเป็นตัวอักษร (ENT)');
  }

  // ── DEP ──
  if(data.type==='dep') {
    if(!document.getElementById('dep-location')?.value?.trim()) missing.push('สถานที่ปฏิบัติงาน');
    if(!document.getElementById('dep-start')?.value)  missing.push('วันที่ Deploy (Start)');
    if(!document.getElementById('dep-end')?.value)    missing.push('วันที่ Deploy (End)');
    if(!(parseInt(document.getElementById('dep-emp-count')?.value) > 0)) missing.push('จำนวนพนักงาน');
    if(!document.getElementById('dep-amount-words')?.value?.trim()) missing.push('จำนวนเงินเป็นตัวอักษร (DEP)');
  }

  if(missing.length) { alert('กรุณากรอกข้อมูลให้ครบ:\n\n• '+missing.join('\n• ')); return false; }
  return true;
}
// Milestone 1B — memo number reuse: Rejected and Cancelled are the only
// statuses that may reuse a memo number (no warning needed for those). Every
// other status — including the new Voided — still blocks reuse.
const MEMO_NO_BLOCKING_STATUSES = new Set(['draft', 'pending', 'pending_a2', 'pending_a3', 'completed', 'voided']);

// Shared by Submit and Save Draft — MEMO_LIFECYCLE.md §5: Memo Number must be
// unique app-wide, with no stated exception for Draft. Returns the conflicting
// row ({memo_no,status,deleted}) or null.
async function checkMemoNoConflict(memoNo) {
  const conflicts = await supaFetch('memos', 'GET', null,
    `?memo_no=eq.${encodeURIComponent(memoNo)}&select=memo_no,status,deleted&limit=1`);
  return conflicts?.[0] || null;
}

// ── Save as Draft ──
async function saveDraft() {
  if(!selectedType) { alert('กรุณาเลือกประเภท Memo ก่อน'); return; }
  const data = collectMemoData();
  data.status = 'draft';
  if(!data.memoNo) {
    data.memoNo = 'DRAFT-' + Date.now().toString(36).toUpperCase();
  }
  // Functional audit fix: Save Draft previously had no memo-number uniqueness
  // check at all — saveMemo()/saveMemoAsync() upsert by memoNo, so typing (or
  // editing into) a number that already belongs to a different, non-Draft
  // memo silently overwrote that unrelated record. Reuse the same conflict
  // check Submit already performs.
  try {
    const conflict = await checkMemoNoConflict(data.memoNo);
    const editingSameDraft = conflict?.status === 'draft' && _editingDraftMemoNo === data.memoNo;
    if(conflict && !conflict.deleted && MEMO_NO_BLOCKING_STATUSES.has(conflict.status) && !editingSameDraft) {
      alert(`เลข Memo ${data.memoNo} ถูกใช้งานแล้ว (สถานะ: ${conflict.status || '-'}) กรุณาใช้เลขอื่น`);
      return;
    }
  } catch(e) {
    console.error('Memo number duplicate check failed', e);
    alert('ไม่สามารถตรวจสอบเลข Memo กับฐานข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง');
    return;
  }
  // If editing existing draft, keep same memoNo
  saveMemo(data);
  renderPendingMemos();
  alert(`✓ บันทึก Draft แล้ว — ${data.memoNo}`);
  resetMemoForm();
  // Drafts live in All Memos (views/history.js), not Pending — see the
  // "Draft management is handled in All Memos" note in views/pending.js.
  // Navigate to History's Draft tab instead of the old (undefined) call.
  swView('history', document.querySelector('.sb-sub-item[onclick*="history"]'), 'All Memos');
  if (typeof switchHistTab === 'function') switchHistTab('draft');
}

async function submitMemo() {
  const data = collectMemoData();
  if(!validateMemo(data)) return;
  try {
    const conflict = await checkMemoNoConflict(data.memoNo);
    const editingSameDraft = conflict?.status === 'draft' && _editingDraftMemoNo === data.memoNo;
    // A soft-deleted Draft behaves as deleted from the user's perspective —
    // it must not block reuse of its memo number (business rule correction).
    if(conflict && !conflict.deleted && MEMO_NO_BLOCKING_STATUSES.has(conflict.status) && !editingSameDraft) {
      alert(`เลข Memo ${data.memoNo} ถูกใช้งานแล้ว (สถานะ: ${conflict.status || '-'}) กรุณาใช้เลขอื่น`);
      return;
    }
  } catch(e) {
    console.error('Memo number duplicate check failed', e);
    alert('ไม่สามารถตรวจสอบเลข Memo กับฐานข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง');
    return;
  }
  const a1 = data.approvers?.[0];
  const a2 = data.approvers?.[1];
  const selfA1 = !!a1 && profileMatches(a1.profileId, a1.name, data.requesterProfileId, data.requesterName);
  if (selfA1 && !confirm(
    `คุณเป็น Requester และ A1 Reviewer ของ Memo นี้\n\n` +
    `เมื่อ Submit ระบบจะบันทึกว่า A1 Reviewed แล้ว และส่งต่อไปยัง A2: ${a2?.name || '—'} ทันที\n\n` +
    `ต้องการ Submit ต่อหรือไม่?`
  )) return;
  try {
    const prepared = prepareMemoForSubmission(data);
    const saved = saveMemo(prepared);
    renderPendingMemos();
    const destination = selfA1 ? `A2: ${a2?.name || '—'}` : `A1: ${a1?.name || '—'}`;
    alert(`✓ Submit ${saved.memoNo} แล้ว — ส่งต่อไปยัง ${destination}`);
    swView('pending', document.querySelector('.sb-sub-item[onclick*="pending"]'), 'Pending Approval');
  } catch(e) {
    console.error(e);
    alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  }
}
// Backward-compatible alias for older buttons/bookmarks.
function generateMemoPdf() { return submitMemo(); }
function resetMemoForm() {
  if(!confirm('ล้างข้อมูลที่กรอกหรือไม่?')) return;
  document.querySelectorAll('#form-body input, #form-body textarea').forEach(el => {
    if(el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else el.value = '';
  });
  document.querySelectorAll('#form-body select').forEach(el => { el.selectedIndex = 0; });
  ['sl-rows','hw-rows','int-names','ent-names','dep-items','approver-rows-form','acct-body'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.innerHTML = '';
  });
  ['sl-total','hw-total','int-total','ent-total','dep-total'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.textContent = '฿0';
  });
  selectedType = null;
  _editingSourceMemoNo = null;
  _editingDraftMemoNo = null;
  document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('selected'));
  document.querySelectorAll('.fs').forEach(section => section.classList.remove('active'));
  const body = document.getElementById('form-body');
  const hint = document.getElementById('form-hint');
  if(body) body.style.display = 'none';
  if(hint) hint.style.display = '';
  setNextMemoNo();
}

// ── Dropdown toggle helpers ──
function toggleIntObjectiveOther() {
  const sel = document.getElementById('int-objective');
  const el  = document.getElementById('int-objective-other');
  if (el) el.style.display = sel?.value === 'other' ? '' : 'none';
}

function checkIntHeadcount() {
  const headcount = parseInt(document.getElementById('int-headcount')?.value) || 0;
  const actual    = Array.from(document.querySelectorAll('.int-name')).filter(i => i.value.trim()).length;
  const countEl   = document.getElementById('int-name-count');
  const warnEl    = document.getElementById('int-headcount-warning');
  if (countEl) countEl.textContent = `${actual} คน`;
  if (!warnEl) return;
  if (headcount > 0 && actual !== headcount) {
    warnEl.style.display = '';
    warnEl.textContent = `⚠ กรอกรายชื่อแล้ว ${actual} คน แต่ระบุจำนวน ${headcount} คน — ยังขาดอีก ${headcount - actual > 0 ? headcount - actual : 0} คน`;
  } else {
    warnEl.style.display = 'none';
  }
}

function downloadIntTemplate() {
  // Build simple CSV template
  const rows = [
    ['ชื่อ-นามสกุล ตำแหน่ง'],
    ['นาย ตัวอย่าง ใจดี  Project Manager'],
    ['นางสาว ตัวอย่าง สองคน  Developer'],
  ];
  const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'INT_รายชื่อผู้เข้าร่วม_template.csv';
  a.click();
}

function uploadIntExcel(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      let names = [];
      if (file.name.endsWith('.csv')) {
        // CSV
        const text = e.target.result;
        names = text.split('\n')
          .map(l => l.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim())
          .filter((l, i) => l && i > 0 && !l.startsWith('ชื่อ-นามสกุล'));
      } else {
        // XLSX — use SheetJS if available
        if (typeof XLSX === 'undefined') {
          alert('กรุณาใช้ไฟล์ .csv หรือลองอีกครั้ง (XLSX library not loaded)');
          return;
        }
        const data = new Uint8Array(e.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
        names = rows.slice(1).map(r => String(r[0]||'').trim()).filter(Boolean);
      }
      if (!names.length) { alert('ไม่พบรายชื่อในไฟล์'); return; }
      // Clear and repopulate
      const container = document.getElementById('int-names');
      container.innerHTML = '';
      names.forEach((name, idx) => {
        const d = document.createElement('div');
        d.className = 'row-name';
        d.innerHTML = `<span class="name-num">${idx+1}.</span><input class="ri int-name" type="text" value="${name.replace(/"/g,'&quot;')}" oninput="calcINT();checkIntHeadcount()"><button class="rm-btn" onclick="rmName(this,'int-names');calcINT();checkIntHeadcount()" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>`;
        container.appendChild(d);
      });
      calcINT();
      checkIntHeadcount();
      alert(`✓ นำเข้ารายชื่อแล้ว ${names.length} คน`);
    } catch(err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
    input.value = '';
  };
  if (file.name.endsWith('.csv')) reader.readAsText(file, 'UTF-8');
  else reader.readAsArrayBuffer(file);
}
function toggleToOther() {
  const sel = document.getElementById('f-to');
  const wrap = document.getElementById('to-other-wrap');
  if(wrap) wrap.style.display = sel?.value === 'other' ? 'block' : 'none';
}
function toggleReviewerNameOther() {
  const sel = document.getElementById('f-reviewer-name');
  const el  = document.getElementById('f-reviewer-name-other');
  if(el) el.style.display = sel?.value === 'other' ? 'block' : 'none';
}
function toggleReviewerTitleOther() {
  const sel = document.getElementById('f-reviewer-title');
  const el  = document.getElementById('f-reviewer-title-other');
  if(el) el.style.display = sel?.value === 'other' ? 'block' : 'none';
}
// ── Dynamic Approver Rows — fetch from user_profiles ──
// Build name options from _userProfilesCache (loaded at init from Supabase)
function _approverNameOpts(selected = '', stage = 'approve') {
  const approvers = typeof getApprovers === 'function' ? getApprovers(stage) : [];
  const opts = approvers.length
    ? approvers.map(u => `<option value="${esc(u.full_name)}" data-profile-id="${u.id || ''}" data-title="${esc(u.title)}" ${u.full_name===selected?'selected':''}>${esc(u.full_name)}</option>`).join('')
    : `<option value="นาย นวพล งามวรโรจน์สกุล" ${selected==='นาย นวพล งามวรโรจน์สกุล'?'selected':''}>นาย นวพล งามวรโรจน์สกุล</option>
       <option value="นาย ปกรณ์ เจียมสกุลทิพย์" ${selected==='นาย ปกรณ์ เจียมสกุลทิพย์'?'selected':''}>นาย ปกรณ์ เจียมสกุลทิพย์</option>`;
  return `<option value="">— เลือกชื่อ Approver —</option>` + opts;
}
function _approverTitleOpts(selected = '', stage = 'approve') {
  // Build title options from unique titles in user_profiles
  const approvers = typeof getApprovers === 'function' ? getApprovers(stage) : [];
  const titles = approvers.length
    ? [...new Set(approvers.map(u=>u.title).filter(Boolean))]
    : ['ผู้อำนวยการโครงการ','ประธานเจ้าหน้าที่บริหาร','ผู้อำนวยการ'];
  return `<option value="">— ตำแหน่ง —</option>` +
    titles.map(t=>`<option value="${esc(t)}" ${t===selected?'selected':''}>${esc(t)}</option>`).join('');
}

function initApproverRows() {
  const container = document.getElementById('approver-rows-form');
  if (!container || container.children.length > 0) return;
  // Start with A1 + A2 (both required, minimum 2)
  _appendApproverRow(true);   // A1 — Reviewer
  _appendApproverRow(false);  // A2 — Final Approver
  _updateApproverUI();
}
// Rebuild all approver dropdowns after user profiles are loaded
function refreshApproverDropdowns() {
  document.querySelectorAll('#approver-rows-form .appr-form-row').forEach((row, index) => {
    const nameSel  = row.querySelector('.appr-name-sel');
    const titleSel = row.querySelector('.appr-title-sel');
    if(!nameSel) return;
    const curName  = nameSel.value;
    const curTitle = titleSel?.value||'';
    const stage = index === 0 ? 'review' : 'approve';
    nameSel.innerHTML  = _approverNameOpts(curName, stage);
    if(titleSel) titleSel.innerHTML = _approverTitleOpts(curTitle, stage);
  });
  updateSelfA1Notice();
}

function addApproverFormRow() {
  const rows = document.querySelectorAll('#approver-rows-form .appr-form-row');
  if (rows.length >= 3) { alert('สามารถมี Approver ได้สูงสุด 3 คน'); return; }
  _appendApproverRow(false);
  _updateApproverUI();
}

function _appendApproverRow(isFirst) {
  const container = document.getElementById('approver-rows-form');
  if (!container) return;
  const idx = container.querySelectorAll('.appr-form-row').length;
  const stage = idx === 0 ? 'review' : 'approve';
  const label = idx === 0 ? 'A1 — Reviewer (บังคับ)' : idx === 1 ? 'A2 — Final Approver (บังคับ)' : `A${idx + 1} — Approver (optional)`;

  const row = document.createElement('div');
  row.className = 'appr-form-row';
  row.style.cssText = 'border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px';
  row.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span class="appr-row-label" style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em">${label}</span>
      ${!isFirst ? `<button class="rm-btn" onclick="rmApproverFormRow(this)" title="ลบ" style="width:22px;height:22px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="fg">
        <label>ชื่อ${isFirst ? ' *' : ''}</label>
        <select class="ri appr-name-sel" onchange="onApproverNameChange(this)" style="margin-top:3px">${_approverNameOpts('', stage)}</select>
        <div class="appr-name-warning" role="alert" style="display:none;margin-top:6px;font-size:11px;line-height:1.4;color:#A32D2D;background:#FCEBEB;border-radius:4px;padding:6px 8px"></div>
      </div>
      <div class="fg">
        <label>ตำแหน่ง${isFirst ? ' *' : ''}</label>
        <select class="ri appr-title-sel" onchange="onApproverTitleChange(this)" style="margin-top:3px">${_approverTitleOpts('', stage)}</select>
        <div class="appr-title-warning" role="alert" style="display:none;margin-top:6px;font-size:11px;line-height:1.4;color:#A32D2D;background:#FCEBEB;border-radius:4px;padding:6px 8px"></div>
      </div>
    </div>`;
  container.appendChild(row);
}

function rmApproverFormRow(btn) {
  const count = document.querySelectorAll('#approver-rows-form .appr-form-row').length;
  if (count <= 2) { alert('ต้องมี Approver อย่างน้อย 2 คน (A1 Reviewer + A2 Final Approver)'); return; }
  btn.closest('.appr-form-row').remove();
  _renumberApproverRows();
  _updateApproverUI();
}

function _renumberApproverRows() {
  document.querySelectorAll('#approver-rows-form .appr-form-row').forEach((row, i) => {
    const label = row.querySelector('.appr-row-label');
    if (label) label.textContent = i === 0 ? 'A1 — Reviewer (บังคับ)' : i === 1 ? 'A2 — Final Approver (บังคับ)' : `A${i+1} — Approver (optional)`;
  });
}

function _updateApproverUI() {
  const count  = document.querySelectorAll('#approver-rows-form .appr-form-row').length;
  const addBtn = document.getElementById('btn-add-approver');
  const label  = document.getElementById('approver-count-label');
  if (addBtn) addBtn.style.display = count >= 3 ? 'none' : '';
  if (label)  label.textContent = `${count} คน (สูงสุด 3 คน)`;
  // Hide rm button on first 2 rows (mandatory), show only on A3
  document.querySelectorAll('#approver-rows-form .appr-form-row').forEach((row, i) => {
    const rmBtn = row.querySelector('.rm-btn');
    if (rmBtn) rmBtn.style.display = i < 2 ? 'none' : '';
  });
}

function onApproverNameChange(sel) {
  const row = sel.closest('.appr-form-row');
  const nameWarning = row?.querySelector('.appr-name-warning');
  if(sel.value && nameWarning) { nameWarning.style.display = 'none'; nameWarning.textContent = ''; }
  // Auto-fill title from user_profiles when name is selected
  if(sel.value) {
    const user = typeof findUserByName === 'function' ? findUserByName(sel.value) : null;
    if(user) {
      const titleSel = row?.querySelector('.appr-title-sel');
      const titleWarning = row?.querySelector('.appr-title-warning');
      if(titleSel) {
        // Try to match existing option, otherwise set value directly
        const opt = [...titleSel.options].find(o=>o.value===user.title);
        if(opt) {
          titleSel.value = user.title;
          if(titleWarning) { titleWarning.style.display = 'none'; titleWarning.textContent = ''; }
        } else {
          titleSel.value = '';
          if(titleWarning) {
            titleWarning.textContent = `ไม่พบตำแหน่งเดิม ('${user.title || '-'}') ในรายชื่อปัจจุบัน กรุณาเลือกตำแหน่งใหม่`;
            titleWarning.style.display = '';
          }
        }
        // Store auto-filled title as data attribute for read-back
        titleSel.dataset.autofill = user.title;
      }
      // Show authority warning
      _updateApproverAuthorityHint(row, sel.value, user.title);
    }
  }
  updateSelfA1Notice();
}

function updateSelfA1Notice() {
  const notice = document.getElementById('self-a1-notice');
  if (!notice) return;
  const rows = document.querySelectorAll('#approver-rows-form .appr-form-row');
  const a1Name = rows[0]?.querySelector('.appr-name-sel')?.value || '';
  const a2Name = rows[1]?.querySelector('.appr-name-sel')?.value || '';
  const a1Profile = typeof findUserByName === 'function' ? findUserByName(a1Name) : null;
  const isSelf = !!a1Name && profileMatches(a1Profile?.id, a1Name);
  notice.style.display = isSelf ? '' : 'none';
  if (isSelf) {
    notice.innerHTML = `<strong>คุณเป็น Requester และ A1 Reviewer</strong><br>` +
      `เมื่อ Submit ระบบจะบันทึก A1 Reviewed และส่งต่อไปยัง A2: ${esc(a2Name || 'กรุณาเลือก A2')}`;
  }
}
function onApproverTitleChange(sel) {
  const row = sel.closest('.appr-form-row');
  const titleWarning = row?.querySelector('.appr-title-warning');
  if(sel.value && titleWarning) { titleWarning.style.display = 'none'; titleWarning.textContent = ''; }
  // Update authority hint when title changes manually
  const nameSel = row?.querySelector('.appr-name-sel');
  const name = nameSel?.value||'';
  _updateApproverAuthorityHint(row, name, sel.value);
}

// Show authority limit hint per approver row
function _updateApproverAuthorityHint(row, name, title) {
  if(!row) return;
  let hint = row.querySelector('.appr-authority-hint');
  if(!hint) {
    hint = document.createElement('div');
    hint.className = 'appr-authority-hint';
    hint.style.cssText = 'font-size:10px;margin-top:5px;padding:4px 8px;border-radius:4px';
    row.appendChild(hint);
  }
  if(!title) { hint.style.display='none'; return; }
  const rowIdx = [...document.querySelectorAll('#approver-rows-form .appr-form-row')].indexOf(row);
  if(rowIdx === 0) { hint.style.display='none'; return; } // A1 reviewer — no authority check needed
  // Get current memo total for warning
  const totalEl = document.getElementById('sl-total')||document.getElementById('hw-total')||
                  document.getElementById('int-total')||document.getElementById('ent-total')||
                  document.getElementById('dep-total');
  const totalText = totalEl?.textContent?.replace(/[฿,]/g,'')||'0';
  const total = parseFloat(totalText)||0;
  const limit = typeof getAuthorityLimit==='function' ? getAuthorityLimit(title, selectedType||'sl') : 0;
  if(limit===0 && selectedType==='int') {
    hint.style.cssText='font-size:10px;margin-top:5px;padding:4px 8px;border-radius:4px;background:#E6F1FB;color:#185FA5';
    hint.style.display='';
    hint.textContent=`ℹ ${title} — INT memo ไม่ระบุวงเงินใน Policy`;
  } else if(limit>0 && total>limit) {
    hint.style.cssText='font-size:10px;margin-top:5px;padding:4px 8px;border-radius:4px;background:#FCEBEB;color:#A32D2D';
    hint.style.display='';
    hint.textContent=`⚠ วงเงินของ ${title}: ${limit.toLocaleString('th-TH')} ฿ — ยอด Memo (${total.toLocaleString('th-TH')} ฿) เกิน · ยัง submit ได้ แต่ Approver อาจไม่อนุมัติ`;
  } else if(limit>0) {
    hint.style.cssText='font-size:10px;margin-top:5px;padding:4px 8px;border-radius:4px;background:#EAF3DE;color:#27500A';
    hint.style.display='';
    hint.textContent=`✓ วงเงินของ ${title}: ${limit.toLocaleString('th-TH')} ฿`;
  } else {
    hint.style.display='none';
  }
}

// ── Bulk Name Modal ──
let _bulkTargetId = '', _bulkCls = '', _bulkCalc = false;
function openBulkNameModal(containerId, cls, doCalc) {
  _bulkTargetId = containerId;
  _bulkCls = cls;
  _bulkCalc = doCalc;
  document.getElementById('bulk-name-input').value = '';
  document.getElementById('bulk-name-modal').style.display = 'flex';
}
function closeBulkNameModal() {
  document.getElementById('bulk-name-modal').style.display = 'none';
}
function saveBulkNames() {
  const lines = document.getElementById('bulk-name-input').value
    .split('\n').map(l => l.trim()).filter(Boolean);
  if(!lines.length) { closeBulkNameModal(); return; }
  lines.forEach(name => {
    const container = document.getElementById(_bulkTargetId);
    if(!container) return;
    const n = container.querySelectorAll('.' + _bulkCls).length + 1;
    const d = document.createElement('div');
    d.className = 'row-name';
    const calcAttr = _bulkCalc ? ` oninput="calcINT()"` : '';
    const calcCall = _bulkCalc ? `;calcINT()` : '';
    d.innerHTML = `<span class="name-num">${n}.</span><input class="ri ${_bulkCls}" type="text" value="${esc(name)}"${calcAttr}><button class="rm-btn" onclick="rmName(this,'${_bulkTargetId}')${calcCall}" title="ลบ"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>`;
    container.appendChild(d);
  });
  if(_bulkCalc) calcINT();
  closeBulkNameModal();
}
document.addEventListener('click', e => {
  if(e.target === document.getElementById('bulk-name-modal')) closeBulkNameModal();
});

// ── Bulk Account Modal ──
function openBulkAcctModal() {
  document.getElementById('bulk-acct-input').value = '';
  document.getElementById('bulk-acct-modal').style.display = 'flex';
}
function closeBulkAcctModal() {
  document.getElementById('bulk-acct-modal').style.display = 'none';
}
function saveBulkAcct() {
  const emails = document.getElementById('bulk-acct-input').value
    .split('\n').map(l => l.trim()).filter(Boolean);
  if(!emails.length) { closeBulkAcctModal(); return; }
  // Get current col values from col header inputs
  const cols = Array.from(document.querySelectorAll('.acct-col')).map(i => i.value.trim()).filter(Boolean);
  emails.forEach(email => {
    addAcctRow(email);
  });
  rebuildAcct();
  closeBulkAcctModal();
}

function getSlAccountSoftwareNames() {
  return [...new Set(Array.from(document.querySelectorAll('#sl-rows .sl-name'))
    .map(input => input.value.trim()).filter(Boolean))];
}

function downloadSlAccountTemplate() {
  if(typeof XLSX === 'undefined') { alert('SheetJS ยังโหลดไม่เสร็จ'); return; }
  const softwareNames = getAcctCols();
  if(!softwareNames.length) { alert('กรุณากรอกชื่อ Software หรือหัวตาราง Account ก่อนดาวน์โหลด Template'); return; }
  const ws = XLSX.utils.aoa_to_sheet([
    ['Email', ...softwareNames],
    ['user@orbitdigital.co.th', ...softwareNames.map(() => '✓')]
  ]);
  ws['!cols'] = [{wch:32}, ...softwareNames.map(name => ({wch:Math.max(14, name.length + 2)}))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Accounts');
  XLSX.writeFile(wb, 'sl_account_template.xlsx');
}

async function uploadSlAccountFile(input) {
  const file = input?.files?.[0];
  if(!file) return;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, {type:'array'});
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''});
    const headers = (rows[0] || []).map(value => String(value).trim());
    const softwareNames = getAcctCols();
    if(headers[0] !== 'Email' || headers.slice(1).length !== softwareNames.length ||
       headers.slice(1).some((name, i) => name !== softwareNames[i])) {
      alert('หัวตารางไม่ตรงกับรายการ Software ปัจจุบัน กรุณาดาวน์โหลด Template ใหม่');
      return;
    }
    const cols = document.getElementById('acct-cols');
    cols.innerHTML = softwareNames.map(name => `<input class="ri acct-col" value="${esc(name)}" data-manual="true" style="font-size:11px;padding:5px 7px" oninput="markAcctColEdited(this)">`).join('');
    const body = document.getElementById('acct-body');
    body.innerHTML = '';
    rows.slice(1).filter(row => String(row[0] || '').trim()).forEach(row => {
      const tr = document.createElement('tr');
      const vals = softwareNames.map((_, i) => String(row[i + 1] || '').trim() ? 'Y' : '');
      tr.innerHTML = _buildAcctRow(String(row[0]).trim(), vals, softwareNames.length);
      body.appendChild(tr);
    });
    rebuildAcct();
    alert(`✓ นำเข้า Account ${body.children.length} รายการแล้ว`);
  } catch(e) {
    console.error('SL account upload failed', e);
    alert('อ่านไฟล์ Account ไม่สำเร็จ กรุณาใช้ไฟล์ Excel หรือ CSV ตาม Template');
  } finally {
    input.value = '';
  }
}
document.addEventListener('click', e => {
  if(e.target === document.getElementById('bulk-acct-modal')) closeBulkAcctModal();
});
// ── Apply Draft Edit ──
async function applyDraftEdit() {
  try {
    const raw = localStorage.getItem('orbit-pmo-edit-draft');
    if(!raw) return;
    const memo = JSON.parse(raw);
    if(!memo || memo.status !== 'draft') return;
    localStorage.removeItem('orbit-pmo-edit-draft');
    _editingSourceMemoNo = memo.sourceMemoNo || null;
    _editingDraftMemoNo = memo.memoNo || null;

    // Select type
    const typeBtn = document.querySelector(`.type-btn[onclick*="selectType('${memo.type}"]`) ||
                    [...document.querySelectorAll('.type-btn')].find(b => b.getAttribute('onclick')?.includes(`'${memo.type}'`));
    if(typeBtn) typeBtn.click();

    const loadingApprovers = document.getElementById('approver-rows-form');
    if(loadingApprovers) loadingApprovers.innerHTML = '<div style="font-size:12px;color:var(--text-3);padding:8px 0">Loading approver list...</div>';
    await loadUserProfilesAsync();
    if(loadingApprovers) loadingApprovers.innerHTML = '';

    const waitForApproverRows = expectedCount => new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const check = () => {
        const container = document.getElementById('approver-rows-form');
        const rows = container ? [...container.querySelectorAll('.appr-form-row')] : [];
        const selects = container ? container.querySelectorAll('.appr-name-sel') : [];
        if(container && selects.length >= expectedCount) return resolve({ container, rows });
        if(Date.now() >= deadline) return reject(new Error('Approver rows did not render in time'));
        requestAnimationFrame(check);
      };
      check();
    });

      // Store memoNo so saveDraft/submit updates instead of creates. A blank
      // memoNo means Duplicate/Re-edit-rejected (draftFromMemo strips it) —
      // it must stay blank, not auto-fill with a preview number.
      const memoNoEl = document.getElementById('f-memo-no');
      if(memoNoEl) memoNoEl.value = memo.memoNo || '';

      // Restore the memo date on Re-edit. Duplicate intentionally strips it
      // (draftFromMemo) so it falls back to today, same as a brand-new memo.
      const dateEl = document.getElementById('f-date');
      if(dateEl) dateEl.value = thaiDateToISO(memo.date) || (typeof todayISO !== 'undefined' ? todayISO : '');

      const projSel = document.getElementById('f-project');
      if(projSel) {
        const opt = [...projSel.options].find(o => o.value === memo.project);
        if(opt) { projSel.value = memo.project; toggleOtherProject(); }
        else { projSel.value = 'other'; toggleOtherProject(); const oth = document.getElementById('f-project-other'); if(oth) oth.value = memo.project || ''; }
      }

      // Milestone 2 Task 2.1 — restore the memo's own currency on Re-edit/Duplicate.
      const currencySel = document.getElementById('f-currency');
      if(currencySel) currencySel.value = memo.currency || 'THB';

      const toSel = document.getElementById('f-to');
      if(toSel) { const opt = [...toSel.options].find(o => o.value === memo.to); if(opt) toSel.value = memo.to; else { toSel.value = 'other'; toggleToOther(); const oth = document.getElementById('f-to-other'); if(oth) oth.value = memo.to || ''; } }

      const subjectEl = document.getElementById('f-subject');
      if(subjectEl) { subjectEl.value = memo.subject || ''; subjectEl.dataset.manualEdit = 'true'; }

      const reasonSel = document.getElementById('f-reason');
      if(reasonSel) {
        const opt = [...reasonSel.options].find(o => o.value === memo.reason);
        if(opt) reasonSel.value = memo.reason;
        else { reasonSel.value = 'other'; toggleOther(); const oth = document.getElementById('f-reason-other'); if(oth) oth.value = memo.reason || ''; }
      }

      // Sign date
      const signDate = document.getElementById('f-signdate');
      if(signDate && memo.reviewerDate) signDate.value = thaiDateToISO(memo.reviewerDate);

      // Fill dynamic approver rows from approvers[]
      const savedApprovers = memo.approvers || [];
      const { container: apprContainer } = await waitForApproverRows(0);
      if (savedApprovers.length > 0) {
        apprContainer.innerHTML = '';
        savedApprovers.forEach((a, i) => _appendApproverRow(i === 0));
        const { rows } = await waitForApproverRows(savedApprovers.length);
        savedApprovers.forEach((a, i) => {
          const row = rows[i];
          if (!row) return;
          const nameSel = row.querySelector('.appr-name-sel');
          const nameWarning = row.querySelector('.appr-name-warning');
          const titleSel = row.querySelector('.appr-title-sel');
          const titleWarning = row.querySelector('.appr-title-warning');
          const nameOpt = nameSel && [...nameSel.options].find(o => o.value === a.name);
          if (nameOpt) {
            nameSel.value = a.name;
          } else if (nameSel) {
            nameSel.value = '';
            if(nameWarning) {
              nameWarning.textContent = `ไม่พบชื่อผู้อนุมัติเดิม ('${a.name || '-'}') ในรายชื่อปัจจุบัน กรุณาเลือกผู้อนุมัติใหม่`;
              nameWarning.style.display = '';
            }
          }
          const titleOpt = titleSel && [...titleSel.options].find(o => o.value === a.title);
          if (titleOpt) {
            titleSel.value = a.title;
          } else if (titleSel) {
            titleSel.value = '';
            if(titleWarning) {
              titleWarning.textContent = `ไม่พบตำแหน่งเดิม ('${a.title || '-'}') ในรายชื่อปัจจุบัน กรุณาเลือกตำแหน่งใหม่`;
              titleWarning.style.display = '';
            }
          }
        });
        _updateApproverUI();
        updateSelfA1Notice();
      } else {
        initApproverRows();
      }

      // Restore memo-type-specific detail (software/hardware/account rows,
      // internal/entertainment/deployment fields) and recalculate totals from
      // the restored source data — see HOTFIX: Memo Detail Restore.
      populateMemoTypeDetail(memo);

  } catch(e) { console.error('applyDraftEdit error', e); }
}

// Final audit follow-up: Duplicate/Re-edit Hardware row restore. Prefers the
// structured memo.hwItems array (newer memos, populated by collectMemoData()
// since the "Memo Detail Restore" hotfix). Falls back to scraping the
// printable "รายการ Hardware" HTML table for legacy/test memos that only have
// hwItems empty/missing — mirrors views/device.js's own _hwLineItemsFromMemo()
// legacy-scrape pattern, but kept independent (Create Memo form restore needs
// price too, which the PO-creation helper does not; PO-creation logic itself
// is untouched).
function _hwItemsForFormRestore(memo) {
  const structured = (memo.hwItems || [])
    .map(it => ({ name: (it.name || '').trim(), price: it.price || 0, qty: it.qty || 0 }))
    .filter(it => it.name && it.name !== '-');
  if (structured.length) return structured;

  const section = (memo.sections || []).find(s => s.title === 'รายการ Hardware');
  if (!section || typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(section.html, 'text/html');
  const legacyItems = [];
  doc.querySelectorAll('tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 4) return;
    const name  = cells[1]?.textContent?.trim();
    const price = parseFloat(String(cells[2]?.textContent || '').replace(/[^0-9.]/g, '')) || 0;
    const qty   = parseInt(cells[3]?.textContent, 10) || 1;
    if (!name || name === '-') return;
    legacyItems.push({ name, price, qty });
  });
  return legacyItems;
}

// ── Restore memo-type-specific detail sections from a saved/duplicated memo ──
// Runs after the type button + header/approver fields are populated above.
function populateMemoTypeDetail(memo) {
  if (memo.type === 'sl') {
    const slRowsC = document.getElementById('sl-rows');
    if (slRowsC && (memo.slItems||[]).length) {
      slRowsC.innerHTML = '';
      memo.slItems.forEach(() => addSLRow());
      const rowEls = slRowsC.querySelectorAll('.item-row');
      memo.slItems.forEach((item, i) => {
        const row = rowEls[i];
        if (!row) return;
        if (row.querySelector('.sl-name'))  row.querySelector('.sl-name').value  = (item.name && item.name !== '-') ? item.name : '';
        if (row.querySelector('.sl-plan'))  row.querySelector('.sl-plan').value  = item.plan || '';
        if (row.querySelector('.sl-price')) row.querySelector('.sl-price').value = item.price || '';
        if (row.querySelector('.sl-mo'))    row.querySelector('.sl-mo').value    = item.months || '';
        if (row.querySelector('.sl-qty'))   row.querySelector('.sl-qty').value   = item.qty || '';
        if (row.querySelector('.sl-start')) row.querySelector('.sl-start').value = item.startMonth || '';
        if (row.querySelector('.sl-end'))   row.querySelector('.sl-end').value   = item.endMonth || '';
      });
    }
    const slAmt = document.querySelector('#fs-sl .form-grid .fg:nth-child(2) input');
    if (slAmt) slAmt.value = memo.amountWords || '';
    if (typeof calcSL === 'function') calcSL();
    if (typeof syncAcctColsFromSoftware === 'function') syncAcctColsFromSoftware();

    if ((memo.acctCols||[]).length) {
      const colInputs = document.querySelectorAll('#acct-cols .acct-col');
      memo.acctCols.forEach((name, i) => {
        if (colInputs[i]) { colInputs[i].value = name; colInputs[i].dataset.manual = 'true'; }
      });
    }
    const acctBody = document.getElementById('acct-body');
    if (acctBody && (memo.acctRows||[]).length) {
      acctBody.innerHTML = '';
      memo.acctRows.forEach(r => addAcctRow(r.email));
      const trs = acctBody.querySelectorAll('tr');
      memo.acctRows.forEach((r, i) => {
        const tr = trs[i];
        if (!tr) return;
        const checks = tr.querySelectorAll('.acct-val');
        (r.checks||[]).forEach((checked, ci) => { if (checks[ci]) checks[ci].checked = !!checked; });
      });
    }
  }

  if (memo.type === 'hw') {
    const hwRowsC = document.getElementById('hw-rows');
    const hwItems = _hwItemsForFormRestore(memo);
    if (hwRowsC && hwItems.length) {
      hwRowsC.innerHTML = '';
      hwItems.forEach(() => addHWRow());
      const rowEls = hwRowsC.querySelectorAll('.item-row');
      hwItems.forEach((item, i) => {
        const row = rowEls[i];
        if (!row) return;
        const inputs = row.querySelectorAll('input');
        if (inputs[0]) inputs[0].value = item.name || '';
        if (inputs[1]) inputs[1].value = item.price || '';
        if (inputs[2]) inputs[2].value = item.qty || '';
      });
    }
    const hwAmt = document.querySelector('#fs-hw .form-grid .fg:nth-child(1) input');
    if (hwAmt) hwAmt.value = memo.amountWords || '';
    const hwOwnerEl = document.querySelector('#fs-hw .form-grid .fg:nth-child(2) input');
    if (hwOwnerEl) hwOwnerEl.value = memo.hwOwner || '';
    if (typeof calcHW === 'function') calcHW();
  }

  if (memo.type === 'int') {
    const actEl = document.getElementById('int-activity');
    if (actEl) actEl.value = memo.intActivity || '';
    const dateEl = document.getElementById('int-date');
    if (dateEl) dateEl.value = thaiDateToISO(memo.intDate);
    const hcEl = document.getElementById('int-headcount');
    if (hcEl) hcEl.value = memo.intHeadcount || '';
    const ppEl = document.getElementById('int-pp');
    if (ppEl) ppEl.value = memo.intPP || '';
    const amtEl = document.getElementById('int-amount-words');
    if (amtEl) amtEl.value = memo.amountWords || '';
    const namesC = document.getElementById('int-names');
    if (namesC && (memo.intNames||[]).length) {
      namesC.innerHTML = '';
      memo.intNames.forEach(() => addName('int-names', 'int-name', true));
      const rowInputs = namesC.querySelectorAll('.int-name');
      memo.intNames.forEach((name, i) => { if (rowInputs[i]) rowInputs[i].value = name || ''; });
    }
    if (typeof calcINT === 'function') calcINT();
    if (typeof checkIntHeadcount === 'function') checkIntHeadcount();
  }

  if (memo.type === 'ent') {
    const entInp = document.querySelectorAll('#fs-ent input');
    if (entInp[0]) entInp[0].value = memo.entClient || '';
    if (entInp[1]) entInp[1].value = thaiDateToISO(memo.entDate);
    if (entInp[2]) entInp[2].value = memo.entPlace || '';
    if (entInp[3]) entInp[3].value = memo.entPeople || '';
    if (entInp[4]) entInp[4].value = memo.total || '';
    if (entInp[5]) entInp[5].value = memo.amountWords || '';
  }

  if (memo.type === 'dep') {
    const startEl = document.getElementById('dep-start');
    if (startEl) startEl.value = thaiDateToISO(memo.depStart);
    const endEl = document.getElementById('dep-end');
    if (endEl) endEl.value = thaiDateToISO(memo.depEnd);
    const locEl = document.getElementById('dep-location');
    if (locEl) locEl.value = memo.depLocation || '';
    const empEl = document.getElementById('dep-emp-count');
    if (empEl) empEl.value = memo.depEmpCount || '';
    const amtEl = document.getElementById('dep-amount-words');
    if (amtEl) amtEl.value = memo.amountWords || '';
    const itemsC = document.getElementById('dep-items');
    if (itemsC && (memo.depItems||[]).length) {
      itemsC.innerHTML = '';
      memo.depItems.forEach(it => { if (it.kind === 'text') addDepTextItem(); else addDepCalcItem(); });
      const rowEls = itemsC.querySelectorAll('.dep-row');
      memo.depItems.forEach((it, i) => {
        const row = rowEls[i];
        if (!row) return;
        if (it.kind === 'text') {
          const t = row.querySelector('.dep-item-text');
          if (t) t.value = it.text || '';
        } else {
          const n = row.querySelector('.dep-item-name');
          const p = row.querySelector('.dep-item-price');
          const q = row.querySelector('.dep-item-qty');
          if (n) n.value = it.name || '';
          if (p) p.value = it.price || '';
          if (q) q.value = it.qty || '';
        }
      });
    }
    if (typeof calcDepGrand === 'function') calcDepGrand();
    if (itemsC) {
      itemsC.querySelectorAll('.dep-calc-row').forEach(row => {
        const priceInp = row.querySelector('.dep-item-price');
        if (priceInp && typeof calcDepRow === 'function') calcDepRow(priceInp);
      });
    }
  }
}
