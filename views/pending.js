// ─────────────────────────────────────────
// views/pending.js — Enhanced Pending Memo
// ─────────────────────────────────────────

// ── Budget Ceiling Storage (Supabase settings table + localStorage fallback) ──
const BUDGET_KEY = 'orbit-pmo-budgets-v1';
const DEFAULT_BUDGETS = { 'AOA-MP':500000, 'TTB':500000, 'Geo9':300000, 'Release 2.1':300000, 'Release 3':500000 };

async function loadBudgetsAsync() {
  if (await checkSupa()) {
    try {
      const row = await supaFetch('settings', 'GET', null, '?id=eq.budgets');
      if (row && row[0]?.data) {
        const b = row[0].data;
        try { localStorage.setItem(BUDGET_KEY, JSON.stringify(b)); } catch(e) {}
        return b;
      }
    } catch(e) { console.warn('loadBudgets Supabase failed', e.message); }
  }
  return loadBudgets();
}
async function saveBudgetsAsync(b) {
  storeBudgets(b);
  if (await checkSupa()) {
    try {
      await supaFetch('settings', 'POST', { id: 'budgets', data: b }, '?on_conflict=id');
    } catch(e) { console.warn('saveBudgets Supabase failed', e.message); }
  }
}
function loadBudgets() {
  try { const b = JSON.parse(localStorage.getItem(BUDGET_KEY)||'null'); return b || {...DEFAULT_BUDGETS}; }
  catch(e) { return {...DEFAULT_BUDGETS}; }
}
function storeBudgets(b) { try { localStorage.setItem(BUDGET_KEY, JSON.stringify(b)); } catch(e) {} }
function getProjectBudget(project) { return loadBudgets()[project] || 0; }
function getProjectUsed(project) {
  return loadMemos().filter(m => m.project === project && m.status === 'completed')
    .reduce((s,m) => s+(Number(m.total)||0), 0);
}

// ── Helpers ──
function pendingAge(memo) {
  const iso = memo.submittedAt || memo.createdAt;
  if(!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
function currentUser() { return document.getElementById('sb-uname')?.textContent?.trim() || 'Chuen K.'; }
function appendAuditLog(memos, memoNo, action, comment) {
  const idx = memos.findIndex(m => m.memoNo === memoNo);
  if(idx<0) return;
  if(!memos[idx].auditLog) memos[idx].auditLog = [];
  memos[idx].auditLog.push({ actor:currentUser(), action, comment:comment||'', timestamp:new Date().toISOString() });
}
function formatDateTime(iso) {
  if(!iso) return '-';
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return '-';
  const day   = String(d.getDate()).padStart(2,'0');
  const month = String(d.getMonth()+1).padStart(2,'0');
  const yy    = String(d.getFullYear()+543).slice(-2);
  const hh    = String(d.getHours()).padStart(2,'0');
  const mm    = String(d.getMinutes()).padStart(2,'0');
  return `${day}/${month}/${yy} · ${hh}:${mm}`;
}

// ── Tab state ──
let _pendingTab = 'submitted';
let _pendingSearch = '';

function switchPendingTab(tab) {
  _pendingTab = tab;
  document.querySelectorAll('.pend-tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if(b.dataset.tab === tab) {
      b.style.background = '';
      b.style.color = '';
    } else {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-2)';
    }
  });
  renderPendingContent();
}

// ── Populate filter dropdowns dynamically from actual memo data ──
function populatePendingFilters() {
  const allMemos = loadMemos();
  const projects = [...new Set(allMemos.map(m => m.project).filter(Boolean))].sort();

  const projSel = document.getElementById('pend-filter-project');
  if (projSel) {
    const cur = projSel.value;
    projSel.innerHTML = `<option value="all">ทุกโครงการ</option>` +
      projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    if ([...projSel.options].some(o => o.value === cur)) projSel.value = cur;
  }
  // Type dropdown is static (SL/HW/INT/ENT/DEP won't change) — no need to populate
}

