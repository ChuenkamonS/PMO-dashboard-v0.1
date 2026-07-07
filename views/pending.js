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
// currentUser() and appendAuditLog() defined in app.js — single source of truth
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
let _pendingLastRefreshedAt = null;

function updatePendingRefreshLabel() {
  const label = document.getElementById('pending-last-refreshed');
  if(!label || !_pendingLastRefreshedAt) return;
  const minutes = Math.floor((Date.now() - _pendingLastRefreshedAt) / 60000);
  label.textContent = minutes < 1 ? 'Last refreshed just now' : `Last refreshed ${minutes} min ago`;
}

async function refreshPendingMemos() {
  const btn = document.getElementById('pending-refresh-btn');
  if(btn) { btn.disabled = true; btn.textContent = 'Refreshing...'; }
  try {
    await loadMemosAsync();
    _pendingLastRefreshedAt = Date.now();
    renderPendingMemos();
    updatePendingRefreshLabel();
  } catch(e) {
    console.error('Pending refresh failed', e);
    alert('Refresh ไม่สำเร็จ กรุณาลองอีกครั้ง');
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = '↻ Refresh'; }
  }
}
setInterval(updatePendingRefreshLabel, 60000);

// ── Populate filter dropdowns dynamically from actual memo data ──
// Part 8 (UX consistency pass): Project is a multi-select filter.
function populatePendingFilters() {
  const allMemos = loadMemos();
  const projects = [...new Set(allMemos.map(m => m.project).filter(Boolean))].sort();
  const projSel = document.getElementById('pend-filter-project');
  if (projSel) {
    const curSelected = msValues('pend-filter-project');
    projSel.innerHTML = projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    Array.from(projSel.options).forEach(o => { if (curSelected.includes(o.value)) o.selected = true; });
    refreshMultiSelectUI('pend-filter-project');
  }
}

