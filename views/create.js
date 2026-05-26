// ─────────────────────────────────────────
// views/create.js — form, type, validate, PDF collect
// ─────────────────────────────────────────

let selectedType = null;
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
    document.querySelectorAll('#form-body input[type="text"], #form-body input[type="number"], #form-body input[type="date"], #form-body textarea').forEach(el => { el.value = ''; });
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
    ['int-names','dep-names','ent-names'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.innerHTML = '';
    });
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
function calcSL() {
  let t = 0;
  document.querySelectorAll('#sl-rows .item-row').forEach(r => {
    t += (parseFloat(r.querySelector('.sl-price')?.value)||0) *
         (parseInt(r.querySelector('.sl-mo')?.value)||0) *
         (parseInt(r.querySelector('.sl-qty')?.value)||0);
  });
  document.getElementById('sl-total').textContent = '฿'+t.toLocaleString('th-TH');
}
function calcHW() {
  let t = 0;
  document.querySelectorAll('#hw-rows .item-row').forEach(r => {
    t += (parseFloat(r.querySelector('.hw-price')?.value)||0) *
         (parseInt(r.querySelector('.hw-qty')?.value)||0);
  });
  document.getElementById('hw-total').textContent = '฿'+t.toLocaleString('th-TH');
}
function calcINT() {
  const pp = parseFloat(document.getElementById('int-pp')?.value)||0;
  const n  = document.querySelectorAll('.int-name').length;
  document.getElementById('int-total').textContent = '฿'+(pp*n).toLocaleString('th-TH');
}