// ── Main render ──
function renderPendingMemos() {
  const list = document.getElementById('pending-list');
  if(!list) return;

  populatePendingFilters();

  const allMemos  = loadMemos();
  // awaiting = still needs a decision
  const awaiting  = allMemos.filter(m => !m.status || m.status === 'pending');
  // submitted = already decided (completed or rejected) — distinct from awaiting
  const submitted = allMemos.filter(m => ['completed','rejected'].includes(m.status));
  const drafts    = allMemos.filter(m => m.status === 'draft');

  const el = id => document.getElementById(id);
  if(el('pending-count'))        el('pending-count').textContent        = awaiting.length;
  if(el('pending-my-submitted')) el('pending-my-submitted').textContent = submitted.length;
  if(el('pending-draft-count'))  el('pending-draft-count').textContent  = drafts.length;

  const badge = document.querySelector('#memo-sub .sb-badge');
  if(badge) badge.textContent = awaiting.length;

  const counts = { awaiting: awaiting.length, submitted: submitted.length, drafts: drafts.length };
  Object.entries(counts).forEach(([tab, count]) => {
    const el = document.querySelector(`.pend-tab-btn[data-tab="${tab}"] .tab-count`);
    if(el) el.textContent = count > 0 ? count : '';
  });
  renderPendingContent();
}

