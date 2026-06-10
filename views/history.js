// ─────────────────────────────────────────
// views/history.js — PMO History & Audit workspace
// ─────────────────────────────────────────

const HIST_TYPE_LABELS = { sl:'Software License', hw:'Hardware', int:'Team Activity', ent:'Client Expense', dep:'Deployment' };

// ── Status lifecycle ──
function memoStatusKey(memo) {
  const s = memo.status || 'pending';
  if (s === 'draft') return 'draft';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'expired') return 'expired';
  if (s === 'completed') return 'completed';
  if (s === 'rejected') return 'rejected';
  const stage = String(memo.approvalStage || '').toLowerCase();
  if (stage.includes('a2')) return 'pending_a2';
  if (stage.includes('a1')) return 'pending_a1';
  return 'pending';
}
function histStatusLabel(memo) {
  const key = memoStatusKey(memo);
  const map = {
    completed: 'Completed', rejected: 'Rejected', pending: 'Pending',
    pending_a1: 'Pending A1', pending_a2: 'Pending A2',
    draft: 'Draft', cancelled: 'Cancelled', expired: 'Expired'
  };
  return map[key] || key;
}
function histStatusBadgeClass(memo) {
  const key = memoStatusKey(memo);
  const map = {
    completed: 'badge-green', rejected: 'badge-red', pending: 'badge-amber',
    pending_a1: 'badge-amber', pending_a2: 'badge-amber',
    draft: 'badge-gray', cancelled: 'badge-gray', expired: 'badge-red'
  };
  return map[key] || 'badge-gray';
}

// ── Helpers ──
function histRequesterName(memo) {
  return memo.requesterName || memo.reviewerName || '—';
}
function histApproverName(memo) {
  if (memo.status === 'completed') return memo.approvedBy || memo.approverName || '—';
  if (memo.status === 'rejected') return memo.rejectedBy || memo.approverName || '—';
  return memo.approverName || '—';
}
function histActivityAt(memo) {
  // Use the decision date (approvedAt/rejectedAt) as primary — not updatedAt
  // because updatedAt changes whenever any field is patched, which would shift
  // the memo into the wrong date-range bucket in history filters.
  return memo.approvedAt || memo.rejectedAt || memo.submittedAt || memo.updatedAt || memo.createdAt;
}
function approvalDurationMs(memo) {
  const start = new Date(memo.submittedAt || memo.createdAt || 0);
  const end = new Date(
    memo.approvedAt || memo.rejectedAt ||
    (['completed', 'rejected'].includes(memo.status) ? memo.updatedAt : null) || 0
  );
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return end - start;
}
function formatApprovalDuration(memo) {
  const ms = approvalDurationMs(memo);
  if (ms == null) {
    if (!memo.status || memo.status === 'pending' || memo.status === 'draft') return '—';
    return '—';
  }
  const hrs = Math.floor(ms / 3600000);
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  if (days > 0) return remHrs ? `${days} วัน ${remHrs} ชม.` : `${days} วัน`;
  if (hrs > 0) return `${hrs} ชม.`;
  const mins = Math.max(1, Math.floor(ms / 60000));
  return `${mins} นาที`;
}
function truncateText(text, max = 36) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
function histMatchesSearch(memo, q) {
  if (!q) return true;
  const hay = [
    memo.memoNo, memo.project, memo.subject, memo.reason,
    histRequesterName(memo), histApproverName(memo),
    memo.rejectionReason, memo.approvalNote, memo.typeLabel
  ].join(' ').toLowerCase();
  return hay.includes(q);
}
function histInDateRange(memo, from, to) {
  const dt = new Date(histActivityAt(memo) || 0);
  if (Number.isNaN(dt.getTime())) return !from && !to;
  if (from) {
    const f = new Date(from + 'T00:00:00');
    if (dt < f) return false;
  }
  if (to) {
    const t = new Date(to + 'T23:59:59');
    if (dt > t) return false;
  }
  return true;
}
function histInPresetRange(memo, range) {
  if (range === 'all') return true;
  const dt = new Date(histActivityAt(memo) || 0);
  if (Number.isNaN(dt.getTime())) return false;
  const now = new Date();
  if (range === 'month') return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  if (range === 'last-month') {
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return dt.getFullYear() === last.getFullYear() && dt.getMonth() === last.getMonth();
  }
  if (range === '3-months') return dt >= new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return true;
}
function histMatchesAmount(memo, preset, minVal, maxVal) {
  const amt = Number(memo.total) || 0;
  if (preset === 'gt100k') return amt > 100000;
  if (preset === 'lt50k') return amt < 50000;
  if (preset === '50k-100k') return amt >= 50000 && amt <= 100000;
  if (minVal !== '' && amt < Number(minVal)) return false;
  if (maxVal !== '' && amt > Number(maxVal)) return false;
  return true;
}

