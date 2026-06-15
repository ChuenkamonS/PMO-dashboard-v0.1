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

// ── Search state ──
let _pendingSearch = '';

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
}

// ── Main render ──
function renderPendingMemos() {
  populatePendingFilters();

  const allMemos = loadMemos();
  const pending  = allMemos.filter(m => m.status === 'pending' || m.status === 'pending_a2');

  // Sidebar badge
  const badge = document.querySelector('#memo-sub .sb-badge');
  if (badge) badge.textContent = pending.length;

  // KPI cards
  const el = id => document.getElementById(id);
  if (el('pending-count')) el('pending-count').textContent = pending.length;

  // Oldest pending
  const oldest = pending.reduce((max, m) => Math.max(max, pendingAge(m)), 0);
  if (el('pending-oldest-days')) el('pending-oldest-days').textContent = pending.length ? oldest : '—';

  // Total amount pending
  const totalAmt = pending.reduce((s, m) => s + (Number(m.total)||0), 0);
  if (el('pending-total-amt')) el('pending-total-amt').textContent = pending.length ? money(totalAmt) : '—';

  renderPendingContent();
}

function renderPendingContent() {
  const list = document.getElementById('pending-list');
  if (!list) return;

  // Inbox = pending only
  let memos = loadMemos().filter(m => m.status === 'pending' || m.status === 'pending_a2');
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
    list.innerHTML = `<div class="placeholder" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:38px 20px"><h3>ไม่มี Memo ที่รออนุมัติ</h3><p>สร้าง Memo แล้วกด Save & Generate PDF เพื่อให้รายการมาแสดงที่นี่</p></div>`;
    return;
  }

  const thead = `<table class="hist-table hist-table--dense" style="table-layout:fixed;width:100%">
    <colgroup>
      <col style="width:14%"><col style="width:5%"><col style="width:8%">
      <col style="width:10%"><col style="width:8%"><col style="width:9%">
      <col style="width:13%"><col style="width:13%"><col style="width:6%">
      <col style="width:10%">
    </colgroup>
    <thead><tr>
      <th>เลข Memo</th><th>Type</th><th>โครงการ</th><th>ผู้ขอ</th>
      <th style="text-align:right">วงเงิน</th><th>สถานะ</th>
      <th>Reviewer (A1)</th><th>Approver (A2)</th>
      <th>รอ</th><th style="text-align:center">จัดการ</th>
    </tr></thead><tbody>`;

  const rows = memos.map(m => buildPendingRow(m)).join('');

  list.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <div style="padding:8px 14px;border-bottom:1px solid var(--border);font-size:11px;color:var(--text-3)">
      แสดง ${memos.length} รายการ · คลิกแถวเพื่อดูรายละเอียด
    </div>
    <div style="overflow-x:auto">${thead}${rows}</tbody></table></div>
  </div>`;

  list.onclick = function(e) {
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const no = btn.dataset.memo;
    if(btn.dataset.action==='approve')     openApproveModal(no);
    else if(btn.dataset.action==='reject') openRejectModal(no);
    else if(btn.dataset.action==='cancel') cancelMemo(no);
    else if(btn.dataset.action==='detail') openDetailModal(no);
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
  const stage   = memo.status === 'pending_a2' ? 'Pending A2' : 'Pending A1';
  const isOwn   = (memo.requesterName||'') === currentUser();
  const canAct  = !isOwn;
  const accent  = TYPE_COLOR_PENDING[memo.type] || '#888780';
  const typeLbl = TYPE_LABEL_PENDING[memo.type] || (memo.type||'').toUpperCase();
  const typeBg  = TYPE_BG_PENDING[memo.type]    || '#F1EFE8';
  const typeTxt = TYPE_TEXT_PENDING[memo.type]  || '#444441';
  const waitCls = days>7?'background:#FCEBEB;color:#791F1F':days>3?'background:#FAEEDA;color:#633806':'background:#EAF3DE;color:#27500A';
  const statusCls = memo.status==='completed'?'background:#EAF3DE;color:#27500A':memo.status==='rejected'?'background:#FCEBEB;color:#791F1F':'background:#EEEDFE;color:#3C3489';
  const statusLbl = memo.status==='completed'?'Completed':memo.status==='rejected'?'Rejected':stage;

  const isPending = memo.status === 'pending' || memo.status === 'pending_a2';
  const actionBtns = canAct
    ? `<button class="btn-approve" data-action="approve" data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 7px">✓</button>
       <button class="btn-reject"  data-action="reject"  data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 7px;margin-left:2px">✕</button>
       <button class="btn-sm"      data-action="detail"  data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 6px;margin-left:2px">⊙</button>`
    : `<button class="btn-sm" data-action="detail" data-memo="${esc(memo.memoNo)}" style="font-size:11px;padding:3px 8px">Details</button>
       ${isOwn && isPending ? `<button class="btn-sm" data-action="cancel" data-memo="${esc(memo.memoNo)}" style="font-size:11px;padding:3px 8px;margin-left:4px;color:var(--red)" title="ยกเลิก Memo นี้">✕ Cancel</button>` : ''}`;

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