function renderPendingContent() {
  const list = document.getElementById('pending-list');
  if(!list) return;
  let memos = loadMemos();
  // awaiting = pending decisions only
  // submitted = completed or rejected (already decided) — NOT the same as awaiting
  // drafts = drafts only
  if(_pendingTab==='awaiting')  memos = memos.filter(m => !m.status || m.status==='pending');
  if(_pendingTab==='submitted') memos = memos.filter(m => ['completed','rejected'].includes(m.status));
  if(_pendingTab==='drafts')    memos = memos.filter(m => m.status==='draft');
  if(_pendingSearch) {
    const s = _pendingSearch.toLowerCase();
    memos = memos.filter(m => (m.memoNo||'').toLowerCase().includes(s)||(m.project||'').toLowerCase().includes(s)||(m.reviewerName||'').toLowerCase().includes(s));
  }
  const typeF = val('#pend-filter-type')    ||'all';
  const projF = val('#pend-filter-project') ||'all';
  if(typeF!=='all') memos = memos.filter(m=>m.type===typeF);
  if(projF!=='all') memos = memos.filter(m=>m.project===projF);
  // Sort
  const sortF = val('#pend-sort') || 'date-desc';
  memos.sort((a,b) => {
    if(sortF==='amount-desc') return (Number(b.total)||0)-(Number(a.total)||0);
    if(sortF==='amount-asc')  return (Number(a.total)||0)-(Number(b.total)||0);
    if(sortF==='wait-desc')   return pendingAge(b)-pendingAge(a);
    return new Date(b.createdAt||0)-new Date(a.createdAt||0); // date-desc default
  });

  if(!memos.length) {
    const emptyStates = {
      awaiting:  { h:'ไม่มี Memo ที่รออนุมัติ',     p:'สร้าง Memo แล้วกด Save & Generate PDF เพื่อให้รายการมาแสดงที่นี่' },
      submitted: { h:'ยังไม่มี Memo ที่เคยส่ง',       p:'Memo ที่สร้างและส่งทั้งหมดจะแสดงที่นี่' },
      drafts:    { h:'ยังไม่มี Draft',                p:'กด Save to Draft เพื่อบันทึก Memo ไว้ก่อนส่ง' },
      rejected:  { h:'ไม่มี Memo ที่ถูกปฏิเสธ',      p:'Memo ที่ถูก Reject จะแสดงที่นี่เพื่อแก้ไขและส่งใหม่' },
    };
    const es = emptyStates[_pendingTab] || { h:'ไม่มีข้อมูล', p:'ยังไม่มีรายการ' };
    list.innerHTML = `<div class="placeholder" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:38px 20px"><h3>${es.h}</h3><p>${es.p}</p></div>`;
    return;
  }

  // Build table
  const thead = `<table class="hist-table hist-table--dense" style="table-layout:fixed;width:100%">
    <colgroup>
      <col style="width:14%">
      <col style="width:5%">
      <col style="width:8%">
      <col style="width:10%">
      <col style="width:8%">
      <col style="width:9%">
      <col style="width:13%">
      <col style="width:13%">
      <col style="width:6%">
      <col style="width:10%">
    </colgroup>
    <thead><tr>
      <th>เลข Memo</th>
      <th>Type</th>
      <th>โครงการ</th>
      <th>ผู้ขอ</th>
      <th style="text-align:right">วงเงิน</th>
      <th>สถานะ</th>
      <th>Reviewer (A1)</th>
      <th>Approver (A2)</th>
      <th>รอ</th>
      <th style="text-align:center">จัดการ</th>
    </tr></thead><tbody>`;

  const rows = _pendingTab === 'drafts'
    ? memos.map(m => buildDraftRow(m)).join('')
    : memos.map(m => buildPendingRow(m)).join('');

  list.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <div style="padding:8px 14px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3)">
      แสดง ${memos.length} รายการ · คลิกแถวเพื่อดูรายละเอียด
    </div>
    <div style="overflow-x:auto">${thead}${rows}</tbody></table></div>
  </div>`;

  // Event delegation
  list.onclick = function(e) {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const no = btn.dataset.memo;
    if(btn.dataset.action==='approve')      openApproveModal(no);
    else if(btn.dataset.action==='reject')  openRejectModal(no);
    else if(btn.dataset.action==='detail')  openDetailModal(no);
    else if(btn.dataset.action==='draft-view')   openDetailModal(no);
    else if(btn.dataset.action==='draft-edit')   editDraft(no);
    else if(btn.dataset.action==='draft-delete') deleteDraft(no);
  };
}

// ── Table row builders ──
const TYPE_LABEL_PENDING = { sl:'SL', hw:'HW', int:'INT', ent:'ENT', dep:'DEP' };
const TYPE_COLOR_PENDING = { sl:'#185FA5', hw:'#444441', int:'#3B6D11', ent:'#854F0B', dep:'#3C3489' };
const TYPE_BG_PENDING    = { sl:'#E6F1FB', hw:'#F1EFE8', int:'#EAF3DE', ent:'#FAEEDA', dep:'#EEEDFE' };
const TYPE_TEXT_PENDING  = { sl:'#0C447C', hw:'#2C2C2A', int:'#27500A', ent:'#633806', dep:'#26215C' };

function buildPendingRow(memo) {
  const days    = pendingAge(memo);
  const amt     = Number(memo.total)||0;
  const stage   = memo.approvalStage || 'Pending A1';
  const isOwn   = (memo.requesterName||'') === currentUser();
  const canAct  = _pendingTab==='awaiting' && !isOwn;
  const accent  = TYPE_COLOR_PENDING[memo.type] || '#888780';
  const typeLbl = TYPE_LABEL_PENDING[memo.type] || (memo.type||'').toUpperCase();
  const typeBg  = TYPE_BG_PENDING[memo.type]    || '#F1EFE8';
  const typeTxt = TYPE_TEXT_PENDING[memo.type]  || '#444441';
  const waitCls = days>7?'background:#FCEBEB;color:#791F1F':days>3?'background:#FAEEDA;color:#633806':'background:#EAF3DE;color:#27500A';
  const statusCls = memo.status==='completed'?'background:#EAF3DE;color:#27500A':memo.status==='rejected'?'background:#FCEBEB;color:#791F1F':'background:#EEEDFE;color:#3C3489';
  const statusLbl = memo.status==='completed'?'Completed':memo.status==='rejected'?'Rejected':stage;

  const actionBtns = canAct
    ? `<button class="btn-approve" data-action="approve" data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 7px">✓</button>
       <button class="btn-reject"  data-action="reject"  data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 7px;margin-left:2px">✕</button>
       <button class="btn-sm"      data-action="detail"  data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 6px;margin-left:2px">⊙</button>`
    : `<button class="btn-sm" data-action="detail" data-memo="${esc(memo.memoNo)}" style="font-size:11px;padding:3px 8px">Details</button>`;

  return `<tr style="cursor:pointer" onclick="if(!event.target.closest('[data-action]'))openDetailModal('${esc(memo.memoNo)}')">
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;font-weight:600;color:var(--blue)">${esc(memo.memoNo)}</span>
      <div style="font-size:10px;color:var(--text-3)">${esc(formatDateTime(memo.createdAt))}</div>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:600;background:${typeBg};color:${typeTxt};padding:2px 7px;border-radius:4px">${typeLbl}</span>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text)">${esc(memo.project||'—')}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text)">${esc(memo.requesterName||memo.reviewerName||'—')}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:right;font-size:12px;font-weight:600;color:var(--text)">${money(amt)}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:4px;${statusCls}">${esc(statusLbl)}</span>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text)">
      ${esc(memo.reviewerName||'—')}<div style="font-size:10px;color:var(--text-3)">${esc(memo.reviewerTitle||'')}</div>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text)">
      ${esc(memo.approverName||'—')}<div style="font-size:10px;color:var(--text-3)">${esc(memo.approverTitle||'')}</div>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:500;padding:2px 7px;border-radius:10px;${waitCls}">${days} วัน</span>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:center;white-space:nowrap">${actionBtns}</td>
  </tr>`;
}