// ── All-memo tab state ──
let _histTab = 'all';

function switchHistTab(status, btn) {
  _histTab = status;
  document.querySelectorAll('.hist-tab-btn').forEach(b => {
    const active = b.dataset.status === status;
    b.classList.toggle('active', active);
    b.style.background = active ? 'var(--surface)' : 'transparent';
    b.style.color      = active ? 'var(--blue)' : 'var(--text-2)';
    b.style.fontWeight = active ? '600' : '500';
  });
  // Sync hidden status select so filteredHistoryMemos still works
  const sel = document.getElementById('hist-status');
  if (sel) sel.value = status;
  renderHistoryMemos();
}

// ── Filter / sort (all statuses now) ──
function getHistoryMemos() {
  // Return ALL memos — not just completed/rejected
  return loadMemos();
}

function populateHistTabCounts() {
  const all = loadMemos();
  const counts = {
    all:       all.length,
    draft:     all.filter(m => m.status === 'draft').length,
    pending:   all.filter(m => !m.status || m.status === 'pending').length,
    completed: all.filter(m => m.status === 'completed').length,
    rejected:  all.filter(m => m.status === 'rejected').length,
  };
  document.querySelectorAll('.hist-tab-btn').forEach(btn => {
    const countEl = btn.querySelector('.hist-tab-count');
    if (!countEl) return;
    const n = counts[btn.dataset.status] || 0;
    countEl.textContent = n > 0 ? n : '';
  });
}

function filteredHistoryMemos() {
  const status = val('#hist-status') || 'all';
  const type = val('#hist-type') || 'all';
  const project = val('#hist-project') || 'all';
  const range = val('#hist-range') || 'month';
  const search = (val('#hist-search') || '').toLowerCase().trim();
  const requester = val('#hist-requester') || 'all';
  const approver = val('#hist-approver') || 'all';
  const dateFrom = val('#hist-date-from');
  const dateTo = val('#hist-date-to');
  const amtPreset = val('#hist-amt-preset') || 'all';
  const amtMin = val('#hist-amt-min');
  const amtMax = val('#hist-amt-max');
  const useCustomDates = dateFrom || dateTo;

  let memos = getHistoryMemos().filter(memo => {
    const sk = memoStatusKey(memo);
    if (status !== 'all' && sk !== status) return false;
    if (type !== 'all' && memo.type !== type) return false;
    if (project !== 'all' && memo.project !== project) return false;
    if (!useCustomDates && !histInPresetRange(memo, range)) return false;
    if (useCustomDates && !histInDateRange(memo, dateFrom, dateTo)) return false;
    if (!histMatchesAmount(memo, amtPreset, amtMin, amtMax)) return false;
    if (requester !== 'all' && histRequesterName(memo) !== requester) return false;
    if (approver !== 'all' && histApproverName(memo) !== approver) return false;
    if (!histMatchesSearch(memo, search)) return false;
    return true;
  });

  const sort = val('#hist-sort') || 'updated-desc';
  memos.sort((a, b) => {
    const amtA = Number(a.total) || 0, amtB = Number(b.total) || 0;
    const updA = new Date(histActivityAt(a) || 0), updB = new Date(histActivityAt(b) || 0);
    const creA = new Date(a.createdAt || 0), creB = new Date(b.createdAt || 0);
    if (sort === 'updated-desc') return updB - updA;
    if (sort === 'updated-asc') return updA - updB;
    if (sort === 'created-desc') return creB - creA;
    if (sort === 'created-asc') return creA - creB;
    if (sort === 'amount-desc') return amtB - amtA;
    if (sort === 'amount-asc') return amtA - amtB;
    if (sort === 'project-asc') return String(a.project || '').localeCompare(String(b.project || ''), 'th');
    if (sort === 'status-asc') return histStatusLabel(a).localeCompare(histStatusLabel(b), 'th');
    return updB - updA;
  });
  return memos;
}