// ── Draft row builder (kept for reference, not used in pending inbox) ──
// Draft management is handled in All Memos (history.js)


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
    const memo      = memos.find(m => m.memoNo === memoNo);
    if (!memo) return;
    const approvers = memo.approvers || [];
    const user      = currentUser();

    // Determine which approver step we're on
    const isPendingA2 = memo.status === 'pending_a2';
    const actionKey   = isPendingA2 ? 'approved_a2' : 'approved_a1';

    appendAuditLog(memos, memoNo,
      isPendingA2 ? `A2 Approved by ${user}` : `A1 Approved by ${user}`, note);

    updateMemoStatusAsync(memoNo, actionKey, { approvalNote: note, approvedBy: user });
  });
  storeMemos(memos);
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
  const statusCls   = memo.status==='completed'?'badge-green':memo.status==='rejected'?'badge-red':memo.status==='draft'?'badge-gray':'badge-amber';
  const statusLabel = memo.status==='completed'?'Completed':memo.status==='rejected'?'Rejected':memo.status==='draft'?'Draft':memo.status==='pending_a2'?'Pending A2':'Pending A1';

  const isOwn  = (memo.requesterName || '') === currentUser();
  const isPMO  = true; // TODO: replace with role check after auth
  const canAct = (memo.status==='pending'||memo.status==='pending_a2') && !isOwn;

  // Approval chain display
  const approvers = memo.approvers || [];
  const approvalChain = approvers.length ? `
    <div style="margin-bottom:16px">
      <div style="font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Approval Chain</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${approvers.map((a, i) => {
          const dotColor = a.status==='approved' ? 'var(--green)' : a.status==='rejected' ? 'var(--red)' : 'var(--amber)';
          const dotLabel = a.status==='approved' ? '✅' : a.status==='rejected' ? '❌' : '⏳';
          return `<div style="border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 12px;min-width:140px">
            <div style="font-size:10px;color:var(--text-3);margin-bottom:2px">A${i+1} ${dotLabel}</div>
            <div style="font-size:12px;font-weight:600">${esc(a.name||'-')}</div>
            <div style="font-size:11px;color:var(--text-3)">${esc(a.title||'-')}</div>
            ${a.approvedAt ? `<div style="font-size:10px;color:var(--green);margin-top:3px">${shortDate(a.approvedAt)}</div>` : ''}
            ${a.status==='rejected' ? `<div style="font-size:10px;color:var(--red);margin-top:3px">Rejected</div>` : ''}
          </div>`;
        }).join('<div style="display:flex;align-items:center;color:var(--text-3);font-size:18px;padding-top:12px">→</div>')}
      </div>
    </div>` : '';

  // PMO override note (if any)
  const pmoNote = memo.pmoOverrideNote ? `
    <div style="padding:8px 12px;background:#FFF7E6;border-radius:var(--r-sm);margin-bottom:12px;font-size:12px;border-left:3px solid var(--amber)">
      <span style="font-weight:600;color:var(--amber)">⚠ PMO Override</span>
      <span style="color:var(--text-2);margin-left:8px">${esc(memo.pmoOverrideNote)}</span>
      ${memo.pmoOverrideBy ? `<div style="font-size:10px;color:var(--text-3);margin-top:2px">โดย ${esc(memo.pmoOverrideBy)}</div>` : ''}
    </div>` : '';
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
    ${approvalChain}
    ${pmoNote}

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
  if (isPMO && memo.status !== 'draft') {
    acts.innerHTML += `
      <button class="btn-sm" style="color:var(--blue);margin-left:4px" onclick="closeDetailModal();openPmoEditApproversModal('${esc(memo.memoNo)}')">✎ Approvers</button>
      <button class="btn-sm" style="color:var(--red);margin-left:4px" onclick="closeDetailModal();openPmoOverrideModal('${esc(memo.memoNo)}')">⚠ Override</button>`;
  }
  document.getElementById('detail-modal').style.display = 'flex';
}
function closeDetailModal() { document.getElementById('detail-modal').style.display='none'; }

// ══════════════════════════════════════════
// PMO TOOLS
// ══════════════════════════════════════════