function buildDraftRow(memo) {
  const amt    = Number(memo.total)||0;
  const accent = TYPE_COLOR_PENDING[memo.type] || '#888780';
  const typeLbl = TYPE_LABEL_PENDING[memo.type] || (memo.type||'').toUpperCase();
  const typeBg  = TYPE_BG_PENDING[memo.type]    || '#F1EFE8';
  const typeTxt = TYPE_TEXT_PENDING[memo.type]  || '#444441';

  return `<tr style="cursor:pointer" onclick="if(!event.target.closest('[data-action]'))openDetailModal('${esc(memo.memoNo)}')">
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;font-weight:600;color:var(--text-2)">${esc(memo.memoNo)}</span>
      <div style="font-size:10px;color:var(--text-3)">${esc(formatDateTime(memo.createdAt))}</div>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:600;background:${typeBg};color:${typeTxt};padding:2px 7px;border-radius:4px">${typeLbl}</span>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text)">${esc(memo.project||'—')}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text)">${esc(memo.requesterName||memo.reviewerName||'—')}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:right;font-size:12px;font-weight:600;color:var(--text)">${money(amt)}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:500;background:#F1EFE8;color:#5F5E5A;padding:2px 7px;border-radius:4px">Draft</span>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3)" colspan="2">—</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">—</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:center;white-space:nowrap">
      <button data-action="draft-view"   data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 6px;cursor:pointer">⊙</button>
      <button data-action="draft-edit"   data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 6px;cursor:pointer;color:var(--blue);margin-left:2px">✎</button>
      <button data-action="draft-delete" data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 6px;cursor:pointer;color:var(--red);margin-left:2px">✕</button>
    </td>
  </tr>`;
}


// ── Edit Draft ──
function editDraft(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if(!memo || memo.status !== 'draft') return;
  // Store draft to load in create form
  try { localStorage.setItem('orbit-pmo-edit-draft', JSON.stringify(memo)); } catch(e) {}
  swView('create', document.querySelector('.sb-sub-item[onclick*="create"]'), 'Create Memo');
  // Trigger load after view switch
  setTimeout(() => { if(typeof applyDraftEdit === 'function') applyDraftEdit(); }, 100);
}

// ── Delete Draft ──
function deleteDraft(memoNo) {
  if(!confirm(`ลบ Draft "${memoNo}" ออกจากระบบ?`)) return;
  const memos = loadMemos().filter(m => m.memoNo !== memoNo);
  storeMemos(memos);
  renderPendingMemos();
}


// ── Approve Modal ──
function openApproveModal(memoNo, bulk) {
  const isBulk = Array.isArray(bulk) && bulk.length > 0;
  const targets = isBulk ? bulk : [memoNo];
  const memo = !isBulk ? loadMemos().find(m=>m.memoNo===memoNo) : null;
  const el = id => document.getElementById(id);
  if(isBulk) {
    el('approve-memo-no').textContent  = `${bulk.length} รายการ (${bulk.join(', ')})`;
    el('approve-project').textContent  = '—';
    el('approve-amount').textContent   = '—';
    el('approve-subject').textContent  = '—';
  } else {
    el('approve-memo-no').textContent  = memo?.memoNo || memoNo;
    el('approve-project').textContent  = memo?.project || '-';
    el('approve-amount').textContent   = money(Number(memo?.total)||0);
    el('approve-subject').textContent  = memo?.subject || '-';
  }
  el('approve-note').value = '';
  el('approve-modal').dataset.targets = JSON.stringify(targets);
  el('approve-modal').style.display   = 'flex';
}
function closeApproveModal() { document.getElementById('approve-modal').style.display='none'; }
function confirmApprove() {
  const targets = JSON.parse(document.getElementById('approve-modal').dataset.targets || '[]');
  const note    = document.getElementById('approve-note').value.trim();
  const memos   = loadMemos();
  targets.forEach(memoNo => {
    appendAuditLog(memos, memoNo, 'approved', note);
  });
  storeMemos(memos);
  targets.forEach(memoNo => updateMemoStatus(memoNo, 'completed', { approvalNote:note, approvedBy:currentUser() }));
  closeApproveModal();
  alert(`✓ Approved ${targets.length} รายการแล้ว`);
}