function populateHistFilterOptions() {
  const memos = getHistoryMemos();
  const requesters = [...new Set(memos.map(histRequesterName).filter(n => n && n !== '—'))].sort();
  const approvers  = [...new Set(memos.map(histApproverName).filter(n => n && n !== '—'))].sort();
  const projects   = [...new Set(memos.map(m => m.project).filter(Boolean))].sort();

  const fill = (id, items) => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = `<option value="all">ทั้งหมด</option>` +
      items.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if ([...el.options].some(o => o.value === cur)) el.value = cur;
  };
  fill('hist-requester', requesters);
  fill('hist-approver', approvers);
  fill('hist-project', projects);
}

function toggleHistFilters() {
  const panel = document.getElementById('hist-filters-advanced');
  const btn = document.getElementById('hist-filter-toggle');
  if (!panel) return;
  const open = panel.classList.toggle('is-open');
  if (btn) {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.style.background = open ? 'var(--bg)' : '';
  }
}

// ── Linked data ──
function getLinkedLicenses(memo) {
  if (memo.type !== 'sl' || typeof parseLicenseFromMemo !== 'function') return [];
  return parseLicenseFromMemo(memo);
}
function getLinkedDevices(memo) {
  if (memo.type !== 'hw') return [];
  const devices = typeof loadDevices === 'function' ? loadDevices() : [];
  return devices.filter(d => d.memoNo === memo.memoNo || d.sourceMemoNo === memo.memoNo);
}

// ── Detail modal (audit workspace) ──
function buildApprovalTimeline(memo) {
  const events = [];
  if (memo.createdAt) events.push({ at: memo.createdAt, label: 'สร้าง Memo', actor: histRequesterName(memo), kind: 'create' });
  if (memo.submittedAt && memo.submittedAt !== memo.createdAt) {
    events.push({ at: memo.submittedAt, label: 'ส่งขออนุมัติ', actor: histRequesterName(memo), kind: 'submit' });
  }
  (memo.approvalChain || []).forEach(step => {
    if (step.doneAt) events.push({ at: step.doneAt, label: `${step.role} อนุมัติ`, actor: step.name, kind: 'approve' });
  });
  if (memo.approvedAt) events.push({ at: memo.approvedAt, label: 'อนุมัติแล้ว', actor: memo.approvedBy || memo.approverName, kind: 'done' });
  if (memo.rejectedAt) events.push({ at: memo.rejectedAt, label: 'ปฏิเสธ', actor: memo.rejectedBy, kind: 'reject' });
  (memo.auditLog || []).forEach(e => {
    events.push({ at: e.timestamp, label: e.action, actor: e.actor, comment: e.comment, kind: 'audit' });
  });
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  if (!events.length) return '<div style="font-size:11px;color:var(--text-3)">ยังไม่มีประวัติ workflow</div>';
  return events.map(e => `
    <div class="hist-timeline-item">
      <div class="hist-timeline-dot ${esc(e.kind)}"></div>
      <div>
        <div style="font-size:12px;font-weight:600;color:var(--text)">${esc(e.label)}</div>
        <div style="font-size:11px;color:var(--text-3)">${esc(formatDateTime(e.at))} · ${esc(e.actor || '—')}</div>
        ${e.comment ? `<div style="font-size:11px;color:var(--text-2);margin-top:2px">${esc(e.comment)}</div>` : ''}
      </div>
    </div>`).join('');
}