// ── PMO Override Status ──
function openPmoOverrideModal(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;
  document.getElementById('pmo-override-memo-no')?.remove?.();

  const existing = document.getElementById('pmo-override-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pmo-override-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center';

  const statusOpts = [
    { v: 'pending',    l: 'Pending (A1)' },
    { v: 'pending_a2', l: 'Pending A2' },
    { v: 'completed',  l: 'Completed (Approved)' },
    { v: 'rejected',   l: 'Rejected' },
  ].map(o => `<option value="${o.v}" ${memo.status === o.v ? 'selected' : ''}>${o.l}</option>`).join('');

  modal.innerHTML = `
    <div class="card" style="width:460px;max-width:95vw;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:15px;font-weight:700;color:var(--red)">⚠ PMO Override Status</span>
        <button class="btn-sm" onclick="document.getElementById('pmo-override-modal').remove()" style="padding:4px 10px">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-bottom:14px">
        Memo: <strong>${esc(memo.memoNo)}</strong> · ${esc(memo.subject || memo.project || '-')}
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600;color:var(--text-2)">เปลี่ยนสถานะเป็น *</label>
        <select id="pmo-new-status" class="ri" style="margin-top:4px">${statusOpts}</select>
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600;color:var(--text-2)">อนุมัติโดย (ชื่อผู้อนุมัติจริง)</label>
        <input id="pmo-approved-by" class="ri" style="margin-top:4px" placeholder="เช่น นาย ปกรณ์ เจียมสกุลทิพย์">
      </div>
      <div class="fg" style="margin-bottom:16px">
        <label style="font-size:11px;font-weight:600;color:var(--red)">เหตุผล/หมายเหตุ * (บังคับ)</label>
        <textarea id="pmo-override-note" class="ri" rows="3" style="margin-top:4px" placeholder="ระบุเหตุผล เช่น อนุมัติผ่าน Email เมื่อ 10/06/69 จาก CEO"></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-ghost" onclick="document.getElementById('pmo-override-modal').remove()">Cancel</button>
        <button class="btn-primary" style="background:var(--red);border-color:var(--red)" onclick="confirmPmoOverride('${esc(memoNo)}')">⚠ Override</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function confirmPmoOverride(memoNo) {
  const newStatus   = document.getElementById('pmo-new-status')?.value;
  const note        = document.getElementById('pmo-override-note')?.value.trim();
  const approvedBy  = document.getElementById('pmo-approved-by')?.value.trim();

  if (!note) { alert('กรุณาระบุเหตุผล/หมายเหตุ'); return; }

  const memos = loadMemos();
  const user  = currentUser();
  appendAuditLog(memos, memoNo, `PMO Override → ${newStatus} by ${user}`, note);
  storeMemos(memos);

  updateMemoStatusAsync(memoNo, newStatus, {
    pmoOverrideNote: note,
    pmoOverrideBy:   user,
    approvedBy:      approvedBy || user,
    approvalNote:    note,
  });

  document.getElementById('pmo-override-modal')?.remove();
  closeDetailModal();
  alert('✓ Override เสร็จสิ้น');
}

// ── PMO Edit Approvers ──
function openPmoEditApproversModal(memoNo) {
  const memo      = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;
  const approvers = memo.approvers || [];
  const s         = typeof loadSettings === 'function' ? loadSettings() : null;
  const names     = s?.approverNames || [];
  const titles    = s?.approverTitles || [];

  const existing = document.getElementById('pmo-approvers-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pmo-approvers-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center';

  const nameOpts  = names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const titleOpts = titles.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');

  const renderApproverRow = (a, idx) => `
    <div class="approver-edit-row" style="border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px">
      <div style="font-size:10px;font-weight:600;color:var(--text-3);margin-bottom:6px">
        A${idx+1} ${a.status === 'approved' ? '✅ Approved แล้ว — แก้ไขไม่ได้' : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
        <div>
          <label style="font-size:11px;color:var(--text-3)">ชื่อ</label>
          <input class="ri appr-name" style="margin-top:3px;font-size:12px" value="${esc(a.name||'')}" ${a.status==='approved'?'disabled':''}>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-3)">ตำแหน่ง</label>
          <input class="ri appr-title" style="margin-top:3px;font-size:12px" value="${esc(a.title||'')}" ${a.status==='approved'?'disabled':''}>
        </div>
        ${a.status !== 'approved' && idx > 0 ? `<button class="btn-sm" onclick="this.closest('.approver-edit-row').remove()" style="color:var(--red);padding:6px 8px">✕</button>` : '<div></div>'}
      </div>
    </div>`;

  modal.innerHTML = `
    <div class="card" style="width:520px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:15px;font-weight:700">แก้ไข Approvers</span>
        <button class="btn-sm" onclick="document.getElementById('pmo-approvers-modal').remove()" style="padding:4px 10px">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-bottom:14px">
        Memo: <strong>${esc(memo.memoNo)}</strong>
      </div>
      <div id="approver-rows">${approvers.map(renderApproverRow).join('')}</div>
      ${approvers.length < 3 ? `
        <button class="add-btn" onclick="addApproverRow()" style="margin-bottom:14px">+ เพิ่ม Approver</button>` : ''}
      <div class="fg" style="margin-bottom:16px">
        <label style="font-size:11px;font-weight:600;color:var(--text-2)">เหตุผลที่แก้ไข *</label>
        <textarea id="pmo-appr-note" class="ri" rows="2" style="margin-top:4px" placeholder="เช่น เปลี่ยน Approver ตามคำขอ CEO"></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-ghost" onclick="document.getElementById('pmo-approvers-modal').remove()">Cancel</button>
        <button class="btn-primary" onclick="confirmPmoEditApprovers('${esc(memoNo)}')">💾 บันทึก</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function addApproverRow() {
  const container = document.getElementById('approver-rows');
  if (!container) return;
  const idx = container.querySelectorAll('.approver-edit-row').length;
  if (idx >= 3) { alert('มี Approver ได้สูงสุด 3 คน'); return; }
  const row = document.createElement('div');
  row.className = 'approver-edit-row';
  row.style.cssText = 'border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px';
  row.innerHTML = `
    <div style="font-size:10px;font-weight:600;color:var(--text-3);margin-bottom:6px">A${idx+1}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
      <div><label style="font-size:11px;color:var(--text-3)">ชื่อ</label><input class="ri appr-name" style="margin-top:3px;font-size:12px" placeholder="ชื่อ-นามสกุล"></div>
      <div><label style="font-size:11px;color:var(--text-3)">ตำแหน่ง</label><input class="ri appr-title" style="margin-top:3px;font-size:12px" placeholder="ตำแหน่ง"></div>
      <button class="btn-sm" onclick="this.closest('.approver-edit-row').remove()" style="color:var(--red);padding:6px 8px">✕</button>
    </div>`;
  container.appendChild(row);
}

function confirmPmoEditApprovers(memoNo) {
  const note = document.getElementById('pmo-appr-note')?.value.trim();
  if (!note) { alert('กรุณาระบุเหตุผลที่แก้ไข'); return; }

  const rows      = document.querySelectorAll('#approver-rows .approver-edit-row');
  const memo      = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;

  const newApprovers = Array.from(rows).map((row, i) => {
    const name  = row.querySelector('.appr-name')?.value.trim()  || '';
    const title = row.querySelector('.appr-title')?.value.trim() || '';
    const orig  = (memo.approvers || [])[i];
    // Keep existing status/dates for already-approved approvers
    if (orig?.status === 'approved') return orig;
    return { name, title, status: 'pending', approvedAt: null, approvedBy: null };
  }).filter(a => a.name);

  if (!newApprovers.length) { alert('ต้องมี Approver อย่างน้อย 1 คน'); return; }

  const memos = loadMemos();
  const idx   = memos.findIndex(m => m.memoNo === memoNo);
  if (idx < 0) return;

  // Determine correct status based on approvers chain
  const firstPending = newApprovers.findIndex(a => a.status !== 'approved');
  let newStatus = memo.status;
  if (firstPending === 0) newStatus = 'pending';
  else if (firstPending === 1) newStatus = 'pending_a2';
  else if (firstPending < 0) newStatus = 'completed';

  const user = currentUser();
  appendAuditLog(memos, memoNo, `PMO แก้ไข Approvers by ${user}`, note);
  memos[idx] = { ...memos[idx], approvers: newApprovers, status: newStatus, updatedAt: new Date().toISOString() };
  storeMemos(memos);

  updateMemoStatusAsync(memoNo, newStatus, {
    approvers:       newApprovers,
    pmoOverrideNote: note,
    pmoOverrideBy:   user,
  });

  document.getElementById('pmo-approvers-modal')?.remove();
  closeDetailModal();
  alert('✓ แก้ไข Approvers เสร็จสิ้น');
}

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

// ── Cancel Memo (by requester) ──
function cancelMemo(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if(!memo) return;
  if(!confirm(`ยกเลิก Memo "${memoNo}"?\nหลังจากยกเลิกแล้วจะไม่สามารถกู้คืนได้`)) return;
  updateMemoStatus(memoNo, 'cancelled', {
    rejectionReason: 'ยกเลิกโดยผู้ขอ',
    rejectedBy: currentUser(),
  });
  renderPendingMemos();
  renderHistoryMemos();
}

function approveMemo(memoNo) { openApproveModal(memoNo); }
function rejectMemo(memoNo)  { openRejectModal(memoNo); }