// ── Reject Modal ──
function openRejectModal(memoNo, bulk) {
  const isBulk = Array.isArray(bulk) && bulk.length > 0;
  const targets = isBulk ? bulk : [memoNo];
  const memo = !isBulk ? loadMemos().find(m=>m.memoNo===memoNo) : null;
  document.getElementById('reject-memo-no').textContent  = isBulk ? `${bulk.length} รายการ` : (memo?.memoNo || memoNo);
  document.getElementById('reject-reason-select').value  = '';
  document.getElementById('reject-comment').value        = '';
  document.getElementById('reject-modal').dataset.targets = JSON.stringify(targets);
  document.getElementById('reject-modal').style.display  = 'flex';
}
function closeRejectModal() { document.getElementById('reject-modal').style.display='none'; }
function confirmReject() {
  const targets = JSON.parse(document.getElementById('reject-modal').dataset.targets || '[]');
  const reason  = document.getElementById('reject-reason-select').value;
  const comment = document.getElementById('reject-comment').value.trim();
  if(!reason) { alert('กรุณาเลือกเหตุผลการ Reject'); return; }
  const full  = reason==='Other' ? (comment||'Other') : (comment?`${reason}: ${comment}`:reason);
  const memos = loadMemos();
  targets.forEach(memoNo => appendAuditLog(memos, memoNo, 'rejected', full));
  storeMemos(memos);
  targets.forEach(memoNo => updateMemoStatus(memoNo, 'rejected', { rejectionReason:full, rejectedBy:currentUser() }));
  closeRejectModal();
  alert(`Rejected ${targets.length} รายการแล้ว`);
}