function openHistoryDetail(memoNo) {
  const memo = getHistoryMemos().find(m => m.memoNo === memoNo);
  if (!memo) { alert('ไม่พบ Memo'); return; }
  const sections = (memo.sections || []).map(s =>
    `<div class="hist-detail-section"><div class="hist-detail-section-title">${esc(s.title)}</div>${s.html}</div>`
  ).join('');

  const licenses = getLinkedLicenses(memo);
  const devices = getLinkedDevices(memo);
  const linkedLic = licenses.length ? `
    <div class="hist-detail-block">
      <div class="hist-detail-block-title">Linked Licenses (${licenses.length})</div>
      ${licenses.map(l => `<div class="hist-linked-row"><span>${esc(l.name)}</span><span class="mono">${esc(money(l.pricePerMonth))}/เดือน · ${l.seats} seats</span></div>`).join('')}
    </div>` : '';

  const linkedDev = devices.length ? `
    <div class="hist-detail-block">
      <div class="hist-detail-block-title">Linked Devices (${devices.length})</div>
      ${devices.map(d => `<div class="hist-linked-row"><span>${esc(d.name)}</span><span style="font-size:11px;color:var(--text-3)">${esc(d.owner || '—')} · ${esc(d.serial || '')}</span></div>`).join('')}
    </div>` : '';

  const attachments = (memo.attachments || []).length
    ? (memo.attachments || []).map(a => `<div class="hist-linked-row"><span>${esc(a.name || a)}</span></div>`).join('')
    : '<div style="font-size:11px;color:var(--text-3)">ไม่มีไฟล์แนบ</div>';

  const auditHtml = (memo.auditLog || []).length
    ? (memo.auditLog || []).map(e => `
        <div class="hist-audit-row">
          <span class="hist-audit-time">${esc(formatDateTime(e.timestamp))}</span>
          <span><strong>${esc(e.actor)}</strong> — ${esc(e.action)}${e.comment ? `<br><span style="color:var(--text-3)">${esc(e.comment)}</span>` : ''}</span>
        </div>`).join('')
    : '<div style="font-size:11px;color:var(--text-3)">ยังไม่มี audit log</div>';

  const isTerminal = ['completed', 'rejected', 'cancelled', 'expired'].includes(memo.status);

  document.getElementById('detail-content').innerHTML = `
    <div class="hist-detail-header">
      <div>
        <div style="font-size:17px;font-weight:700">${esc(memo.memoNo)}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">${esc(memo.subject || memoSubject(memo))}</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge ${badgeClass(memo.type)}">${esc(String(memo.type || '').toUpperCase())}</span>
        <span class="badge ${histStatusBadgeClass(memo)}">${esc(histStatusLabel(memo))}</span>
      </div>
    </div>
    <div class="hist-detail-meta">
      <div><span class="lbl">โครงการ</span>${esc(memo.project || '—')}</div>
      <div><span class="lbl">วงเงิน</span><span class="mono" style="font-weight:700;color:var(--blue-800)">${esc(money(memo.total || 0))}</span></div>
      <div><span class="lbl">ผู้ขอ</span>${esc(histRequesterName(memo))}<br><span style="font-size:11px;color:var(--text-3)">${esc(memo.requesterTitle || 'PMO')}</span></div>
      <div><span class="lbl">ผู้อนุมัติ</span>${esc(histApproverName(memo))}</div>
      <div><span class="lbl">สร้างเมื่อ</span>${esc(formatDateTime(memo.createdAt))}</div>
      <div><span class="lbl">อัปเดตล่าสุด</span>${esc(formatDateTime(histActivityAt(memo)))}</div>
      <div><span class="lbl">ระยะเวลาอนุมัติ</span>${esc(formatApprovalDuration(memo))}</div>
      <div><span class="lbl">เรียน</span>${esc(memo.to || '—')}</div>
      <div><span class="lbl">Budget Source</span>${buildBudgetSourceBadge(memo)}</div>
    </div>
    ${memo.reason ? `<div class="hist-detail-block"><div class="hist-detail-block-title">เหตุผล</div><p style="font-size:13px;margin:0">${esc(memo.reason)}</p></div>` : ''}
    ${sections ? `<div class="hist-detail-block"><div class="hist-detail-block-title">รายละเอียด</div>${sections}</div>` : ''}
    ${memo.approvalNote ? `<div class="hist-detail-note hist-detail-note--ok"><strong>Approval comment:</strong> ${esc(memo.approvalNote)}</div>` : ''}
    ${memo.rejectionReason ? `<div class="hist-detail-note hist-detail-note--err"><strong>Rejection reason:</strong> ${esc(memo.rejectionReason)}</div>` : ''}
    <div class="hist-detail-block">
      <div class="hist-detail-block-title">Approval timeline</div>
      <div class="hist-timeline">${buildApprovalTimeline(memo)}</div>
    </div>
    <div class="hist-detail-block">
      <div class="hist-detail-block-title">Audit log <span style="font-weight:400;color:var(--text-3)">(read-only)</span></div>
      <div class="hist-audit-log">${auditHtml}</div>
    </div>
    <div class="hist-detail-block">
      <div class="hist-detail-block-title">Attachments</div>
      ${attachments}
    </div>
    ${linkedLic}${linkedDev}

  `;

  const acts = document.getElementById('detail-actions');
  const isPending = !memo.status || memo.status === 'pending';
  const isOwn     = (memo.requesterName || '') === (typeof currentUser === 'function' ? currentUser() : '');
  const canAct    = isPending && !isOwn;
  const isCompleted = memo.status === 'completed';
  acts.innerHTML = `
    ${canAct ? `
      <button class="btn-primary" type="button" onclick="closeDetailModal();openApproveModal('${esc(memo.memoNo)}')">✓ Approve</button>
      <button class="btn-reject"  type="button" onclick="closeDetailModal();openRejectModal('${esc(memo.memoNo)}')">✕ Reject</button>
    ` : ''}
    ${isCompleted && memo.type === 'sl' ? `<button class="btn-sm" type="button" onclick="openBudgetTagModal('${esc(memo.memoNo)}')" style="background:${memo.budgetSource ? 'var(--green-50)' : 'var(--amber-50)'};color:${memo.budgetSource ? 'var(--green-800)' : 'var(--amber-800)'}">⚑ ${memo.budgetSource ? memo.budgetSource : 'Tag Budget'}</button>` : ''}
    ${memo.status !== 'draft' ? `<button class="btn-sm" type="button" onclick="openMemoPdf('${esc(memo.memoNo)}')" title="Download PDF">Download PDF</button>` : ''}
    <button class="btn-ghost" type="button" onclick="closeDetailModal()">ปิด</button>
  `;
  const modalInner = document.querySelector('#detail-modal > div');
  if (modalInner) modalInner.style.maxWidth = '720px';
  document.getElementById('detail-modal').style.display = 'flex';
}