// ── Main render ──
function renderPendingMemos() {
  // Type/Project are multi-select filters; initMultiSelect() is idempotent
  // and must run before populatePendingFilters() populates the options.
  initMultiSelect('pend-filter-type', 'ทุกประเภท', 'Type');
  initMultiSelect('pend-filter-project', 'ทุกโครงการ', 'Project');
  populatePendingFilters();

  const allMemos = loadMemos();
  const pending  = allMemos.filter(isMemoVisibleInPending);

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

// ── Export Pending CSV ──────────────────────────────────────────
function exportPendingCSV() {
  const memos = loadMemos().filter(isMemoVisibleInPending);
  const headers = ['เลข Memo','ประเภท','โครงการ','ผู้ขอ','ตำแหน่ง','วงเงิน','สถานะ',
    'A1 ชื่อ','A1 ตำแหน่ง','A2 ชื่อ','A2 ตำแหน่ง','A3 ชื่อ','A3 ตำแหน่ง',
    'วันที่สร้าง','วันที่อัปเดต','เหตุผล'];
  const rows = memos.map(m => [
    m.memoNo, m.type?.toUpperCase(), m.project, m.requesterName, m.requesterTitle,
    m.total, m.status,
    m.approvers?.[0]?.name||'', m.approvers?.[0]?.title||'',
    m.approvers?.[1]?.name||'', m.approvers?.[1]?.title||'',
    m.approvers?.[2]?.name||'', m.approvers?.[2]?.title||'',
    m.createdAt?.slice(0,10), m.updatedAt?.slice(0,10), m.reason,
  ]);
  _downloadCSV('Pending_Approval', headers, rows);
}

function renderPendingContent() {
  const list = document.getElementById('pending-list');
  if (!list) return;

  // Inbox = pending only
  let memos = loadMemos().filter(isMemoVisibleInPending);
  if(_pendingSearch) {
    const s = _pendingSearch.toLowerCase();
    memos = memos.filter(m => [
      m.memoNo, m.project, m.reviewerName, m.requesterName, m.subject,
      ...(m.approvers || []).map(a => a.name),
    ].some(value => String(value || '').toLowerCase().includes(s)));
  }
  const typeF = msValues('pend-filter-type');
  const projF = msValues('pend-filter-project');
  if(typeF.length) memos = memos.filter(m=>typeF.includes(m.type));
  if(projF.length) memos = memos.filter(m=>projF.includes(m.project));
  // Sort
  const sortF = val('#pend-sort') || 'date-desc';
  memos.sort((a,b) => {
    if(sortF==='amount-desc') return (Number(b.total)||0)-(Number(a.total)||0);
    if(sortF==='amount-asc')  return (Number(a.total)||0)-(Number(b.total)||0);
    if(sortF==='wait-desc')   return pendingAge(b)-pendingAge(a);
    return new Date(b.createdAt||0)-new Date(a.createdAt||0); // date-desc default
  });

  if(!memos.length) {
    list.innerHTML = `<div class="placeholder" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:38px 20px"><h3>ไม่มี Memo ที่รออนุมัติ</h3><p>Memo ที่คุณส่งหรือรายการที่รอคุณอนุมัติจะแสดงที่นี่</p></div>`;
    return;
  }

  const thead = `<table class="hist-table hist-table--dense" style="table-layout:fixed;width:100%">
    <colgroup>
      <col style="width:14%"><col style="width:5%"><col style="width:10%">
      <col style="width:12%"><col style="width:10%"><col style="width:9%">
      <col style="width:12%"><col style="width:12%"><col style="width:16%">
    </colgroup>
    <thead><tr>
      <th>เลข Memo</th><th>Type</th><th>โครงการ</th><th>ผู้ขอ</th>
      <th style="text-align:right">วงเงิน</th><th>สถานะ</th>
      <th>วันที่ขอ</th><th>รอ (วัน)</th>
      <th style="text-align:center">จัดการ</th>
    </tr></thead><tbody>`;

  window._pendingAllMemos = memos;
  if (typeof window._pendingVisible === 'undefined') window._pendingVisible = 20;
  const _pendingSlice = memos.slice(0, window._pendingVisible);
  const rows = _pendingSlice.map(m => buildPendingRow(m)).join('');

  list.innerHTML = `<div class="card" style="padding:0;overflow:hidden">
    <div class="result-count">
      แสดง ${Math.min(memos.length, window._pendingVisible||20)} จาก ${memos.length} รายการ · คลิกแถวเพื่อดูรายละเอียด
    </div>
    <div style="overflow-x:auto">${thead}${rows}</tbody></table></div>
  </div>`;

  // Load More button
  const loadMoreContainer = document.getElementById('pending-load-more');
  if (loadMoreContainer) {
    const remaining = (window._pendingAllMemos||[]).length - _pendingVisible;
    loadMoreContainer.style.display = remaining > 0 ? '' : 'none';
    const lmBtn = loadMoreContainer.querySelector('button');
    if (lmBtn) lmBtn.textContent = `Load ${Math.min(remaining, 20)} more (เหลือ ${remaining} รายการ)`;
  }

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
  const isOwn   = isMemoRequester(memo);
  const _isPMOUser = typeof isPMO === 'function' && isPMO();
  const _stage  = memo.status === 'pending_a2' ? 1 : memo.status === 'pending_a3' ? 2 : 0;
  const _stageApprover = (memo.approvers||[])[_stage];
  const canAct  = canCurrentUserActOnMemo(memo) && !_isPMOUser;
  // PMO override: can approve any memo that is NOT their own
  const canActAsPMO = !isOwn && _isPMOUser;
  const accent  = TYPE_COLOR_PENDING[memo.type] || '#888780';
  const typeLbl = TYPE_LABEL_PENDING[memo.type] || (memo.type||'').toUpperCase();
  const typeBg  = TYPE_BG_PENDING[memo.type]    || '#F1EFE8';
  const typeTxt = TYPE_TEXT_PENDING[memo.type]  || '#444441';
  const waitCls = days>7?'background:#FCEBEB;color:#791F1F':days>3?'background:#FAEEDA;color:#633806':'background:#EAF3DE;color:#27500A';
  // Reuse the shared History/All Memo badge mapping (app.js) so the same memo status reads
  // identically in both places, instead of this tab's own separately-styled pill.
  const statusBadgeCls = histStatusBadgeClass(memo);
  const statusLbl = histStatusLabel(memo);

  const isPending  = ['pending','pending_a2','pending_a3'].includes(memo.status);
  const isOwner    = isOwn;
  const _pmo       = typeof isPMO === 'function' && isPMO();

  // Row action buttons — different per role
  let actionBtns = '';
  if (canActAsPMO) {
    // PMO sees decision actions (and the existing override cancel) — row click opens detail.
    actionBtns = `
      <button class="btn-approve" data-action="approve" data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 8px" title="Approve">✓</button>
      <button class="btn-reject"  data-action="reject"  data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 8px;margin-left:2px" title="Reject">✕</button>
      <button class="btn-sm"      data-action="cancel"  data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 8px;margin-left:2px;color:var(--red)" title="ยกเลิก">✕ Cancel</button>`;
  } else if (!isOwner && canAct) {
    // Approver (not own memo, their turn) — row click opens detail.
    actionBtns = `
      <button class="btn-approve" data-action="approve" data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 8px" title="Approve">✓</button>
      <button class="btn-reject"  data-action="reject"  data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 8px;margin-left:2px" title="Reject">✕</button>`;
  } else if (isOwner && isPending) {
    // Requester (own memo) — Cancel stays available; row click opens detail.
    actionBtns = `<button class="btn-sm" data-action="cancel" data-memo="${esc(memo.memoNo)}" style="font-size:10px;padding:2px 8px;color:var(--red)" title="ยกเลิก">✕ Cancel</button>`;
  } else {
    // Default users open detail by clicking the row.
    actionBtns = '';
  }

  const reqDate = memo.createdAt ? shortDate(memo.createdAt) : '—';
  const reqTime = memo.createdAt ? new Date(memo.createdAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Bangkok'}) : '';

  return `<tr style="cursor:pointer" onclick="if(!event.target.closest('[data-action]'))openDetailModal('${esc(memo.memoNo)}')">
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;font-weight:600;color:var(--blue)">${esc(memo.memoNo)}</span>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span style="font-size:10px;font-weight:600;background:${typeBg};color:${typeTxt};padding:2px 7px;border-radius:4px">${typeLbl}</span>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text)">${esc(memo.project||'—')}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text)">${esc(memo.requesterName||memo.reviewerName||'—')}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:right;font-size:12px;font-weight:600;color:var(--text)">${money(amt)}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border)">
      <span class="badge ${statusBadgeCls}">${esc(statusLbl)}</span>
    </td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);font-size:12px;color:var(--text)">
      ${reqDate}<div style="font-size:10px;color:var(--text-3)">${reqTime}</div>
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
  // Reset evidence file upload
  const evFile = document.getElementById('approve-evidence-file');
  if (evFile) evFile.value = '';
  const evUrl = document.getElementById('approve-evidence-url');
  if (evUrl) evUrl.value = '';
  const evPrev = document.getElementById('approve-evidence-preview');
  if (evPrev) evPrev.textContent = '';
  el('approve-modal').dataset.targets = JSON.stringify(targets);
  el('approve-modal').style.display   = 'flex';
}
function closeApproveModal() { document.getElementById('approve-modal').style.display='none'; }

function handleApproveEvidenceUpload(input) {
  const file = input.files[0];
  const preview = document.getElementById('approve-evidence-preview');
  const urlInput = document.getElementById('approve-evidence-url');
  if (!file) { urlInput.value = ''; preview.textContent = ''; return; }
  if (file.size > 5 * 1024 * 1024) {
    preview.textContent = '⚠ ไฟล์ใหญ่เกิน 5MB';
    preview.style.color = 'var(--red)';
    input.value = ''; urlInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    urlInput.value = e.target.result;
    preview.textContent = `✓ แนบแล้ว: ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    preview.style.color = 'var(--green-800,#166534)';
  };
  reader.readAsDataURL(file);
}
async function confirmApprove() {
  const targets = JSON.parse(document.getElementById('approve-modal').dataset.targets || '[]');
  const note    = document.getElementById('approve-note').value.trim();
  const evidenceUrl = document.getElementById('approve-evidence-url')?.value || '';
  const memos   = loadMemos();
  const allowedTargets = targets.filter(memoNo => {
    const memo = memos.find(m => m.memoNo === memoNo);
    return memo && canCurrentUserActOnMemo(memo);
  });
  if (!allowedTargets.length) {
    alert('คุณไม่มีสิทธิ์อนุมัติรายการที่เลือกในขั้นตอนปัจจุบัน');
    return;
  }

  const confirmBtn = document.getElementById('approve-confirm-btn');
  const originalLabel = confirmBtn?.textContent || '✓ Confirm Approve';
  if(confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving...';
  }

  try {
    const updates = allowedTargets.map(memoNo => {
      const memo = memos.find(m => m.memoNo === memoNo);
      const user = currentUser();

      const isPendingA2 = memo.status === 'pending_a2';
      const isPendingA3 = memo.status === 'pending_a3';
      const actionKey   = isPendingA3 ? 'approved_a3' : isPendingA2 ? 'approved_a2' : 'approved_a1';
      const stageLabel  = isPendingA3 ? 'A3' : isPendingA2 ? 'A2' : 'A1';
      // Functional audit fix: `actionKey` ('approved_a1'/'approved_a2'/'approved_a3')
      // is the action passed to updateMemoStatusAsync() for its branching, but it
      // is never the real resulting memo.status — updateMemoStatusAsync() always
      // resolves to 'pending_a2'/'pending_a3'/'completed' (app.js). The audit
      // entry must record that real new status, not the intermediate action key.
      const approvers   = memo.approvers || [];
      const approvingIdx = isPendingA3 ? 2 : isPendingA2 ? 1 : 0;
      const hasNextApprover = approvers[approvingIdx + 1];
      const realStatusAfter = hasNextApprover
        ? (approvingIdx + 1 === 1 ? 'pending_a2' : 'pending_a3')
        : 'completed';

      const updatedAuditLog = [...(memo.auditLog || []), {
        actor: user,
        actorProfileId: typeof currentUserProfileId === 'function' ? currentUserProfileId() : null,
        action: `${stageLabel} Approved by ${user}`,
        comment: note,
        timestamp: new Date().toISOString(),
        statusBefore: memo.status || null,
        statusAfter: realStatusAfter,
        evidenceUrl: evidenceUrl || null,
        channel: 'in-app',
      }];

      return updateMemoStatusAsync(memoNo, actionKey, {
        approvalNote: note,
        approvedBy: user,
        auditLog: updatedAuditLog,
        throwOnSyncError: true,
        ...(evidenceUrl ? { approvalEvidenceUrl: evidenceUrl } : {}),
      });
    });
    const results = await Promise.allSettled(updates);
    const succeeded = [];
    const failed = [];
    results.forEach((result, i) => {
      (result.status === 'fulfilled' ? succeeded : failed).push(allowedTargets[i]);
      if(result.status === 'rejected') console.error(`Approval save failed for ${allowedTargets[i]}`, result.reason);
    });
    if(!failed.length) {
      closeApproveModal();
    } else {
      document.getElementById('approve-modal').dataset.targets = JSON.stringify(failed);
    }
    alert(`Approved: ${succeeded.length ? succeeded.join(', ') : 'None'}\nFailed: ${failed.length ? failed.join(', ') : 'None'}${failed.length ? '\nกรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง' : ''}`);
  } catch(e) {
    console.error('Approval save failed', e);
    alert('บันทึกการอนุมัติไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง');
  } finally {
    if(confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalLabel;
    }
  }
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
  const user  = currentUser();
  const now = new Date().toISOString();
  const allowedTargets = targets.filter(memoNo => {
    const memo = memos.find(m => m.memoNo === memoNo);
    return memo && canCurrentUserActOnMemo(memo);
  });
  if (!allowedTargets.length) {
    alert('คุณไม่มีสิทธิ์ Reject รายการที่เลือกในขั้นตอนปัจจุบัน');
    return;
  }
  allowedTargets.forEach(memoNo => {
    const idx = memos.findIndex(m=>m.memoNo===memoNo);
    if(idx<0) return;
    appendAuditLog(memos, memoNo, `Rejected by ${user}`, full, {
      statusBefore: memos[idx].status,
      statusAfter:  'rejected',
    });
    // Update status IN MEMORY before storeMemos so localStorage is immediately correct
    memos[idx] = { ...memos[idx],
      status:          'rejected',
      currentApproverProfileId: null,
      rejectionReason: full,
      rejectedBy:      user,
      rejectedAt:      now,
      updatedAt:       now,
    };
  });
  storeMemos(memos);
  allowedTargets.forEach(memoNo => {
    const updatedAuditLog = memos.find(m=>m.memoNo===memoNo)?.auditLog || [];
    updateMemoStatusAsync(memoNo, 'rejected', {
      rejectionReason: full,
      rejectedBy:      user,
      rejectedAt:      now,
      auditLog:        updatedAuditLog,
    });
  });
  closeRejectModal();
  renderPendingMemos();
  renderHistoryMemos();
  alert(`✓ Rejected ${allowedTargets.length} รายการแล้ว — รายการย้ายไป History`);
}

// ── Detail Modal ──
function openDetailModal(memoNo) {
  const memo = loadMemos().find(m=>m.memoNo===memoNo);
  if(!memo) return;

  // Use shared builder from history.js (already in global scope)
  if (typeof _buildMemoDetailContent === 'function') {
    document.getElementById('detail-content').innerHTML = _buildMemoDetailContent(memo, 'full');
  } else {
    // Fallback if history.js not yet loaded
    document.getElementById('detail-content').innerHTML =
      `<div style="padding:20px;color:var(--text-3)">กำลังโหลด...</div>`;
  }

  const _no       = esc(memo.memoNo);
  const _st       = memo.status || '';
  const isPending = _st === 'pending' || _st === 'pending_a2' || _st === 'pending_a3';
  const isDraft   = _st === 'draft';
  const isOwn     = isMemoRequester(memo);
  const _isPMO    = typeof isPMO === 'function' && isPMO();

  // canApprove: pending AND current user matches current stage's approver
  const _dUser    = currentUser();
  const _dStage   = _st==='pending_a2' ? 1 : _st==='pending_a3' ? 2 : 0;
  const _dApprover = (memo.approvers||[])[_dStage];
  const canApprove = isPending && canCurrentUserActOnMemo(memo) && !_isPMO;
  // PMO can always approve as override
  const canApproveAsPMO = isPending && _isPMO && !isOwn;  // PMO cannot approve own memo
  const canCancel  = isPending && (isOwn || _isPMO);

  const acts = document.getElementById('detail-actions');
  acts.innerHTML = `
    ${(canApprove || canApproveAsPMO) ? `
      <button class="btn-primary" onclick="closeDetailModal();openApproveModal('${_no}')">✓ Approve</button>
      <button class="btn-reject"  onclick="closeDetailModal();openRejectModal('${_no}')">✕ Reject</button>
    ` : ''}
    ${canCancel ? `
      <button class="btn-sm" style="color:var(--red)" onclick="closeDetailModal();cancelMemo('${_no}')">✕ Cancel</button>
    ` : ''}
    ${isDraft ? `
      <button class="btn-sm" style="color:var(--blue)" onclick="closeDetailModal();if(typeof editDraft==='function')editDraft('${_no}')">✎ Edit Draft</button>
      <button class="btn-sm" style="color:var(--red)"  onclick="closeDetailModal();if(typeof deleteDraft==='function')deleteDraft('${_no}')">✕ Delete</button>
    ` : `
      <button class="btn-sm" style="color:var(--blue)" onclick="if(typeof downloadMemoPdf==='function'){downloadMemoPdf(loadMemos().find(m=>m.memoNo==='${_no}'))}">⬇ Download PDF</button>
    `}
    ${_isPMO && _st === 'completed' ? `
      <button class="btn-sm" onclick="if(typeof openBudgetTagModal==='function')openBudgetTagModal('${_no}')"
        style="background:${memo.budgetSource?'var(--green-50,#F0FDF4)':'var(--amber-50,#FFFBEB)'};color:${memo.budgetSource?'var(--green-800,#166534)':'var(--amber-800,#92400E)'}">
        ⚑ ${memo.budgetSource ? esc(memo.budgetSource) : 'Tag Budget'}
      </button>
    ` : ''}
    ${_isPMO && isPending ? `
      <button class="btn-sm" style="color:var(--red)"  onclick="closeDetailModal();openPmoOverrideModal('${_no}')">⚠ Override</button>
    ` : ''}
    <button class="btn-ghost" onclick="closeDetailModal()">ปิด</button>
  `;
  const modalInner = document.querySelector('#detail-modal > div');
  if (modalInner) modalInner.style.maxWidth = '720px';
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
    <div class="card" style="width:480px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:15px;font-weight:700;color:var(--red)">⚠ PMO Override</span>
        <button class="btn-sm" onclick="document.getElementById('pmo-override-modal').remove()" style="padding:4px 10px">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-bottom:16px">
        Memo: <strong>${esc(memo.memoNo)}</strong> · ${esc(memo.subject || memo.project || '-')}
      </div>

      <!-- Section A: Edit Approvers -->
      <div style="background:var(--bg);border-radius:var(--r-sm);padding:12px;margin-bottom:14px">
        <div style="font-size:11px;font-weight:600;color:var(--text-2);margin-bottom:10px">✎ แก้ไข Approvers</div>
        <div id="pmo-appr-edit-rows">
          ${(memo.approvers||[]).map((a,i) => `
            <div class="approver-edit-row" style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px">
              <input class="ri appr-name" style="font-size:12px" value="${esc(a.name||'')}" placeholder="ชื่อ A${i+1}" ${isApproverStepResolved(a.status)?'disabled':''}>
              <input class="ri appr-title" style="font-size:12px" value="${esc(a.title||'')}" placeholder="ตำแหน่ง" ${isApproverStepResolved(a.status)?'disabled':''}>
              <span style="font-size:10px;color:${isApproverStepResolved(a.status)?'var(--green)':'var(--text-3)'}">A${i+1}${isApproverStepResolved(a.status)?' ✓':''}</span>
            </div>`).join('')}
        </div>
        <button class="btn-sm" onclick="addPmoApproverRow()" style="font-size:11px;margin-top:4px">+ เพิ่ม Approver</button>
      </div>

      <!-- Section B: Override Status -->
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600;color:var(--text-2)">เปลี่ยนสถานะเป็น</label>
        <select id="pmo-new-status" class="ri" style="margin-top:4px">${statusOpts}</select>
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600;color:var(--text-2)">อนุมัติโดย (ชื่อผู้อนุมัติจริง นอกระบบ)</label>
        <input id="pmo-approved-by" class="ri" style="margin-top:4px" placeholder="เช่น นาย ปกรณ์ เจียมสกุลทิพย์">
      </div>
      <div class="fg" style="margin-bottom:10px">
        <label style="font-size:11px;font-weight:600;color:var(--red)">เหตุผล/หมายเหตุ * (บังคับ)</label>
        <textarea id="pmo-override-note" class="ri" rows="3" style="margin-top:4px" placeholder="ระบุเหตุผล เช่น อนุมัติผ่าน Email เมื่อ 10/06/69 จาก CEO"></textarea>
      </div>
      <div class="fg" style="margin-bottom:16px">
        <label style="font-size:11px;font-weight:600;color:var(--text-2)">
          แนบหลักฐาน * (บังคับ — ภาพ Email, เอกสารสแกน, PDF)
        </label>
        <div style="margin-top:6px">
          <input type="file" id="pmo-evidence-file" accept="image/*,.pdf"
            style="font-size:12px;color:var(--text-2)"
            onchange="handlePmoEvidenceUpload(this)">
        </div>
        <div id="pmo-evidence-preview" style="margin-top:6px;font-size:11px;color:var(--text-3)"></div>
        <input type="hidden" id="pmo-evidence-url" value="">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-ghost" onclick="document.getElementById('pmo-override-modal').remove()">Cancel</button>
        <button class="btn-primary" style="background:var(--red);border-color:var(--red)" onclick="confirmPmoOverride('${esc(memoNo)}')">⚠ Confirm Override</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function handlePmoEvidenceUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const preview = document.getElementById('pmo-evidence-preview');
  const urlInput = document.getElementById('pmo-evidence-url');
  if (file.size > 5 * 1024 * 1024) {
    preview.textContent = '⚠ ไฟล์ใหญ่เกิน 5MB';
    preview.style.color = 'var(--red)';
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    urlInput.value = e.target.result; // base64 data URL stored for now
    preview.textContent = `✓ แนบแล้ว: ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    preview.style.color = 'var(--green)';
  };
  reader.readAsDataURL(file);
}

function addPmoApproverRow() {
  const container = document.getElementById('pmo-appr-edit-rows');
  if (!container) return;
  const count = container.querySelectorAll('.approver-edit-row').length;
  if (count >= 3) { alert('สามารถมี Approver ได้สูงสุด 3 คน'); return; }
  const row = document.createElement('div');
  row.className = 'approver-edit-row';
  row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:6px;align-items:center;margin-bottom:6px';
  row.innerHTML = `
    <input class="ri appr-name" style="font-size:12px" placeholder="ชื่อ A${count+1}">
    <input class="ri appr-title" style="font-size:12px" placeholder="ตำแหน่ง">
    <button class="btn-sm" onclick="this.closest('.approver-edit-row').remove()" style="color:var(--red);padding:3px 7px">✕</button>`;
  container.appendChild(row);
}

function confirmPmoOverride(memoNo) {
  const newStatus   = document.getElementById('pmo-new-status')?.value;
  const note        = document.getElementById('pmo-override-note')?.value.trim();
  const approvedBy  = document.getElementById('pmo-approved-by')?.value.trim();
  const evidenceUrl = document.getElementById('pmo-evidence-url')?.value || '';

  if (!note) { alert('กรุณาระบุเหตุผล/หมายเหตุ'); return; }
  if (!evidenceUrl) { alert('กรุณาแนบหลักฐาน (ภาพ Email หรือเอกสาร)'); return; }

  // Collect updated approvers from edit rows
  const editRows = document.querySelectorAll('#pmo-appr-edit-rows .approver-edit-row');
  const memo     = loadMemos().find(m => m.memoNo === memoNo);
  const user     = currentUser();

  // Functional audit fix: Override is only a documented transition FROM a
  // Pending-family status (MEMO_LIFECYCLE.md §8, SYSTEM_STATE_MACHINE.md §3) —
  // previously only the Override button's visibility (isPending) enforced
  // this; the function itself had no guard, so a direct call could resurrect
  // an already-terminal (Rejected/Cancelled/Completed/Voided) memo in place.
  if (!memo || !['pending', 'pending_a2', 'pending_a3'].includes(memo.status)) {
    alert('PMO Override ใช้ได้เฉพาะ Memo ที่มีสถานะ Pending เท่านั้น');
    return;
  }

  // Milestone 1A Task 1.3: the one approver step whose turn it currently is gets
  // marked 'overridden' (PMO acted in its place) rather than reset to 'pending'
  // like every other not-yet-reached step — see MEMO_LIFECYCLE.md §7/§8.
  const currentPendingIdx = (memo?.approvers || []).findIndex(a => !a.status || a.status === 'pending');
  // Functional audit fix: overriding to "Completed" asserts the *final* memo
  // approval happened outside the system (MEMO_LIFECYCLE.md §8 item 2), so
  // every not-yet-reached step — not just the current one — must resolve to
  // Overridden. Leaving a later step at 'pending' under a completed memo
  // contradicted SYSTEM_STATE_MACHINE.md §5's own worked example and let a
  // required approver step go permanently unresolved. Overriding to a
  // specific intermediate step (pending_a2/pending_a3) is unaffected — only
  // the current step resolves, later ones correctly remain 'pending'.
  let newApprovers = null;
  if (editRows.length && memo) {
    newApprovers = Array.from(editRows).map((row, i) => {
      const name  = row.querySelector('.appr-name')?.value.trim()  || '';
      const title = row.querySelector('.appr-title')?.value.trim() || '';
      const orig  = (memo.approvers||[])[i];
      if (isApproverStepResolved(orig?.status)) return orig; // keep resolved entries intact
      if (i === currentPendingIdx || (newStatus === 'completed' && i > currentPendingIdx)) {
        return {
          ...orig, name, title,
          status: 'overridden',
          overriddenAt: new Date().toISOString(),
          overriddenBy: user,
          overrideNote: note,
          approvedAt: null,
          approvedBy: null,
        };
      }
      return { name, title, status: 'pending', approvedAt: null, approvedBy: null };
    }).filter(a => a.name);
  }

  const memos = loadMemos();
  appendAuditLog(memos, memoNo, `PMO Override → ${newStatus} by ${user}`, note, {
    statusBefore: memo?.status || null,
    statusAfter:  newStatus,
    evidenceUrl,
  });
  storeMemos(memos);
  const updatedAuditLog = memos.find(m => m.memoNo === memoNo)?.auditLog || [];

  const extra = {
    pmoOverrideNote:  note,
    pmoOverrideBy:    user,
    approvedBy:       approvedBy || user,
    approvalNote:     note,
    pmoEvidenceUrl:   evidenceUrl,
    auditLog:         updatedAuditLog,
  };
  if (newApprovers) extra.approvers = newApprovers;

  // Clear stale rejection/cancellation fields when overriding to a positive state
  // so they don't show up as "reject reason" on a completed memo
  if (newStatus === 'completed' || newStatus === 'pending' || newStatus === 'pending_a2') {
    extra.rejectionReason    = null;
    extra.cancellationReason = null;
    extra.rejectedBy         = null;
    extra.cancelledBy        = null;
    extra.cancelledAt        = null;
    extra.rejectedAt         = null;
  }

  updateMemoStatusAsync(memoNo, newStatus, extra);

  document.getElementById('pmo-override-modal')?.remove();
  closeDetailModal();
  alert('✓ Override เสร็จสิ้น');
}

// ── PMO Edit Approvers ──
function openPmoEditApproversModal(memoNo) {
  const memo      = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;
  const approvers = memo.approvers || [];
  const profiles  = typeof getApprovers === 'function' ? getApprovers() : [];

  const existing = document.getElementById('pmo-approvers-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'pmo-approvers-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center';

  const approverOptions = (selectedName, locked) => {
    const hasSelected = profiles.some(profile => profile.full_name === selectedName);
    const missingLocked = locked && selectedName && !hasSelected
      ? `<option value="${esc(selectedName)}" selected>${esc(selectedName)}</option>` : '';
    return `<option value="">-- เลือกผู้อนุมัติ --</option>${missingLocked}${profiles.map(profile =>
      `<option value="${esc(profile.full_name || '')}" data-title="${esc(profile.title || '')}"${profile.full_name === selectedName ? ' selected' : ''}>${esc(profile.full_name || '')}</option>`
    ).join('')}`;
  };

  const renderApproverRow = (a, idx) => `
    <div class="approver-edit-row" style="border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px">
      <div style="font-size:10px;font-weight:600;color:var(--text-3);margin-bottom:6px">
        A${idx+1} ${isApproverStepResolved(a.status) ? '✅ Approved แล้ว — แก้ไขไม่ได้' : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
        <div>
          <label style="font-size:11px;color:var(--text-3)">ชื่อ</label>
          <select class="ri appr-name" style="margin-top:3px;font-size:12px" onchange="this.closest('.approver-edit-row').querySelector('.appr-title').value=this.selectedOptions[0]?.dataset.title||''" ${isApproverStepResolved(a.status)?'disabled':''}>${approverOptions(a.name || '', isApproverStepResolved(a.status))}</select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-3)">ตำแหน่ง</label>
          <input class="ri appr-title" style="margin-top:3px;font-size:12px;background:var(--bg)" value="${esc(a.title||'')}" readonly>
        </div>
        ${!isApproverStepResolved(a.status) && idx > 0 ? `<button class="btn-sm" onclick="this.closest('.approver-edit-row').remove()" style="color:var(--red);padding:6px 8px">✕</button>` : '<div></div>'}
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
  const profiles = typeof getApprovers === 'function' ? getApprovers() : [];
  const options = profiles.map(profile => `<option value="${esc(profile.full_name || '')}" data-title="${esc(profile.title || '')}">${esc(profile.full_name || '')}</option>`).join('');
  const row = document.createElement('div');
  row.className = 'approver-edit-row';
  row.style.cssText = 'border:1px solid var(--border);border-radius:var(--r-sm);padding:10px 12px;margin-bottom:8px';
  row.innerHTML = `
    <div style="font-size:10px;font-weight:600;color:var(--text-3);margin-bottom:6px">A${idx+1}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end">
      <div><label style="font-size:11px;color:var(--text-3)">ชื่อ</label><select class="ri appr-name" style="margin-top:3px;font-size:12px" onchange="this.closest('.approver-edit-row').querySelector('.appr-title').value=this.selectedOptions[0]?.dataset.title||''"><option value="">-- เลือกผู้อนุมัติ --</option>${options}</select></div>
      <div><label style="font-size:11px;color:var(--text-3)">ตำแหน่ง</label><input class="ri appr-title" style="margin-top:3px;font-size:12px;background:var(--bg)" placeholder="ตำแหน่ง" readonly></div>
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
    // Keep existing status/dates for already-resolved approvers (approved, bypassed, or overridden)
    if (isApproverStepResolved(orig?.status)) return orig;
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

// ── Cancel Memo (requester or PMO) ──
function cancelMemo(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if(!memo) return;
  const isRequester = isMemoRequester(memo);
  const isPmoUser = typeof isPMO === 'function' && isPMO();
  if ((!isRequester && !isPmoUser) || !['pending','pending_a2','pending_a3'].includes(memo.status)) {
    alert('ยกเลิกได้เฉพาะผู้ขอหรือ PMO และ Memo ต้องอยู่ระหว่างอนุมัติ');
    return;
  }
  const reason = prompt(`เหตุผลที่ยกเลิก Memo "${memoNo}":`);
  if(!reason?.trim()) return;
  if(!confirm(`ยืนยันยกเลิก Memo "${memoNo}"?\nหลังจากยกเลิกแล้วจะไม่สามารถกู้คืนได้`)) return;
  const user = currentUser();
  const memos = loadMemos();
  const actorType = isPmoUser && !isRequester ? 'PMO' : 'Requester';
  appendAuditLog(memos, memoNo, `Cancelled by ${user} (${actorType})`, reason.trim(), {
    statusBefore: memo.status,
    statusAfter:  'cancelled',
  });
  storeMemos(memos);
  updateMemoStatusAsync(memoNo, 'cancelled', {
    cancellationReason: reason.trim(),
    cancelledBy:  user,
    cancelledAt:  new Date().toISOString(),
  }).then(() => {
    renderPendingMemos();
    renderHistoryMemos();
  });
}

function approveMemo(memoNo) { openApproveModal(memoNo); }
function rejectMemo(memoNo)  { openRejectModal(memoNo); }

// ── Pending Load More ──
function loadMorePending() {
  if (typeof _pendingVisible === 'undefined') window._pendingVisible = 20;
  window._pendingVisible = (_pendingVisible || 20) + 20;
  renderPendingMemos();
}