// ── Detail Modal ──
function openDetailModal(memoNo) {
  const memo = loadMemos().find(m=>m.memoNo===memoNo);
  if(!memo) return;

  const typeLabel = { sl:'Software License', hw:'Hardware', int:'Team Activity', ent:'Client Expense', dep:'Deployment' }[memo.type] || (memo.type||'').toUpperCase();
  const accentColor = { sl:'#185FA5', hw:'#444441', int:'#3B6D11', ent:'#854F0B', dep:'#3C3489' }[memo.type] || '#888780';
  const statusCls = memo.status==='completed'?'badge-green':memo.status==='rejected'?'badge-red':memo.status==='draft'?'badge-gray':'badge-amber';
  const statusLabel = memo.status==='completed'?'Completed':memo.status==='rejected'?'Rejected':memo.status==='draft'?'Draft':'Pending';

  const sections = (memo.sections||[]).map(s=>`
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">${esc(s.title)}</div>
      <div style="border:1px solid var(--border);border-radius:var(--r-sm);overflow:hidden;font-size:12px">${s.html}</div>
    </div>`).join('');

  const auditLog = (memo.auditLog||[]).length
    ? (memo.auditLog||[]).map(e=>`
        <div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="font-size:11px;color:var(--text-3);white-space:nowrap;min-width:90px">${esc(shortDate(e.timestamp))}</div>
          <div style="font-size:12px;color:var(--text-2)">
            <span style="font-weight:600;color:var(--text)">${esc(e.actor)}</span> — ${esc(e.action)}
            ${e.comment?`<div style="font-size:11px;color:var(--text-3);margin-top:2px">${esc(e.comment)}</div>`:''}
          </div>
        </div>`).join('')
    : '<div style="font-size:12px;color:var(--text-3);padding:8px 0">ยังไม่มีประวัติ</div>';

  const isOwn  = (memo.requesterName || '') === currentUser();
  const canAct = (!memo.status||memo.status==='pending') && !isOwn;

  document.getElementById('detail-content').innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--border)">
      <div style="width:4px;height:32px;background:${accentColor};border-radius:2px;flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:700;color:var(--text)">${esc(memo.memoNo)}</span>
          <span class="badge ${statusCls}" style="font-size:10px">${statusLabel}</span>
        </div>
        <div style="font-size:11px;color:var(--text-3)">${esc(typeLabel)} · ${esc(memo.project||'-')} · ${esc(memo.date||'-')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:20px;font-weight:700;color:var(--blue-800)">${esc(money(memo.total||0))}</div>
      </div>
    </div>

    <!-- Info row -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:var(--bg);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:4px">เรียน</div>
        <div style="font-size:13px;color:var(--text)">${esc(memo.to||'-')}</div>
      </div>
      <div style="background:var(--bg);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:4px">เหตุผลในการขอ</div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">${esc(memo.reason||'-')}</div>
      </div>
    </div>

    <!-- Sections (tables) -->
    ${sections}

    <!-- People -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:4px">ผู้ขอ</div>
        <div style="font-size:12px;font-weight:600;color:var(--text)">${esc(memo.requesterName||memo.reviewerName||'-')}</div>
        <div style="font-size:11px;color:var(--text-3)">${esc(memo.requesterTitle||'PMO')}</div>
      </div>
      <div style="border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px">
        <div style="font-size:10px;color:var(--text-3);font-weight:600;text-transform:uppercase;margin-bottom:4px">Approver</div>
        <div style="font-size:12px;font-weight:600;color:var(--text)">${esc(memo.approverName||'-')}</div>
        <div style="font-size:11px;color:var(--text-3)">${esc(memo.approverTitle||'-')}</div>
      </div>
    </div>

    <!-- Approval/Rejection note -->
    ${memo.approvalNote?`<div style="padding:10px 12px;background:var(--green-50);border-radius:var(--r-sm);margin-bottom:12px;font-size:12px;color:var(--green)"><span style="font-weight:600">Approval Note:</span> ${esc(memo.approvalNote)}</div>`:''}
    ${memo.rejectionReason?`<div style="padding:10px 12px;background:var(--red-50);border-radius:var(--r-sm);margin-bottom:12px;font-size:12px;color:var(--red)"><span style="font-weight:600">Rejection Reason:</span> ${esc(memo.rejectionReason)}</div>`:''}

    <!-- Audit log -->
    <div>
      <div style="font-size:11px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Audit Log</div>
      <div style="border:1px solid var(--border);border-radius:var(--r-sm);padding:0 12px">${auditLog}</div>
    </div>`;

  const acts = document.getElementById('detail-actions');
  acts.innerHTML = canAct
    ? `<button class="btn-primary" onclick="closeDetailModal();openApproveModal('${esc(memo.memoNo)}')">✓ Approve</button>
       <button class="btn-reject" onclick="closeDetailModal();openRejectModal('${esc(memo.memoNo)}')">✕ Reject</button>`
    : '';
  acts.innerHTML += `<button class="btn-sm" onclick="openMemoPdf('${esc(memo.memoNo)}')">📄 PDF</button>`;
  document.getElementById('detail-modal').style.display = 'flex';
}
function closeDetailModal() { document.getElementById('detail-modal').style.display='none'; }

// ── Budget Settings ──
function openBudgetSettings() {
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Release 3'];
  // Load fresh from Supabase then render modal
  loadBudgetsAsync().then(b => {
    document.getElementById('budget-settings-body').innerHTML = projects.map(p=>`
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="width:110px;font-size:13px;font-weight:500">${esc(p)}</div>
        <input type="number" class="budget-ceiling-input" data-project="${esc(p)}" value="${b[p]||0}"
          style="flex:1;font-size:13px;padding:6px 10px;border:1px solid var(--border-md);border-radius:var(--r-sm)">
        <div style="font-size:11px;color:var(--text-3);white-space:nowrap">Used: ${money(getProjectUsed(p))}</div>
      </div>`).join('');
    document.getElementById('budget-settings-modal').style.display='flex';
  });
}
function closeBudgetSettings() { document.getElementById('budget-settings-modal').style.display='none'; }
function saveBudgetSettings() {
  const b = loadBudgets();
  document.querySelectorAll('.budget-ceiling-input').forEach(inp => { b[inp.dataset.project]=Number(inp.value)||0; });
  saveBudgetsAsync(b).then(() => {
    closeBudgetSettings();
    renderPendingMemos();
    alert('บันทึก Budget Ceiling แล้ว');
  });
}

// ── backward compat ──
function approveMemo(memoNo) { openApproveModal(memoNo); }
function rejectMemo(memoNo)  { openRejectModal(memoNo); }