// ── Row helpers ──
const TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`;
function rmRow(btn, cid) {
  const c = document.getElementById(cid);
  if(c.querySelectorAll('.item-row').length > 1) btn.closest('.item-row').remove();
}
function addSLRow() {
  const d = document.createElement('div'); d.className='item-row'; d.style.gridTemplateColumns='3fr 1.2fr 0.8fr 0.8fr 30px';
  d.innerHTML = `<input class="ri" type="text" placeholder="ชื่อ Software"><input class="ri sl-price" type="number" placeholder="ราคา" oninput="calcSL()"><input class="ri sl-mo" type="number" value="12" oninput="calcSL()"><input class="ri sl-qty" type="number" placeholder="จำนวน" oninput="calcSL()"><button class="rm-btn" onclick="rmRow(this,'sl-rows');calcSL()" title="ลบ">${TRASH}</button>`;
  document.getElementById('sl-rows').appendChild(d);
}
function addHWRow() {
  const d = document.createElement('div'); d.className='item-row'; d.style.gridTemplateColumns='3fr 1.4fr 1fr 30px';
  d.innerHTML = `<input class="ri" type="text" placeholder="ชื่ออุปกรณ์"><input class="ri hw-price" type="number" placeholder="ราคา" oninput="calcHW()"><input class="ri hw-qty" type="number" placeholder="จำนวน" oninput="calcHW()"><button class="rm-btn" onclick="rmRow(this,'hw-rows');calcHW()" title="ลบ">${TRASH}</button>`;
  document.getElementById('hw-rows').appendChild(d);
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
function rebuildAcct() {
  const cols = getAcctCols(); const show = cols.length ? cols : ['Col 1'];
  const head = document.getElementById('acct-head');
  const body = document.getElementById('acct-body');
  head.innerHTML = `<tr style="background:var(--bg)"><th style="padding:6px 10px;text-align:left;border:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase">Email</th>${show.map(c=>`<th style="padding:6px 10px;text-align:center;border:1px solid var(--border);font-size:10px;font-weight:600;color:var(--text-3);width:80px">${c}</th>`).join('')}<th style="width:36px;border:1px solid var(--border)"></th></tr>`;
  Array.from(body.querySelectorAll('tr')).forEach(tr => {
    const email = tr.querySelector('.acct-email')?.value||'';
    const vals  = Array.from(tr.querySelectorAll('.acct-val')).map(s=>s.value);
    tr.innerHTML = _buildAcctRow(email, vals, show.length);
  });
  if(!body.children.length) addAcctRow();
}
function _buildAcctRow(email, vals, n) {
  let h = `<td style="padding:3px 6px;border:1px solid var(--border)"><input type="text" class="ri acct-email" placeholder="email@orbitdigital.co.th" value="${email}" style="font-size:11px;padding:3px 7px"></td>`;
  for(let i=0;i<n;i++) h += `<td style="padding:3px 6px;border:1px solid var(--border);text-align:center"><select class="acct-val" style="font-size:11px;padding:2px 4px;width:100%;border:1px solid var(--border-md);border-radius:4px"><option${vals[i]==='-'||!vals[i]?' selected':''}>-</option><option${vals[i]==='✓'?' selected':''}>✓</option></select></td>`;
  h += `<td style="padding:3px 4px;border:1px solid var(--border);text-align:center"><button class="rm-btn" onclick="this.closest('tr').remove()" style="width:24px;height:24px" title="ลบ">${TRASH}</button></td>`;
  return h;
}
function addAcctRow(email) {
  const n = getAcctCols().length || 1;
  const tr = document.createElement('tr');
  tr.innerHTML = _buildAcctRow(email||'', [], n);
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
      const depInp = document.querySelectorAll('#fs-dep input');
      const start = depInp[0]?.value ? dateInput(depInp[0].value) : 'วันที่เริ่ม';
      const end   = depInp[1]?.value ? dateInput(depInp[1].value) : 'วันที่สิ้นสุด';
      return `ขออนุมัติงบประมาณค่าใช้จ่ายสำหรับพนักงานที่ปฏิบัติการ Deployment ของ ${p} ในวันที่ ${start} – ${end}`;
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
  // Read "เรียน" from dropdown or other input
  const toSel = document.getElementById('f-to');
  const toVal = toSel?.value === 'other' ? (val('#f-to-other') || '') : (toSel?.value || '');

  // Read reviewer name/title from dropdowns
  const revNameSel = document.getElementById('f-reviewer-name');
  const revName = revNameSel?.value === 'other' ? (val('#f-reviewer-name-other') || '') : (revNameSel?.value || '');
  const revTitleSel = document.getElementById('f-reviewer-title');
  const revTitle = revTitleSel?.value === 'other' ? (val('#f-reviewer-title-other') || '') : (revTitleSel?.value || '');

  // Read approver name/title from dropdowns
  const apprNameSel = document.getElementById('f-approver-name');
  const apprName = apprNameSel?.value === 'other' ? (val('#f-approver-name-other') || '') : (apprNameSel?.value || '');
  const apprTitleSel = document.getElementById('f-appr-title');
  const apprTitle = apprTitleSel?.value === 'other' ? (val('#f-appr-title-other') || '') : (apprTitleSel?.value || '');

  const data = {
    type: selectedType, typeLabel: TYPE_LABELS[selectedType]||'-',
    memoNo: val('#f-memo-no'), date: dateInput(val('#f-date')),
    project: val('#f-project')==='other' ? val('#f-project-other') : val('#f-project'),
    to: toVal, subject: '', reason: selectedReason(),
    reviewerName: revName || '-', reviewerTitle: revTitle || '-',
    reviewerDate: dateInput(val('#f-signdate')) || TODAY,
    approverName: apprName || '-', approverTitle: apprTitle || '-',
    approverDate: dateInput(val('#f-apprdate')) || TODAY,
    sections: [], total: 0, amountWords: ''
  };
  // Use typed subject if user filled it, else auto-generate from current form state
  const typedSubject = val('#f-subject')?.trim();
  data.subject = typedSubject || memoSubject(data);
  if(data.type==='sl') {
    const rows = Array.from(document.querySelectorAll('#sl-rows .item-row')).map((row,i) => {
      const inp = row.querySelectorAll('input');
      const price=Number(inp[1]?.value)||0, months=Number(inp[2]?.value)||0, qty=Number(inp[3]?.value)||0;
      return { no:i+1, name:inp[0]?.value.trim()||'-', price, months, qty, subtotal:price*months*qty };
    });
    data.total = rows.reduce((s,r)=>s+r.subtotal, 0);
    data.amountWords = val('#fs-sl .form-grid .fg:nth-child(2) input');
    data.sections.push({ title:'รายการ Software', html:table(['#','ชื่อ Software','฿/เดือน','เดือน','จำนวน','รวม'], rows.map(r=>[r.no,r.name,money(r.price),r.months,r.qty,money(r.subtotal)]), [2,5]) });
    const acctCols = getAcctCols();
    const acctRows = Array.from(document.querySelectorAll('#acct-body tr')).map(tr=>[val('.acct-email',tr),...Array.from(tr.querySelectorAll('.acct-val')).map(s=>s.value)]).filter(r=>r.some(Boolean));
    if(acctCols.length && acctRows.length) data.sections.push({ title:'ตาราง Account', html:table(['Email',...acctCols], acctRows, []) });
  }
  if(data.type==='hw') {
    const rows = Array.from(document.querySelectorAll('#hw-rows .item-row')).map((row,i) => {
      const inp = row.querySelectorAll('input');
      const price=Number(inp[1]?.value)||0, qty=Number(inp[2]?.value)||0;
      return { no:i+1, name:inp[0]?.value.trim()||'-', price, qty, subtotal:price*qty };
    });
    data.total = rows.reduce((s,r)=>s+r.subtotal,0);
    data.amountWords = val('#fs-hw .form-grid .fg:nth-child(1) input');
    const owner = val('#fs-hw .form-grid .fg:nth-child(2) input');
    data.sections.push({ title:'รายการ Hardware', html:table(['#','ชื่ออุปกรณ์','ราคา/ชิ้น','จำนวน','รวม'], rows.map(r=>[r.no,r.name,money(r.price),r.qty,money(r.subtotal)]), [2,4]) });
    if(owner) data.sections.push({ title:'ผู้รับผิดชอบดูแลอุปกรณ์', html:`<p>${esc(owner)}</p>` });
  }
  if(data.type==='int') {
    const fs = document.querySelector('#fs-int');
    const inp = fs.querySelectorAll('input');
    const pp = Number(inp[2]?.value)||0;
    const names = Array.from(fs.querySelectorAll('.int-name')).map((i,idx)=>[idx+1,i.value.trim()||'-']);
    data.total = pp*names.length;
    data.amountWords = inp[3]?.value.trim()||'';
    data.sections.push({ title:'รายละเอียดกิจกรรม', html:`<p>ไตรมาส/ครั้งที่: ${esc(inp[0]?.value||'-')}<br>วันที่: ${esc(dateInput(inp[1]?.value))}<br>วงเงิน/คน: ${esc(money(pp))}</p>` });
    data.sections.push({ title:'รายชื่อผู้เข้าร่วม', html:table(['#','ชื่อ-นามสกุล / ตำแหน่ง'], names, []) });
  }
  if(data.type==='ent') {
    const inp = document.querySelectorAll('#fs-ent input');
    data.total = Number(inp[5]?.value)||0;
    data.amountWords = inp[6]?.value.trim()||'';
    data.sections.push({ title:'รายละเอียดงานเลี้ยงรับรอง', html:`<p>ลูกค้า: ${esc(inp[0]?.value||'-')}<br>วันที่: ${esc(dateInput(inp[1]?.value))} ${esc(inp[2]?.value||'')}<br>สถานที่: ${esc(inp[3]?.value||'-')}<br>จำนวน: ${esc(inp[4]?.value||'-')} คน</p>` });
  }
  if(data.type==='dep') {
    const fs = document.querySelector('#fs-dep');
    const inp = fs.querySelectorAll('input');
    data.amountWords = inp[4]?.value.trim()||'';
    const names = Array.from(fs.querySelectorAll('.dep-name')).map((i,idx)=>[idx+1,i.value.trim()||'-']);
    data.sections.push({ title:'รายละเอียด Deployment', html:`<p>ช่วงวันที่: ${esc(dateInput(inp[0]?.value))} - ${esc(dateInput(inp[1]?.value))}<br>สถานที่: ${esc(inp[2]?.value||'-')}<br>รูปแบบ: ${esc(fs.querySelector('select')?.value||'-')}<br>วงเงินอำนาจ: ${esc(inp[5]?.value||'-')} บาท</p>` });
    if(names.length) data.sections.push({ title:'รายชื่อพนักงาน', html:table(['#','ชื่อ-นามสกุล / ตำแหน่ง'], names, []) });
  }
  return data;
}
function validateMemo(data) {
  const missing = [];

  // ── Common fields ──
  if(!data.type) missing.push('ประเภท Memo');
  if(!val('#f-project')) missing.push('โครงการ');
  else if(val('#f-project')==='other' && !val('#f-project-other')) missing.push('ชื่อโครงการ');
  if(!data.to) missing.push('เรียน');
  if(!data.subject || !data.subject.trim()) missing.push('หัวข้อเรื่อง (ห้ามว่าง)');
  if(!data.reason) missing.push('เหตุผลในการขอ');

  // ── Signature fields ──
  if(!data.reviewerName || data.reviewerName==='-') missing.push('ชื่อ Reviewer');
  if(!data.reviewerTitle || data.reviewerTitle==='-') missing.push('ตำแหน่ง Reviewer');
  if(!val('#f-signdate')) missing.push('วันที่ลงนาม Reviewer');
  if(!data.approverName || data.approverName==='-') missing.push('ชื่อ Approver');
  if(!data.approverTitle || data.approverTitle==='-') missing.push('ตำแหน่ง Approver');
  if(!val('#f-apprdate')) missing.push('วันที่ลงนาม Approver');

  // ── SL ──
  if(data.type==='sl') {
    const slRows = Array.from(document.querySelectorAll('#sl-rows .item-row'));
    if(!slRows.some(r => r.querySelector('input:first-child')?.value?.trim()))
      missing.push('ชื่อ Software (อย่างน้อย 1 รายการ)');
    slRows.forEach((r, i) => {
      const name = r.querySelector('input:first-child')?.value?.trim();
      if(!name) return;
      if(!(parseFloat(r.querySelector('.sl-price')?.value) > 0)) missing.push(`Software แถว ${i+1}: ราคา/เดือน`);
      if(!(parseInt(r.querySelector('.sl-mo')?.value) > 0))    missing.push(`Software แถว ${i+1}: จำนวนเดือน`);
      if(!(parseInt(r.querySelector('.sl-qty')?.value) > 0))   missing.push(`Software แถว ${i+1}: จำนวน (Qty)`);
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
    if(!Array.from(document.querySelectorAll('.int-name')).some(i=>i.value.trim()))
      missing.push('รายชื่อผู้เข้าร่วม (อย่างน้อย 1 คน)');
    const fs = document.querySelector('#fs-int');
    const inp = fs?.querySelectorAll('input');
    if(!inp?.[0]?.value?.trim()) missing.push('ไตรมาส/ครั้งที่');
    if(!inp?.[1]?.value?.trim()) missing.push('วันที่จัดกิจกรรม');
    if(!(parseFloat(inp?.[2]?.value) > 0)) missing.push('วงเงิน/คน');
    if(!inp?.[3]?.value?.trim()) missing.push('จำนวนเงินเป็นตัวอักษร (INT)');
  }

  // ── ENT ──
  if(data.type==='ent') {
    const entInp = document.querySelectorAll('#fs-ent input');
    if(!entInp[0]?.value?.trim()) missing.push('ชื่อลูกค้า / บริษัท');
    if(!entInp[1]?.value?.trim()) missing.push('วันที่ (ENT)');
  }

  if(missing.length) { alert('กรุณากรอกข้อมูลให้ครบ:\n\n• '+missing.join('\n• ')); return false; }
  return true;
}
// ── Save as Draft ──
function saveDraft() {
  if(!selectedType) { alert('กรุณาเลือกประเภท Memo ก่อน'); return; }
  const data = collectMemoData();
  data.status = 'draft';
  if(!data.memoNo) {
    data.memoNo = 'DRAFT-' + Date.now().toString(36).toUpperCase();
  }
  // If editing existing draft, keep same memoNo
  saveMemo(data);
  renderPendingMemos();
  alert(`✓ บันทึก Draft แล้ว — ${data.memoNo}`);
  resetMemoForm();
  swView('pending', document.querySelector('.sb-sub-item[onclick*="pending"]'), 'Pending Approval');
  switchPendingTab('drafts');
}

async function generateMemoPdf() {
  const data = collectMemoData();
  if(!validateMemo(data)) return;
  try {
    const saved = saveMemo(data);
    renderPendingMemos();
    await downloadMemoPdf(saved);

    alert(`บันทึก ${saved.memoNo} ใน Pending แล้ว และสร้าง PDF เรียบร้อย`);
  } catch(e) {
    console.error(e);
    alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
  }
}
function resetMemoForm() {
  if(confirm('ล้างข้อมูลที่กรอกหรือไม่?')) location.reload();
}

// ── Dropdown toggle helpers ──
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
function toggleApproverNameOther() {
  const sel = document.getElementById('f-approver-name');
  const el  = document.getElementById('f-approver-name-other');
  if(el) el.style.display = sel?.value === 'other' ? 'block' : 'none';
}
function toggleApproverTitleOther() {
  const sel = document.getElementById('f-appr-title');
  const el  = document.getElementById('f-appr-title-other');
  if(el) el.style.display = sel?.value === 'other' ? 'block' : 'none';
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
document.addEventListener('click', e => {
  if(e.target === document.getElementById('bulk-acct-modal')) closeBulkAcctModal();
});
// ── Apply Draft Edit ──
function applyDraftEdit() {
  try {
    const raw = localStorage.getItem('orbit-pmo-edit-draft');
    if(!raw) return;
    const memo = JSON.parse(raw);
    if(!memo || memo.status !== 'draft') return;
    localStorage.removeItem('orbit-pmo-edit-draft');

    // Select type
    const typeBtn = document.querySelector(`.type-btn[onclick*="selectType('${memo.type}"]`) ||
                    [...document.querySelectorAll('.type-btn')].find(b => b.getAttribute('onclick')?.includes(`'${memo.type}'`));
    if(typeBtn) typeBtn.click();

    // Fill common fields after short delay (selectType rerenders form)
    setTimeout(() => {
      // Store memoNo so saveDraft/submit updates instead of creates
      const memoNoEl = document.getElementById('f-memo-no');
      if(memoNoEl) memoNoEl.value = memo.memoNo || '';

      const projSel = document.getElementById('f-project');
      if(projSel) {
        const opt = [...projSel.options].find(o => o.value === memo.project);
        if(opt) { projSel.value = memo.project; toggleOtherProject(); }
        else { projSel.value = 'other'; toggleOtherProject(); const oth = document.getElementById('f-project-other'); if(oth) oth.value = memo.project || ''; }
      }

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

      // Reviewer/Approver
      const revNameSel = document.getElementById('f-reviewer-name');
      if(revNameSel) { const opt = [...revNameSel.options].find(o => o.value === memo.reviewerName); if(opt) revNameSel.value = memo.reviewerName; else { revNameSel.value = 'other'; toggleReviewerNameOther(); const oth = document.getElementById('f-reviewer-name-other'); if(oth) oth.value = memo.reviewerName || ''; } }
      const revTitleSel = document.getElementById('f-reviewer-title');
      if(revTitleSel) { const opt = [...revTitleSel.options].find(o => o.value === memo.reviewerTitle); if(opt) revTitleSel.value = memo.reviewerTitle; }
      const signDate = document.getElementById('f-signdate');
      if(signDate && memo.reviewerDate) signDate.value = memo.reviewerDate.slice(0,10);

      const apprNameSel = document.getElementById('f-approver-name');
      if(apprNameSel) { const opt = [...apprNameSel.options].find(o => o.value === memo.approverName); if(opt) apprNameSel.value = memo.approverName; else { apprNameSel.value = 'other'; toggleApproverNameOther(); const oth = document.getElementById('f-approver-name-other'); if(oth) oth.value = memo.approverName || ''; } }
      const apprTitleSel = document.getElementById('f-appr-title');
      if(apprTitleSel) { const opt = [...apprTitleSel.options].find(o => o.value === memo.approverTitle); if(opt) apprTitleSel.value = memo.approverTitle; }
      const apprDate = document.getElementById('f-apprdate');
      if(apprDate && memo.approverDate) apprDate.value = memo.approverDate.slice(0,10);

    }, 150);
  } catch(e) { console.error('applyDraftEdit error', e); }
}