function showRejectionReason(memoNo, event) {
  if (event) event.stopPropagation();
  const memo = getHistoryMemos().find(m => m.memoNo === memoNo);
  if (!memo?.rejectionReason) return;
  const el = document.getElementById('hist-reject-popover');
  if (!el) return;
  el.textContent = memo.rejectionReason;
  el.style.display = 'block';
  el.dataset.memo = memoNo;
  if (event) {
    const rect = event.target.getBoundingClientRect();
    el.style.left = Math.min(rect.left, window.innerWidth - 320) + 'px';
    el.style.top = (rect.bottom + 6) + 'px';
  }
}
function hideRejectionPopover() {
  const el = document.getElementById('hist-reject-popover');
  if (el) el.style.display = 'none';
}

// ── Export ──

function exportHistoryCsv() {
  const memos = filteredHistoryMemos();
  if (!memos.length) { alert('ไม่มีข้อมูลสำหรับ Export'); return; }
  const headers = ['Memo No', 'Type', 'Project', 'Amount', 'Status', 'Requester', 'Approver', 'Created', 'Updated', 'Duration', 'Rejection Reason', 'Subject'];
  const rows = memos.map(m => [
    m.memoNo, String(m.type || '').toUpperCase(), m.project || '',
    Number(m.total) || 0, histStatusLabel(m),
    histRequesterName(m), histApproverName(m),
    m.createdAt || '', histActivityAt(m) || '',
    formatApprovalDuration(m), m.rejectionReason || '', m.subject || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `memo-history-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const HIST_ICON_VIEW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const HIST_ICON_PDF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

function histActionButtons(memo) {
  const no = esc(memo.memoNo);
  const isDraft    = memo.status === 'draft';
  const isRejected = memo.status === 'rejected';
  return `<div class="hist-actions">
    <button type="button" class="btn-sm hist-act-btn" data-hist-action="detail" data-memo="${no}" title="ดูรายละเอียด">${HIST_ICON_VIEW}</button>
    ${isDraft ? `<button type="button" class="btn-sm hist-act-btn" data-hist-action="draft-edit" data-memo="${no}" title="แก้ไข Draft" style="color:var(--blue)">✎</button>
    <button type="button" class="btn-sm hist-act-btn" data-hist-action="draft-delete" data-memo="${no}" title="ลบ Draft" style="color:var(--red)">✕</button>` : ''}
    ${isRejected ? `<button type="button" class="btn-sm hist-act-btn" data-hist-action="duplicate" data-memo="${no}" title="Duplicate เป็น Memo ใหม่">⊕</button>` : ''}
    ${!isDraft ? `<button type="button" class="btn-sm hist-act-btn" data-hist-action="pdf" data-memo="${no}" title="Download PDF">${HIST_ICON_PDF}</button>` : ''}
  </div>`;
}

function handleHistoryTableClick(e) {
  const btn = e.target.closest('[data-hist-action]');
  if (btn) {
    e.stopPropagation();
    const action = btn.dataset.histAction;
    const memoNo = btn.dataset.memo;
    if (action === 'detail') openHistoryDetail(memoNo);
    else if (action === 'pdf') {
      if (typeof openMemoPdf === 'function') openMemoPdf(memoNo);
      else alert('ระบบดาวน์โหลด PDF ยังไม่พร้อมใช้งาน');
    }
    else if (action === 'reject-reason') showRejectionReason(memoNo, e);
    else if (action === 'draft-edit') {
      if (typeof editDraft === 'function') editDraft(memoNo);
    }
    else if (action === 'draft-delete') {
      if (typeof deleteDraft === 'function') deleteDraft(memoNo);
    }
    else if (action === 'duplicate') duplicateMemo(memoNo);
    return;
  }
  const row = e.target.closest('tr[data-memo]');
  if (row) openHistoryDetail(row.dataset.memo);
}

// ── Render table ──
function renderHistoryMemos() {
  populateHistFilterOptions();
  populateHistTabCounts();
  const body = document.getElementById('history-body');
  const countEl = document.getElementById('hist-result-count');
  if (!body) return;

  const memos = filteredHistoryMemos();
  if (countEl) countEl.textContent = `แสดง ${memos.length} รายการ · คลิกแถวเพื่อดูรายละเอียด`;

  if (!memos.length) {
    body.innerHTML = `<tr><td colspan="13" class="hist-empty">ยังไม่มี Memo ตามเงื่อนไขที่เลือก</td></tr>`;
    return;
  }

  body.innerHTML = memos.map(memo => {
    const rej = memo.rejectionReason || '';
    const rejShort = rej ? truncateText(rej, 32) : '';
    return `
    <tr class="hist-row" data-memo="${esc(memo.memoNo)}" title="คลิกเพื่อดูรายละเอียด">
      <td class="mono hist-memo-no" style="padding-left:16px">${esc(memo.memoNo)}</td>
      <td><span class="badge ${badgeClass(memo.type)}">${esc(String(memo.type || '').toUpperCase())}</span></td>
      <td class="hist-cell-clip" title="${esc(memo.project || '')}">${esc(memo.project || '—')}</td>
      <td class="hist-cell-clip" title="${esc(histRequesterName(memo))}">${esc(histRequesterName(memo))}</td>
      <td class="mono hist-amt">${esc(money(memo.total || 0))}</td>
      <td><span class="badge ${histStatusBadgeClass(memo)}">${esc(histStatusLabel(memo))}</span></td>
      <td class="hist-cell-clip" title="${esc(histApproverName(memo))}">${esc(histApproverName(memo))}</td>
      <td class="hist-dt">${esc(shortDate(memo.createdAt))}</td>
      <td class="hist-dt">${esc(shortDate(histActivityAt(memo)))}</td>
      <td class="hist-dt">${esc(formatApprovalDuration(memo))}</td>
      <td>${rej ? `<button type="button" class="hist-reject-btn" data-hist-action="reject-reason" data-memo="${esc(memo.memoNo)}" title="${esc(rej)}">${esc(rejShort)}</button>` : '<span style="color:var(--text-3)">—</span>'}</td>
      <td style="text-align:center" onclick="event.stopPropagation()">${buildBudgetTagCell(memo)}</td>
      <td style="text-align:center" onclick="event.stopPropagation()">${histActionButtons(memo)}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('.hist-act-btn, .hist-reject-btn').forEach(btn => {
    btn.addEventListener('click', handleHistoryTableClick);
  });
  body.querySelectorAll('tr[data-memo]').forEach(row => {
    row.addEventListener('click', handleHistoryTableClick);
  });
}

// ── Draft actions (drafts live in All Memos now) ──
function editDraft(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo || memo.status !== 'draft') return;
  try { localStorage.setItem('orbit-pmo-edit-draft', JSON.stringify(memo)); } catch(e) {}
  swView('create', document.querySelector('.sb-sub-item[onclick*="create"]'), 'Create Memo');
  setTimeout(() => { if (typeof applyDraftEdit === 'function') applyDraftEdit(); }, 100);
}
function deleteDraft(memoNo) {
  if (!confirm(`ลบ Draft "${memoNo}" ออกจากระบบ?`)) return;
  const memos = loadMemos().filter(m => m.memoNo !== memoNo);
  storeMemos(memos);
  renderHistoryMemos();
}

function duplicateMemo(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;
  if (!confirm(`Duplicate "${memoNo}" เป็น Draft ใหม่?`)) return;
  try {
    localStorage.setItem('orbit-pmo-edit-draft', JSON.stringify({
      ...memo,
      id: undefined, memoNo: undefined, // will be regenerated
      status: 'draft',
      createdAt: undefined, updatedAt: undefined,
      approvedAt: undefined, rejectedAt: undefined,
      approvedBy: undefined, rejectedBy: undefined,
      approvalNote: undefined, rejectionReason: undefined,
      auditLog: [],
    }));
  } catch(e) {}
  swView('create', document.querySelector('.sb-sub-item[onclick*="create"]'), 'Create Memo');
  setTimeout(() => { if (typeof applyDraftEdit === 'function') applyDraftEdit(); }, 100);
}

document.addEventListener('click', e => {
  if (!e.target.closest('.hist-reject-btn') && !e.target.closest('#hist-reject-popover')) {
    hideRejectionPopover();
  }
});



// ── Budget Tag Cell (inline in history table) ──
// Default: auto-assign to memo.project — PMO can override to Company-Wide
function getEffectiveBudgetSource(memo) {
  // If PMO manually set it, use that
  if(memo.budgetSource) return { source: memo.budgetSource, isAuto: false };
  // Otherwise auto-assign to memo project
  return { source: memo.project || '(ไม่ระบุ)', isAuto: true };
}

function buildBudgetTagCell(memo) {
  if(memo.type !== 'sl' || memo.status !== 'completed') {
    return '<span style="color:var(--text-3);font-size:11px">—</span>';
  }
  const { source, isAuto } = getEffectiveBudgetSource(memo);
  const isCompany = source === 'Company-Wide';

  if(isAuto) {
    // Auto-assigned — show with subtle style + override button
    return `<span style="font-size:10px;padding:2px 7px;background:var(--green-50);color:var(--green-800);border-radius:4px;cursor:pointer;white-space:nowrap" onclick="openBudgetTagModal('${esc(memo.memoNo)}')" title="Auto จาก project — คลิกเพื่อ override">${esc(source)} <span style="opacity:.6">auto</span></span>`;
  }
  // Manually overridden
  return `<span style="font-size:10px;padding:2px 7px;background:${isCompany?'var(--blue-50)':'var(--green-50)'};color:${isCompany?'var(--blue-800)':'var(--green-800)'};border:0.5px solid ${isCompany?'#B5D4F4':'#C0DD97'};border-radius:4px;cursor:pointer;white-space:nowrap" onclick="openBudgetTagModal('${esc(memo.memoNo)}')" title="คลิกเพื่อเปลี่ยน">⚑ ${esc(source)}</span>`;
}

// ── Budget Source Tag ──
function buildBudgetSourceBadge(memo) {
  if(!memo.budgetSource) return '<span style="font-size:11px;background:var(--amber-50);color:var(--amber-800);padding:2px 8px;border-radius:4px;cursor:pointer" onclick="openBudgetTagModal(\''+esc(memo.memoNo)+'\')">⚑ ยังไม่ได้ Tag</span>';
  const isCompany = memo.budgetSource === 'Company-Wide';
  return `<span style="font-size:11px;background:${isCompany?'var(--blue-50)':'var(--green-50)'};color:${isCompany?'var(--blue-800)':'var(--green-800)'};padding:2px 8px;border-radius:4px;cursor:pointer" onclick="openBudgetTagModal('${esc(memo.memoNo)}')">${esc(memo.budgetSource)}</span>`;
}

function openBudgetTagModal(memoNo) {
  const memo = getHistoryMemos().find(m => m.memoNo === memoNo);
  if(!memo) return;
  const s = typeof loadSettings === 'function' ? loadSettings() : null;
  const projects = s?.projects || ['AOA-MP','TTB','Geo9','Release 2.1','Axistant'];

  const options = ['Company-Wide', ...projects.filter(p => p !== memo.project), memo.project]
    .filter((v,i,a) => a.indexOf(v) === i);

  const modal = document.getElementById('budget-tag-modal');
  if(!modal) return;

  const { source: curSource, isAuto } = getEffectiveBudgetSource(memo);
  document.getElementById('btm-memo-no').textContent = memo.memoNo;
  document.getElementById('btm-memo-detail').textContent = `${memo.project} · ${typeof money === 'function' ? money(memo.total||0) : memo.total}`;
  const noteEl = document.getElementById('btm-auto-note');
  if(noteEl) {
    noteEl.textContent = isAuto
      ? `ตอนนี้ใช้ค่า default: "${curSource}" (จาก project) — override ถ้าต้องการเปลี่ยน`
      : `Override โดย PMO: "${curSource}" — เลือกใหม่เพื่อเปลี่ยน`;
    noteEl.style.color = isAuto ? 'var(--text-3)' : 'var(--amber-800)';
  }

  const optContainer = document.getElementById('btm-options');
  optContainer.innerHTML = options.map(opt => {
    const isCompany = opt === 'Company-Wide';
    const isSelected = curSource === opt;
    return `<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:0.5px solid var(--border);border-radius:var(--r);margin-bottom:8px;cursor:pointer;${isSelected?'background:var(--blue-50);border-color:var(--blue)':''}">
      <input type="radio" name="bsrc-opt" value="${esc(opt)}" ${isSelected?'checked':''} style="margin-top:2px">
      <div>
        <div style="font-size:12px;font-weight:500">${esc(opt)}</div>
        ${isCompany ? '<div style="font-size:11px;color:var(--text-3)">งบกลางของบริษัท — ใช้ร่วมกันทุกโปรเจค</div>' : `<div style="font-size:11px;color:var(--text-3)">ตัดงบจาก ${esc(opt)} Budget</div>`}
      </div>
    </label>`;
  }).join('');

  document.getElementById('btm-save-btn').onclick = () => saveBudgetTag(memoNo);
  modal.style.display = 'flex';
}

function closeBudgetTagModal() {
  const modal = document.getElementById('budget-tag-modal');
  if(modal) modal.style.display = 'none';
}

function saveBudgetTag(memoNo) {
  const memo = getHistoryMemos().find(m => m.memoNo === memoNo);
  if(!memo) return;
  const selected = document.querySelector('input[name="bsrc-opt"]:checked')?.value;
  if(!selected) { alert('กรุณาเลือก Budget Source'); return; }
  // If selected == project (auto default), clear override → revert to auto
  const isRevertToAuto = selected === (memo.project || '(ไม่ระบุ)') && memo.budgetSource;
  updateMemoStatus(memoNo, 'completed', { budgetSource: selected === (memo.project||'(ไม่ระบุ)') ? null : selected });
  closeBudgetTagModal();
  renderHistoryMemos();
}
