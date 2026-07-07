// ─────────────────────────────────────────
// views/history.js — PMO History & Audit workspace
// ─────────────────────────────────────────

const HIST_TYPE_LABELS = { sl:'Software License', hw:'Hardware', int:'Team Activity', ent:'Client Expense', dep:'Deployment' };

// memoStatusKey / histStatusLabel / histStatusBadgeClass — defined in app.js
// (single source of truth, moved there in Milestone 1A Task 1.4)

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
    if (!memo.status || (memo.status === 'pending' || memo.status === 'pending_a2' || memo.status === 'pending_a3') || memo.status === 'draft') return '—';
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
    pending:   all.filter(m => !m.status || (m.status === 'pending' || m.status === 'pending_a2' || m.status === 'pending_a3')).length,
    completed: all.filter(m => m.status === 'completed').length,
    rejected:  all.filter(m => m.status === 'rejected').length,
    cancelled: all.filter(m => m.status === 'cancelled').length,
    voided:    all.filter(m => m.status === 'voided').length,
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
  const type = msValues('hist-type');
  const project = msValues('hist-project');
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
    if (type.length && !type.includes(memo.type)) return false;
    if (project.length && !project.includes(memo.project)) return false;
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

  // Project is a multi-select filter (Part 8, UX consistency pass).
  const projSel = document.getElementById('hist-project');
  if (projSel) {
    const curSelected = msValues('hist-project');
    projSel.innerHTML = projects.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    Array.from(projSel.options).forEach(o => { if (curSelected.includes(o.value)) o.selected = true; });
    refreshMultiSelectUI('hist-project');
  }
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
  return devices.filter(d => d.memoNo === memo.memoNo);
}
// Device Management D2 (Part 5) — Purchase Orders linked to a Hardware memo.
function getLinkedPurchaseOrders(memo) {
  if (memo.type !== 'hw' || typeof loadPurchaseOrders !== 'function') return [];
  return loadPurchaseOrders().filter(po => po.memoNo === memo.memoNo);
}
// Device Management D2 (Part 5) — "View Purchase Orders" / "View Devices"
// buttons for the memo detail action bar, only rendered when a linked record
// actually exists. Shared by openHistoryDetail() and openMemoReadOnly() so
// the two detail views don't diverge (no duplicated memo-rendering logic).
function _memoLinkedRecordsButtonsHtml(memo) {
  const _no = esc(memo.memoNo);
  const hasPOs     = getLinkedPurchaseOrders(memo).length > 0;
  const hasDevices = getLinkedDevices(memo).length > 0;
  return `
    ${hasPOs ? `<button class="btn-sm" type="button" onclick="closeDetailModal();if(typeof viewPurchaseOrdersForMemo==='function')viewPurchaseOrdersForMemo('${_no}')">📦 View Purchase Orders</button>` : ''}
    ${hasDevices ? `<button class="btn-sm" type="button" onclick="closeDetailModal();if(typeof viewDevicesForMemo==='function')viewDevicesForMemo('${_no}')">🖥 View Devices</button>` : ''}
  `;
}

// ── Detail modal (audit workspace) ──
// Approval Timeline — single data source shared by the screen widget
// (buildApprovalTimeline, below) and the PDF appendix
// (buildApprovalTimelinePdfHtml, app.js's renderMemoPdf). Only applicable
// events for this memo are included — no fixed/hardcoded stage list.
function computeApprovalTimelineEvents(memo) {
  const events = [];
  if (memo.createdAt) events.push({ at: memo.createdAt, label: 'สร้าง Memo (Draft)', actor: histRequesterName(memo), kind: 'create' });
  if (memo.submittedAt && memo.submittedAt !== memo.createdAt) {
    events.push({ at: memo.submittedAt, label: 'ส่งขออนุมัติ (Submitted)', actor: histRequesterName(memo), kind: 'submit' });
  }
  // Terminal-status events are pushed before the per-step loop below so the
  // dedup pass (same instant + same actor) keeps the terminal label
  // ("Completed"/"Rejected") rather than the final approver's own step event
  // — both fire at the identical timestamp in real data, since
  // updateMemoStatusAsync() stamps the final step and the memo itself with
  // the same `now`. "Completed" is shown whenever the memo was ever
  // approved, even if a later Void moved status away from 'completed' —
  // reaching Approved/Completed is a historical fact that Void doesn't erase.
  if (memo.approvedAt) {
    events.push({ at: memo.approvedAt, label: 'อนุมัติสมบูรณ์ (Completed)', actor: memo.approvedBy || memo.approverName, kind: 'done' });
  }
  if (memo.status === 'rejected' && memo.rejectedAt) {
    events.push({ at: memo.rejectedAt, label: 'ปฏิเสธ (Rejected)', actor: memo.rejectedBy, comment: memo.rejectionReason, kind: 'reject' });
  }
  if (memo.status === 'cancelled' && memo.cancelledAt) {
    events.push({ at: memo.cancelledAt, label: 'ยกเลิก (Cancelled)', actor: memo.cancelledBy, comment: memo.cancellationReason, kind: 'audit' });
  }
  if (memo.voidedAt) {
    events.push({ at: memo.voidedAt, label: 'Void แล้ว (Voided)', actor: memo.voidedBy, comment: memo.voidReason, kind: 'reject' });
  }
  (memo.approvers || []).forEach((a, i) => {
    const roleLabel = i === 0 ? 'Reviewer' : `Approver ${i}`;
    if (a.status === 'approved' && a.approvedAt) {
      events.push({ at: a.approvedAt, label: `${roleLabel} อนุมัติ (Reviewed/Approved)`, actor: a.approvedBy || a.name, kind: 'approve' });
    } else if (a.status === 'bypassed' && a.approvedAt) {
      events.push({ at: a.approvedAt, label: `${roleLabel} ข้ามการตรวจสอบ (Self Review)`, actor: a.name, kind: 'approve' });
    } else if (a.status === 'overridden' && a.overriddenAt) {
      events.push({ at: a.overriddenAt, label: `${roleLabel} — PMO Override`, actor: a.overriddenBy, comment: a.overrideNote, kind: 'audit' });
    } else if (a.status === 'rejected' && a.rejectedAt) {
      events.push({ at: a.rejectedAt, label: `${roleLabel} ปฏิเสธ (Rejected)`, actor: a.rejectedBy, kind: 'reject' });
    }
  });
  (memo.approvalChain || []).forEach(step => {
    if (step.doneAt) events.push({ at: step.doneAt, label: `${step.role} อนุมัติ`, actor: step.name, kind: 'approve' });
  });
  (memo.auditLog || []).forEach(e => {
    events.push({ at: e.timestamp, label: e.action, actor: e.actor, comment: e.comment, kind: 'audit' });
  });
  // De-duplicate: the same transition is often captured both as a structured
  // field above (for a friendlier label) and as a generic auditLog entry.
  // Keep the first (friendlier) occurrence for a given timestamp+actor pair.
  const seen = new Set();
  const deduped = events.filter(e => {
    const key = `${e.at}|${e.actor || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  deduped.sort((a, b) => new Date(a.at) - new Date(b.at));
  return deduped;
}
function buildApprovalTimeline(memo) {
  const events = computeApprovalTimelineEvents(memo);
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
// PDF-safe rendering of the same timeline data — no CSS classes (the remote
// PDF server and the local print fallback don't share app.js's stylesheet),
// reuses the shared `table()` helper (app.js) for consistent print styling.
function buildApprovalTimelinePdfHtml(memo) {
  const events = computeApprovalTimelineEvents(memo);
  if (!events.length) return '';
  const rows = events.map((e, i) => [i + 1, e.label, e.actor || '—', e.at ? formatDateTime(e.at) : '—']);
  return `<div style="margin-top:16px">
    <div style="font-weight:700;color:#185FA5;margin-bottom:6px;font-size:13pt">Approval Timeline</div>
    ${table(['#', 'เหตุการณ์ (Event)', 'ผู้ดำเนินการ (Actor)', 'วันที่ / เวลา'], rows, [], [0])}
  </div>`;
}

// ── Approval Information — Reviewer/Approver/PMO Override/Self Review/
// Rejected/Cancelled/Void details, single data source for the screen widget
// and the PDF appendix. Only rows that actually apply to this memo are
// returned (Task: "Display only information that actually exists").
function buildApprovalInfoRows(memo) {
  const rows = [];
  const requester = histRequesterName(memo);
  if (requester && requester !== '—') rows.push(['ผู้ขอ (Requester)', requester]);

  (memo.approvers || []).forEach((a, i) => {
    if (!a || !a.name) return;
    const roleLabel = i === 0 ? 'ผู้ตรวจสอบ (Reviewer)' : `ผู้อนุมัติ ${i} (Approver ${i})`;
    const statusText = a.status === 'approved' ? 'อนุมัติแล้ว (Approved)'
      : a.status === 'bypassed' ? 'ข้ามการตรวจสอบ (Self Review)'
      : a.status === 'overridden' ? 'PMO Override'
      : a.status === 'rejected' ? 'ปฏิเสธ (Rejected)'
      : 'รอดำเนินการ (Pending)';
    const atIso = a.approvedAt || a.overriddenAt || a.rejectedAt || null;
    const atText = atIso ? formatDateTime(atIso) : null;
    rows.push([roleLabel, `${a.name}${a.title ? ' ('+a.title+')' : ''} — ${statusText}${atText ? ' · ' + atText : ''}`]);

    if (a.status === 'overridden') {
      rows.push([`PMO Override — ${roleLabel}`, `โดย ${a.overriddenBy || '—'}${a.overrideNote ? ' · เหตุผล: ' + a.overrideNote : ''}`]);
    }
    if (a.status === 'bypassed') {
      rows.push([`Self Review — ${roleLabel}`, `${a.name} เป็นผู้ขอเอง จึงข้ามขั้นตอนการตรวจสอบของตนเอง`]);
    }
  });

  if (memo.submittedAt) rows.push(['วันที่ส่งขออนุมัติ (Submitted)', formatDateTime(memo.submittedAt)]);
  if (memo.status === 'completed' && memo.approvedAt) rows.push(['วันที่อนุมัติสมบูรณ์ (Approved)', formatDateTime(memo.approvedAt)]);

  if (memo.status === 'rejected') {
    rows.push(['เหตุผลที่ปฏิเสธ (Rejected Reason)', memo.rejectionReason || '—']);
    rows.push(['ปฏิเสธโดย / วันที่', `${memo.rejectedBy || '—'} · ${memo.rejectedAt ? formatDateTime(memo.rejectedAt) : '—'}`]);
  }
  if (memo.status === 'cancelled') {
    rows.push(['เหตุผลที่ยกเลิก (Cancelled Reason)', memo.cancellationReason || '—']);
    rows.push(['ยกเลิกโดย / วันที่', `${memo.cancelledBy || '—'} · ${memo.cancelledAt ? formatDateTime(memo.cancelledAt) : '—'}`]);
  }
  if (memo.voidedAt) {
    rows.push(['เหตุผลที่ Void (Void Reason)', memo.voidReason || '—']);
    rows.push(['Void โดย / วันที่', `${memo.voidedBy || '—'} · ${formatDateTime(memo.voidedAt)}`]);
    if (memo.voidEvidenceUrl) rows.push(['หลักฐาน Void (Evidence)', 'แนบไฟล์แล้ว']);
  }
  return rows;
}
function _buildMemoApprovalInfoHtml(memo) {
  const rows = buildApprovalInfoRows(memo);
  if (!rows.length) return '';
  return `
    <div style="margin-top:14px">
      <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
        text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">ข้อมูลการอนุมัติ</div>
      <div style="border:0.5px solid var(--border,var(--color-border-tertiary));
        border-radius:var(--r-sm,var(--border-radius-md));padding:0 12px">
        ${rows.map(([label, value]) => `
          <div style="display:flex;gap:12px;padding:7px 0;
            border-bottom:0.5px solid var(--border,var(--color-border-tertiary))">
            <div style="font-size:11px;color:var(--text-3,var(--color-text-tertiary));
              white-space:nowrap;min-width:150px">${esc(label)}</div>
            <div style="font-size:12px;color:var(--text-1,var(--color-text-primary))">${esc(value)}</div>
          </div>`).join('')}
      </div>
    </div>`;
}
function buildApprovalInfoPdfHtml(memo) {
  const rows = buildApprovalInfoRows(memo);
  if (!rows.length) return '';
  return `<div style="margin-top:16px">
    <div style="font-weight:700;color:#185FA5;margin-bottom:6px;font-size:13pt">ข้อมูลการอนุมัติ (Approval Information)</div>
    ${table(['รายการ', 'รายละเอียด'], rows)}
  </div>`;
}

// ── Shared memo detail content builder ──────────────────
// mode: 'full' (History/Pending) | 'readonly' (Budget/License/Device)
function _buildMemoDetailContent(memo, mode) {
  const _st = memo.status || '';
  const isCompleted = _st === 'completed';
  const isDraft     = _st === 'draft';
  const isPMOUser   = typeof isPMO === 'function' && isPMO();

  // ── Core 3-field row ──
  const dateLabel  = isCompleted ? 'วันที่อนุมัติ' : isDraft ? 'สร้างเมื่อ' : 'วันที่ขอ';
  const dateValue  = isCompleted
    ? (shortDate(memo.approvedAt || memo.updatedAt) || '—')
    : (shortDate(memo.createdAt) || '—');

  const coreHtml = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;
      background:var(--bg-2,var(--color-background-secondary));
      border-radius:var(--r-sm,var(--border-radius-md));
      padding:10px 12px;margin-bottom:14px">
      <div>
        <span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
          text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">วงเงิน</span>
        <span style="font-size:14px;font-weight:500;color:var(--blue-800,var(--color-text-info));
          font-family:var(--font-mono)">${esc(money(memo.total||0))}</span>
      </div>
      <div>
        <span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
          text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">ผู้ขอ</span>
        <span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(histRequesterName(memo))}</span>
      </div>
      <div>
        <span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
          text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">${dateLabel}</span>
        <span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${dateValue}</span>
      </div>
    </div>`;

  // ── Type-specific section ──
  const sectionHtml = _buildMemoTypeSection(memo);

  // ── Approvers timeline (minimal) ──
  const approversHtml = _buildMemoApproversTimeline(memo);

  // ── PMO-only: Budget Source ──
  const pmoHtml = isPMOUser && !isDraft && mode !== 'readonly' ? `
    <div style="background:var(--amber-50,var(--color-background-warning));
      border:0.5px solid var(--amber,var(--color-border-warning));
      border-radius:var(--r-sm,var(--border-radius-md));
      padding:9px 12px;margin-top:14px">
      <div style="font-size:9px;font-weight:500;
        color:var(--amber-800,var(--color-text-warning));
        text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">PMO only</div>
      ${buildBudgetSourceBadge(memo)}
      <span style="font-size:11px;color:var(--amber-800,var(--color-text-warning));margin-left:8px">
        ${memo.budgetSource ? 'override · คลิกเพื่อเปลี่ยน' : 'auto-assigned'}
      </span>
    </div>` : '';

  // ── Approval Timeline (chronological, only applicable events) ──
  const timelineHtml = `
    <div style="margin-top:14px">
      <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
        text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">Approval Timeline</div>
      <div class="hist-timeline">${buildApprovalTimeline(memo)}</div>
    </div>`;

  // ── Approval Information — Reviewer/Approver/PMO Override/Self Review/
  // Rejected/Cancelled/Void, single source shared with the PDF appendix.
  const approvalInfoHtml = _buildMemoApprovalInfoHtml(memo);

  // ── เรียน / เหตุผล block ──
  const toReasonHtml = (memo.to || memo.reason) ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      ${memo.to ? `
      <div style="background:var(--bg-2,var(--color-background-secondary));
        border-radius:var(--r-sm,var(--border-radius-md));padding:9px 12px">
        <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
          text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">เรียน</div>
        <div style="font-size:13px;color:var(--text-1,var(--color-text-primary))">${esc(memo.to)}</div>
      </div>` : '<div></div>'}
      ${memo.reason ? `
      <div style="background:var(--bg-2,var(--color-background-secondary));
        border-radius:var(--r-sm,var(--border-radius-md));padding:9px 12px">
        <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
          text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">เหตุผลในการขอ</div>
        <div style="font-size:12px;color:var(--text-1,var(--color-text-primary));
          line-height:1.5">${esc(memo.reason)}</div>
      </div>` : '<div></div>'}
    </div>` : '';

  // ── Audit Log (full mode only) ──
  const auditHtml = mode !== 'readonly' ? (() => {
    const entries = memo.auditLog || [];
    const rows = entries.length
      ? entries.map(e => `
          <div style="display:flex;gap:12px;padding:7px 0;
            border-bottom:0.5px solid var(--border,var(--color-border-tertiary))">
            <div style="font-size:11px;color:var(--text-3,var(--color-text-tertiary));
              white-space:nowrap;min-width:90px">${esc(shortDate(e.timestamp))}</div>
            <div style="font-size:12px;color:var(--text-2,var(--color-text-secondary))">
              <span style="font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(e.actor)}</span>
              — ${esc(e.action)}
              ${e.comment ? `<div style="font-size:11px;color:var(--text-3,var(--color-text-tertiary));
                margin-top:2px">${esc(e.comment)}</div>` : ''}
            </div>
          </div>`).join('')
      : `<div style="font-size:12px;color:var(--text-3,var(--color-text-tertiary));
          padding:8px 0">ยังไม่มีประวัติ</div>`;
    return `
      <div style="margin-top:14px">
        <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
          text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">Audit Log</div>
        <div style="border:0.5px solid var(--border,var(--color-border-tertiary));
          border-radius:var(--r-sm,var(--border-radius-md));padding:0 12px">
          ${rows}
        </div>
      </div>`;
  })() : '';

  return `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
      padding-bottom:12px;margin-bottom:12px;
      border-bottom:0.5px solid var(--border,var(--color-border-tertiary))">
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:500;
          color:var(--text-1,var(--color-text-primary));margin-bottom:4px">${esc(memo.memoNo)}</div>
        <div style="font-size:11px;color:var(--text-2,var(--color-text-secondary));
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:440px">
          ${esc(memo.subject || memoSubject(memo))}</div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-top:5px">
          <span class="badge ${badgeClass(memo.type)}">${esc(String(memo.type||'').toUpperCase())}</span>
          <span class="badge ${histStatusBadgeClass(memo)}">${esc(histStatusLabel(memo))}</span>
          ${memo.project ? `<span style="font-size:11px;color:var(--text-2,var(--color-text-secondary))">${esc(memo.project)}</span>` : ''}
        </div>
      </div>
    </div>
    ${coreHtml}
    ${toReasonHtml}
    ${sectionHtml}
    ${approversHtml}
    ${timelineHtml}
    ${approvalInfoHtml}
    ${auditHtml}
    ${pmoHtml}`;
}

// ── Collapsible toggle helper ──────────────────────────────────────
// Using a named function avoids Thai text encoding issues in inline onclick strings
function _toggleCollapsible(headerEl) {
  const body  = headerEl.nextElementSibling;
  const arrow = headerEl.querySelector('.coll-arrow');
  if (!body) return;
  const isOpen = body.style.display === 'block';
  body.style.display  = isOpen ? 'none' : 'block';
  if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
}

// ── Type-specific section builder ──────────────────────
function _buildMemoTypeSection(memo) {
  const type = memo.type;
  const sections = memo.sections || [];

  // Shared mini-table builder — used as fallback when sections is empty
  function miniTable(headers, rows) {
    if (!rows.length) return '';
    const thCss = 'background:var(--bg-2,var(--color-background-secondary));padding:5px 9px;text-align:left;font-weight:500;font-size:11px;color:var(--text-2,var(--color-text-secondary));border-bottom:0.5px solid var(--border,var(--color-border-tertiary))';
    const tdCss = 'padding:6px 9px;border-bottom:0.5px solid var(--bg-2,var(--color-border-tertiary));color:var(--text-1,var(--color-text-primary));font-size:11px';
    const ths = headers.map(h => `<th style="${thCss}">${esc(h)}</th>`).join('');
    const trs = rows.map(r => `<tr>${r.map(c => `<td style="${tdCss}">${esc(String(c ?? '—'))}</td>`).join('')}</tr>`).join('');
    return `<table style="width:100%;border-collapse:collapse"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  }

  // ── SL ──
  if (type === 'sl') {
    const swSection = sections.find(s => s.title === 'รายการ Software');
    const acctSection = sections.find(s => s.title === 'ตาราง Account');

    let swHtml = swSection ? _cleanSectionTable(swSection.html) : '';
    // Fallback: rebuild from slItems raw data (older/imported memos)
    if (!swHtml && (memo.slItems || []).length) {
      const rows = memo.slItems.map((it, i) => [
        i + 1, it.name || '—', it.plan || '—',
        it.price ? money(it.price) : '—', it.months || '—', it.qty || '—',
        it.startMonth || '—', it.endMonth || '—',
        (it.price && it.months && it.qty) ? money(it.price * it.months * it.qty) : '—',
      ]);
      swHtml = miniTable(['#','ชื่อ Software','Plan','฿/เดือน','เดือน','จำนวน','เริ่ม','สิ้นสุด','รวม'], rows);
    }

    const acctRows = acctSection ? (() => {
      const tmp = document.createElement('div');
      tmp.innerHTML = acctSection.html;
      return tmp.querySelectorAll('tbody tr').length;
    })() : 0;

    return `
      ${swHtml ? `
        <div style="margin-bottom:14px">
          <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
            text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">รายการ Software</div>
          <div style="border:0.5px solid var(--border,var(--color-border-tertiary));
            border-radius:var(--r-sm,var(--border-radius-md));overflow:hidden">${swHtml}</div>
        </div>` : ''}
      ${acctSection && acctRows > 0 ? `
        <div style="margin-bottom:14px">
          <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
            text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">
            ตาราง Account <span style="font-weight:400">(${acctRows} account)</span></div>
          <div style="border:0.5px solid var(--border,var(--color-border-tertiary));
            border-radius:var(--r-sm,var(--border-radius-md));overflow:hidden">
            <div onclick="_toggleCollapsible(this)"
              style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;cursor:pointer;background:var(--bg-2,var(--color-background-secondary))">
              <span style="font-size:11px;color:var(--text-2,var(--color-text-secondary))">ดูรายชื่อ account</span>
              <span class="coll-arrow" style="font-size:12px;color:var(--text-3,var(--color-text-tertiary));transition:transform .15s;display:inline-block">&#x25BC;</span>
            </div>
            <div style="display:none">${_cleanSectionTable(acctSection.html)}</div>
          </div>
        </div>` : ''}`;
  }

  // ── HW ──
  if (type === 'hw') {
    const hwSection = sections.find(s => s.title === 'รายการ Hardware');
    let hwHtml = hwSection ? _cleanSectionTable(hwSection.html) : '';
    // Fallback from hwItems
    if (!hwHtml && (memo.hwItems || []).length) {
      const rows = memo.hwItems.map((it, i) => [
        i + 1, it.name || '—',
        it.price ? money(it.price) : '—', it.qty || '—',
        (it.price && it.qty) ? money(it.price * it.qty) : '—',
      ]);
      hwHtml = miniTable(['#','ชื่ออุปกรณ์','ราคา/ชิ้น','จำนวน','รวม'], rows);
    }
    return hwHtml ? `
      <div style="margin-bottom:14px">
        <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
          text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">รายการ Hardware</div>
        <div style="border:0.5px solid var(--border,var(--color-border-tertiary));
          border-radius:var(--r-sm,var(--border-radius-md));overflow:hidden">${hwHtml}</div>
      </div>` : '';
  }

  // ── INT ──
  if (type === 'int') {
    const nameSection = sections.find(s => s.title === 'รายชื่อผู้เข้าร่วม');
    const actSection  = sections.find(s => s.title === 'รายละเอียดกิจกรรม');
    const nameCount = nameSection ? (() => {
      const tmp = document.createElement('div');
      tmp.innerHTML = nameSection.html;
      return tmp.querySelectorAll('tbody tr').length;
    })() : 0;
    const infoHtml = `
      <div style="display:flex;gap:14px;flex-wrap:wrap;background:var(--bg-2,var(--color-background-secondary));border-radius:var(--r-sm,var(--border-radius-md));padding:9px 12px;margin-bottom:10px">
        ${memo.intActivity ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">กิจกรรม</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(memo.intActivity)}</span></div>` : ''}
        ${memo.intDate ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">วันที่จัด</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(memo.intDate)}</span></div>` : ''}
        ${memo.intHeadcount ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">จำนวน</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${memo.intHeadcount} คน</span></div>` : ''}
        ${memo.intPP ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">฿/คน</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(money(memo.intPP))}</span></div>` : ''}
        ${!memo.intActivity && actSection ? `<div style="font-size:12px;color:var(--text-1)">${actSection.html}</div>` : ''}
      </div>`;
    return `
      <div style="margin-bottom:14px">
        <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">กิจกรรม Team Activity</div>
        ${infoHtml}
        ${nameSection && nameCount > 0 ? `
        <div style="border:0.5px solid var(--border,var(--color-border-tertiary));border-radius:var(--r-sm,var(--border-radius-md));overflow:hidden">
          <div onclick="_toggleCollapsible(this)"
            style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;cursor:pointer;background:var(--bg-2,var(--color-background-secondary))">
            <span style="font-size:11px;color:var(--text-2,var(--color-text-secondary))">รายชื่อผู้เข้าร่วม (${nameCount} คน)</span>
            <span class="coll-arrow" style="font-size:12px;color:var(--text-3,var(--color-text-tertiary));transition:transform .15s;display:inline-block">&#x25BC;</span>
          </div>
          <div style="display:none">${_cleanSectionTable(nameSection.html)}</div>
        </div>` : ''}
      </div>`;
  }

  // ── ENT ──
  if (type === 'ent') {
    return `
      <div style="margin-bottom:14px">
        <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">รายละเอียดงานรับรอง</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;background:var(--bg-2,var(--color-background-secondary));border-radius:var(--r-sm,var(--border-radius-md));padding:9px 12px">
          ${memo.entClient ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">ลูกค้า</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(memo.entClient)}</span></div>` : ''}
          ${memo.entDate ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">วันที่จัดงาน</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(memo.entDate)}</span></div>` : ''}
          ${memo.entPlace ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">สถานที่</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(memo.entPlace)}</span></div>` : ''}
          ${memo.entPeople ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">จำนวนผู้ร่วม</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(memo.entPeople)} คน</span></div>` : ''}
        </div>
      </div>`;
  }

  // ── DEP ──
  if (type === 'dep') {
    const expSection = sections.find(s => s.title === 'รายการค่าใช้จ่าย' || s.title === 'รายละเอียดค่าใช้จ่าย');
    return `
      <div style="margin-bottom:14px">
        <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">รายละเอียด Deployment</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;background:var(--bg-2,var(--color-background-secondary));border-radius:var(--r-sm,var(--border-radius-md));padding:9px 12px;margin-bottom:10px">
          ${memo.depLocation ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">สถานที่</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(memo.depLocation)}</span></div>` : ''}
          ${memo.depStart ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">วันที่</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${esc(memo.depStart)}${memo.depEnd && memo.depEnd!==memo.depStart?' – '+esc(memo.depEnd):''}</span></div>` : ''}
          ${memo.depEmpCount ? `<div><span style="display:block;font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">จำนวน</span><span style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">${memo.depEmpCount} คน</span></div>` : ''}
        </div>
        ${expSection ? `<div style="border:0.5px solid var(--border,var(--color-border-tertiary));border-radius:var(--r-sm,var(--border-radius-md));overflow:hidden">${_cleanSectionTable(expSection.html)}</div>` : ''}
      </div>`;
  }

  // ── Fallback: render all sections as generic blocks ──
  return sections.map(s => `
    <div style="margin-bottom:14px">
      <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
        text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">${esc(s.title)}</div>
      <div>${s.html}</div>
    </div>`).join('');
}

// ── Approvers timeline ──────────────────────────────────
function _buildMemoApproversTimeline(memo) {
  const approvers = memo.approvers || [];
  if (!approvers.length) return '';

  const items = approvers.map(a => {
    const isApproved   = a.status === 'approved';
    const isRejected   = a.status === 'rejected';
    const isBypassed   = a.status === 'bypassed';
    const isOverridden = a.status === 'overridden';
    // Milestone 1A Task 1.3: Bypassed/Overridden now render as distinct labels
    // instead of collapsing into Approved/Pending, per MEMO_LIFECYCLE.md §7.
    const dotColor   = isApproved   ? 'var(--green-800,var(--color-text-success))'
                     : isRejected   ? 'var(--red-800,var(--color-text-danger))'
                     : isBypassed   ? 'var(--blue-800,var(--color-text-info))'
                     : isOverridden ? 'var(--amber-800,var(--color-text-warning))'
                     : 'var(--text-3,var(--color-text-tertiary))';
    const statusText = isApproved   ? 'Approved'
                     : isRejected   ? 'Rejected'
                     : isBypassed   ? 'Bypassed (Self-review)'
                     : isOverridden ? 'Overridden by PMO'
                     : 'Pending';
    const statusColor = isApproved   ? 'var(--green-800,var(--color-text-success))'
                      : isRejected   ? 'var(--red-800,var(--color-text-danger))'
                      : isBypassed   ? 'var(--blue-800,var(--color-text-info))'
                      : isOverridden ? 'var(--amber-800,var(--color-text-warning))'
                      : 'var(--text-3,var(--color-text-tertiary))';
    return `
      <div style="position:relative;margin-bottom:8px;padding-left:18px">
        <div style="position:absolute;left:0;top:4px;width:7px;height:7px;border-radius:50%;
          background:${dotColor};border:2px solid var(--surface,var(--color-background-primary))"></div>
        <div style="font-size:12px;font-weight:500;color:var(--text-1,var(--color-text-primary))">
          ${esc(a.name||'—')}
          <span style="font-weight:400;color:var(--text-2,var(--color-text-secondary));font-size:11px"> · ${esc(a.title||'')}</span>
        </div>
        <div style="font-size:11px;color:${statusColor}">${statusText}</div>
      </div>`;
  }).join('');

  return `
    <div style="margin-bottom:14px">
      <div style="font-size:9px;font-weight:500;color:var(--text-3,var(--color-text-tertiary));
        text-transform:uppercase;letter-spacing:.05em;margin-bottom:7px">ผู้อนุมัติ</div>
      <div style="border-left:2px solid var(--border-md,var(--color-border-secondary));
        margin-left:4px;padding-left:12px">
        ${items}
      </div>
    </div>`;
}

// ── Clean section HTML (ensure tables have proper styling) ──
function _cleanSectionTable(html) {
  return html
    .replace(/<table/g, '<table style="width:100%;border-collapse:collapse;font-size:11px"')
    .replace(/<th/g, '<th style="background:var(--bg-2,var(--color-background-secondary));padding:5px 9px;text-align:left;font-weight:500;font-size:11px;color:var(--text-2,var(--color-text-secondary));border-bottom:0.5px solid var(--border,var(--color-border-tertiary))"')
    .replace(/<td/g, '<td style="padding:6px 9px;border-bottom:0.5px solid var(--bg-2,var(--color-border-tertiary));color:var(--text-1,var(--color-text-primary))"');
}

// ── Main entry points ───────────────────────────────────
function openHistoryDetail(memoNo) {
  const memo = getHistoryMemos().find(m => m.memoNo === memoNo);
  if (!memo) { alert('ไม่พบ Memo'); return; }

  document.getElementById('detail-content').innerHTML = _buildMemoDetailContent(memo, 'full');

  const acts = document.getElementById('detail-actions');
  const _no  = esc(memo.memoNo);
  const _st  = memo.status || '';
  const isPending   = _st === 'pending' || _st === 'pending_a2' || _st === 'pending_a3';
  const isCompleted = _st === 'completed';
  const isRejected  = _st === 'rejected';
  const isCancelled = _st === 'cancelled';
  const isDraft     = _st === 'draft';
  const isVoided    = _st === 'voided'; // Milestone 1B
  const isOwn       = typeof isMemoRequester === 'function' ? isMemoRequester(memo) : false;
  const canApprove  = isPending && typeof canCurrentUserActOnMemo === 'function' && canCurrentUserActOnMemo(memo);
  const canCancel   = isPending && isOwn;
  const isPMOUser   = typeof isPMO === 'function' && isPMO();

  acts.innerHTML = `
    ${canApprove ? `
      <button class="btn-primary" type="button" onclick="closeDetailModal();openApproveModal('${_no}')">✓ Approve</button>
      <button class="btn-reject"  type="button" onclick="closeDetailModal();openRejectModal('${_no}')">✕ Reject</button>
    ` : ''}
    ${canCancel ? `
      <button class="btn-sm" type="button" style="color:var(--red)" onclick="closeDetailModal();cancelMemo('${_no}')">✕ Cancel</button>
    ` : ''}
    ${!isDraft ? `
      <button class="btn-sm" type="button" onclick="if(typeof downloadMemoPdf==='function'){downloadMemoPdf(loadMemos().find(m=>m.memoNo==='${_no}'))}" style="color:var(--blue)">⬇ Download PDF</button>
    ` : ''}
    ${_memoLinkedRecordsButtonsHtml(memo)}
    ${isRejected ? `
      <button class="btn-sm" type="button" onclick="closeDetailModal();reeditRejectedMemo('${_no}')">✎ Re-edit as New Draft</button>
    ` : ''}
    ${(isCompleted||isCancelled||isPending||isVoided) && !isDraft ? `
      <button class="btn-sm" type="button" onclick="closeDetailModal();duplicateMemo('${_no}')">⊕ Duplicate</button>
    ` : ''}
    ${isDraft ? `
      <button class="btn-sm" type="button" style="color:var(--blue)" onclick="closeDetailModal();if(typeof editDraft==='function')editDraft('${_no}')">✎ Edit Draft</button>
      <button class="btn-sm" type="button" style="color:var(--red)"  onclick="closeDetailModal();if(typeof deleteDraft==='function')deleteDraft('${_no}')">✕ Delete Draft</button>
    ` : ''}
    ${isPMOUser && isCompleted ? `
      <button class="btn-sm" type="button"
        onclick="openBudgetTagModal('${_no}')"
        style="background:${memo.budgetSource ? 'var(--green-50,#F0FDF4)' : 'var(--amber-50,#FFFBEB)'};color:${memo.budgetSource ? 'var(--green-800,#166534)' : 'var(--amber-800,#92400E)'}">
        ⚑ ${memo.budgetSource ? esc(memo.budgetSource) : 'Tag Budget'}
      </button>
    ` : ''}
    ${isPMOUser && isCompleted ? `
      <button class="btn-sm" type="button" style="color:var(--red)" onclick="closeDetailModal();openVoidModal('${_no}')">⊘ Void</button>
    ` : ''}
    <button class="btn-ghost" type="button" onclick="closeDetailModal()">ปิด</button>
  `;
  const modalInner = document.querySelector('#detail-modal > div');
  if (modalInner) modalInner.style.maxWidth = '720px';
  document.getElementById('detail-modal').style.display = 'flex';
}

// ── Void (PMO/Admin only, Milestone 1B) ──
function openVoidModal(memoNo) {
  const memo = getHistoryMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;
  const existing = document.getElementById('void-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'void-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:400;display:flex;align-items:center;justify-content:center';
  modal.innerHTML = `
    <div class="card" style="width:480px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <span style="font-size:15px;font-weight:700;color:var(--red)">⊘ Void Memo</span>
        <button class="btn-sm" onclick="document.getElementById('void-modal').remove()" style="padding:4px 10px">✕</button>
      </div>
      <div style="font-size:12px;color:var(--text-2);margin-bottom:16px">
        Memo: <strong>${esc(memo.memoNo)}</strong> · ${esc(memo.subject || memo.project || '-')}
      </div>
      <div class="fg" style="margin-bottom:12px">
        <label style="font-size:11px;font-weight:600;color:var(--text-2)">เหตุผลที่ Void *</label>
        <textarea id="void-reason" class="ri" rows="3" style="margin-top:4px" placeholder="ระบุเหตุผลที่ต้อง Void memo นี้"></textarea>
      </div>
      <div class="fg" style="margin-bottom:16px">
        <label style="font-size:11px;font-weight:600;color:var(--text-2)">
          หลักฐานประกอบ (ถ้ามี — ภาพ Email, เอกสารสแกน, PDF)
        </label>
        <div style="margin-top:6px">
          <input type="file" id="void-evidence-file" accept="image/*,.pdf"
            style="font-size:12px;color:var(--text-2)"
            onchange="handleVoidEvidenceUpload(this)">
        </div>
        <div id="void-evidence-preview" style="margin-top:6px;font-size:11px;color:var(--text-3)"></div>
        <input type="hidden" id="void-evidence-url" value="">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-ghost" type="button" onclick="document.getElementById('void-modal').remove()">Cancel</button>
        <button class="btn-sm" type="button" style="background:var(--red);color:#fff" onclick="confirmVoidMemo('${esc(memoNo)}')">⊘ Void Memo</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// Hotfix: Void Evidence UI — same file-to-base64-data-URL pattern already
// used for Approve/PMO-Override evidence (views/pending.js
// handleApproveEvidenceUpload/handlePmoEvidenceUpload). Evidence is optional
// for Void, so a missing/cleared file just leaves void-evidence-url blank —
// voidMemoAsync() already treats a falsy evidenceUrl as "no evidence".
function handleVoidEvidenceUpload(input) {
  const file = input.files[0];
  const preview = document.getElementById('void-evidence-preview');
  const urlInput = document.getElementById('void-evidence-url');
  if (!file) { urlInput.value = ''; preview.textContent = ''; return; }
  if (file.size > 5 * 1024 * 1024) {
    preview.textContent = '⚠ ไฟล์ใหญ่เกิน 5MB';
    preview.style.color = 'var(--red)';
    input.value = ''; urlInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    urlInput.value = e.target.result; // base64 data URL — same pattern as Approve/PMO-Override evidence
    preview.textContent = `✓ แนบแล้ว: ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    preview.style.color = 'var(--green)';
  };
  reader.readAsDataURL(file);
}

async function confirmVoidMemo(memoNo) {
  const reason = document.getElementById('void-reason')?.value.trim();
  const evidenceUrl = document.getElementById('void-evidence-url')?.value.trim() || '';
  if (!reason) { alert('กรุณาระบุเหตุผลที่ Void'); return; }
  const result = await voidMemoAsync(memoNo, reason, evidenceUrl);
  if (!result.ok) {
    if (result.error === 'downstream_blocked') { alert(result.message); return; }
    if (result.error === 'forbidden') { alert('เฉพาะ PMO เท่านั้นที่สามารถ Void memo ได้'); return; }
    if (result.error === 'invalid_status') { alert('Void ได้เฉพาะ memo ที่ Approved แล้วเท่านั้น'); return; }
    alert('ไม่สามารถ Void memo ได้'); return;
  }
  document.getElementById('void-modal')?.remove();
  if (typeof closeDetailModal === 'function') closeDetailModal();
  renderHistoryMemos();
  alert('✓ Void memo เสร็จสิ้น');
}

// ── Read-only detail (Budget / License / Device tabs) ──
function openMemoReadOnly(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo) || getHistoryMemos().find(m => m.memoNo === memoNo);
  if (!memo) { alert('ไม่พบ Memo'); return; }
  document.getElementById('detail-content').innerHTML = _buildMemoDetailContent(memo, 'readonly');
  const acts = document.getElementById('detail-actions');
  // Read-only tabs: no approve/reject/tag-budget/duplicate, but the Device
  // Management deep-links (Part 5) are still useful here since this view is
  // itself reached by clicking a memo number from the PO table.
  if (acts) acts.innerHTML = `${_memoLinkedRecordsButtonsHtml(memo)}<button class="btn-ghost" type="button" onclick="closeDetailModal()">ปิด</button>`;
  const modalInner = document.querySelector('#detail-modal > div');
  if (modalInner) modalInner.style.maxWidth = '680px';
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
  const headers = ['Memo No', 'Type', 'Project', 'Amount', 'Status', 'Requester', 'Approver', 'Created', 'Updated', 'Rejection Reason', 'Subject'];
  const rows = memos.map(m => [
    m.memoNo, String(m.type || '').toUpperCase(), m.project || '',
    Number(m.total) || 0, histStatusLabel(m),
    histRequesterName(m), histApproverName(m),
    m.createdAt || '', histActivityAt(m) || '',
    m.rejectionReason || '', m.subject || ''
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
  const no     = esc(memo.memoNo);
  const status = memo.status;
  const isDraft     = status === 'draft';
  const isPending   = status === 'pending' || status === 'pending_a2' || status === 'pending_a3';
  const isCompleted = status === 'completed';
  const isRejected  = status === 'rejected';
  const isCancelled = status === 'cancelled';

  return `<div class="hist-actions" style="display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:nowrap">
    <button type="button" class="btn-sm hist-act-btn" data-hist-action="detail"
      data-memo="${no}" title="ดูรายละเอียด" style="padding:3px 8px;font-size:11px">
      View
    </button>
    ${isDraft ? `
      <button type="button" class="btn-sm hist-act-btn" data-hist-action="draft-edit"
        data-memo="${no}" title="แก้ไข Draft" style="color:var(--blue);padding:3px 7px;font-size:11px">✎</button>
      <button type="button" class="btn-sm hist-act-btn" data-hist-action="draft-delete"
        data-memo="${no}" title="ลบ Draft" style="color:var(--red);padding:3px 7px;font-size:11px">✕</button>
    ` : ''}
    ${isRejected ? `
      <button type="button" class="btn-sm hist-act-btn" data-hist-action="reedit-rejected"
        data-memo="${no}" title="Re-edit as New Draft" style="color:var(--blue);padding:3px 7px;font-size:11px">✎</button>
    ` : ''}
  </div>`;
}

function handleHistoryTableClick(e) {
  const btn = e.target.closest('[data-hist-action]');
  if (btn) {
    e.stopPropagation();
    const action = btn.dataset.histAction;
    const memoNo = btn.dataset.memo;
    if (action === 'detail') openHistoryDetail(memoNo);
    // pdf action removed — PDF download is now inside detail modal
    else if (action === 'reject-reason') showRejectionReason(memoNo, e);
    else if (action === 'draft-edit') {
      if (typeof editDraft === 'function') editDraft(memoNo);
    }
    else if (action === 'draft-delete') {
      if (typeof deleteDraft === 'function') deleteDraft(memoNo);
    }
    else if (action === 'reedit-rejected') reeditRejectedMemo(memoNo);
    else if (action === 'duplicate') duplicateMemo(memoNo);
    return;
  }
  const row = e.target.closest('tr[data-memo]');
  if (row) openHistoryDetail(row.dataset.memo);
}

// ── Render table ──
if (typeof window._histVisible === 'undefined') window._histVisible = 20;

function renderHistoryMemos() {
  // Part 8 (UX consistency pass) — Type/Project are multi-select filters.
  // initMultiSelect() is idempotent, and must run before
  // populateHistFilterOptions() populates hist-project's options.
  initMultiSelect('hist-type', 'ทุกประเภท', 'Type');
  initMultiSelect('hist-project', 'ทั้งหมด', 'Project');
  populateHistFilterOptions();
  populateHistTabCounts();
  const body = document.getElementById('history-body');
  const countEl = document.getElementById('hist-result-count');
  if (!body) return;

  const allMemos = filteredHistoryMemos();
  window._histAllMemos = allMemos;
  const memos = allMemos.slice(0, window._histVisible);
  if (countEl) countEl.textContent = `แสดง ${memos.length} จาก ${allMemos.length} รายการ · คลิกแถวเพื่อดูรายละเอียด`;

  if (!memos.length) {
    body.innerHTML = `<tr><td colspan="9" class="hist-empty">ยังไม่มี Memo ตามเงื่อนไขที่เลือก</td></tr>`;
    return;
  }

  body.innerHTML = memos.map(memo => {
    return `
    <tr class="hist-row" data-memo="${esc(memo.memoNo)}" title="คลิกเพื่อดูรายละเอียด">
      <td class="mono hist-memo-no" style="padding-left:16px">${esc(memo.memoNo)}</td>
      <td><span class="badge ${badgeClass(memo.type)}">${esc(String(memo.type || '').toUpperCase())}</span></td>
      <td class="hist-cell-clip" title="${esc(memo.project || '')}">${esc(memo.project || '—')}</td>
      <td class="hist-cell-clip" title="${esc(histRequesterName(memo))}">${esc(histRequesterName(memo))}</td>
      <td class="mono hist-amt">${esc(money(memo.total || 0))}</td>
      <td><span class="badge ${histStatusBadgeClass(memo)}">${esc(histStatusLabel(memo))}</span></td>
      <td class="hist-dt">${esc(shortDate(histActivityAt(memo)))}</td>
      <td class="hist-cell-clip" style="text-align:center" onclick="event.stopPropagation()">${buildBudgetTagCell(memo)}</td>
      <td style="text-align:center" onclick="event.stopPropagation()">${histActionButtons(memo)}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('.hist-act-btn').forEach(btn => {
    btn.addEventListener('click', handleHistoryTableClick);
  });
  body.querySelectorAll('tr[data-memo]').forEach(row => {
    row.addEventListener('click', handleHistoryTableClick);
  });

  // Load More button
  const lmEl = document.getElementById('history-load-more');
  if (lmEl) {
    const rem = (window._histAllMemos||[]).length - (window._histVisible||20);
    lmEl.style.display = rem > 0 ? '' : 'none';
    const lmBtn = lmEl.querySelector('button');
    if (lmBtn) lmBtn.textContent = `Load ${Math.min(rem,20)} more (เหลือ ${rem} รายการ)`;
  }
}

// ── Draft actions (drafts live in All Memos now) ──
function editDraft(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo || memo.status !== 'draft') return;
  try { localStorage.setItem('orbit-pmo-edit-draft', JSON.stringify(memo)); } catch(e) {}
  swView('create', document.querySelector('.sb-sub-item[onclick*="create"]'), 'Create Memo');
  setTimeout(() => { if (typeof applyDraftEdit === 'function') applyDraftEdit(); }, 100);
}
// Milestone 1B — true soft delete: the draft is flagged, not removed. Once
// flagged, loadMemos()/loadMemosAsync() (app.js) exclude it from every normal
// view (Pending/History/Budget/License/Device/Dashboard) automatically.
async function deleteDraft(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo || memo.status !== 'draft') return; // only Draft is user-deletable
  if (!confirm(`ลบ Draft "${memoNo}" ออกจากระบบ?`)) return;

  const now = new Date().toISOString();
  const user = currentUser();
  const memos = loadMemos();
  appendAuditLog(memos, memoNo, `Deleted Draft by ${user}`, '', {
    statusBefore: 'draft',
    statusAfter: 'draft',
  });
  storeMemos(memos);
  const updatedAuditLog = memos.find(m => m.memoNo === memoNo)?.auditLog || [];

  await updateMemoStatusAsync(memoNo, 'draft', {
    deleted: true,
    deletedAt: now,
    deletedBy: user,
    auditLog: updatedAuditLog,
  });
}

// Appends an audit entry to the ORIGINAL memo when it is duplicated into a new draft
// (MEMO_LIFECYCLE.md §17 lists Duplicate as a required audit action). Local-only persistence,
// matching the existing precedent for non-status-changing memo edits (saveBudgetTag()).
function _auditMemoDuplicated(memoNo, action) {
  if (typeof appendAuditLog !== 'function' || typeof loadMemos !== 'function') return;
  const memos = loadMemos();
  const memo = memos.find(m => m.memoNo === memoNo);
  if (!memo) return;
  appendAuditLog(memos, memoNo, action, '', {
    statusBefore: memo.status,
    statusAfter: memo.status,
  });
  storeMemos(memos);
  if (typeof checkSupa === 'function') {
    const updatedAuditLog = memos.find(m => m.memoNo === memoNo)?.auditLog || [];
    checkSupa().then(async ok => {
      if (!ok) return;
      try {
        await supaFetch('memos', 'PATCH', { audit_log: updatedAuditLog }, '?memo_no=eq.' + encodeURIComponent(memoNo));
      } catch(e) { console.warn('Duplicate audit Supabase sync failed:', e.message); }
    });
  }
}

function duplicateMemo(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;
  if (!confirm(`Duplicate "${memoNo}" เป็น Draft ใหม่?`)) return;
  try {
    localStorage.setItem('orbit-pmo-edit-draft', JSON.stringify(draftFromMemo(memo)));
  } catch(e) {}
  _auditMemoDuplicated(memoNo, `Duplicated by ${currentUser()}`);
  swView('create', document.querySelector('.sb-sub-item[onclick*="create"]'), 'Create Memo');
  setTimeout(() => { if (typeof applyDraftEdit === 'function') applyDraftEdit(); }, 100);
}

function reeditRejectedMemo(memoNo) {
  const memo = loadMemos().find(m => m.memoNo === memoNo);
  if (!memo || memo.status !== 'rejected') return;
  if (!confirm(`เปิด Memo "${memoNo}" เพื่อ Re-edit เป็น Draft ใหม่?\nMemo ที่ถูก Reject จะยังคงอยู่ใน History`)) return;
  try {
    localStorage.setItem('orbit-pmo-edit-draft', JSON.stringify(draftFromMemo(memo, memoNo)));
  } catch(e) { return; }
  _auditMemoDuplicated(memoNo, `Re-edited (Rejected) by ${currentUser()}`);
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
function getMemoActualSpend(memoNo) {
  if (typeof loadActualSpendRecords !== 'function') return null;
  return loadActualSpendRecords().find(record => record.memoId === memoNo) || null;
}

function getEffectiveBudgetSource(memo) {
  const actualSpend = getMemoActualSpend(memo.memoNo);
  const effectivePoolId = actualSpend?.finalBudgetPoolId || memo.finalBudgetPoolId || memo.budgetPoolId;
  // If PMO directly picked a pool, show pool name (project / pool name)
  if (effectivePoolId) {
    const pools = typeof loadBudgetPools === 'function' ? loadBudgetPools() : [];
    const pool  = pools.find(p => p.id === effectivePoolId);
    if (pool) return { source: pool.project + ' / ' + pool.name, isAuto: !actualSpend?.manualBudgetPoolId, poolId: pool.id };
    // Pool was deleted — fall back to budgetSource
  }
  if (memo.budgetSource) return { source: memo.budgetSource, isAuto: false };
  return { source: memo.project || '(ไม่ระบุ)', isAuto: true };
}

function buildBudgetTagCell(memo) {
  // Only completed memos can be tagged
  if(memo.status !== 'completed') {
    return '<span style="color:var(--text-3);font-size:11px">—</span>';
  }
  // Only PMO can tag
  if(typeof isPMO === 'function' && !isPMO()) {
    // Show read-only badge
    const { source } = getEffectiveBudgetSource(memo);
    return `<span style="font-size:10px;padding:2px 7px;background:var(--green-50);color:var(--green-800);border-radius:4px;white-space:nowrap">${esc(source)}</span>`;
  }
  const { source, isAuto } = getEffectiveBudgetSource(memo);
  const actualSpend = getMemoActualSpend(memo.memoNo);
  const budgetStatus = actualSpend?.budgetStatus || memo.budgetStatus || 'Unbudgeted';
  const isCompany = source === 'Company-Wide';
  const statusText = `<span style="opacity:.65"> · ${esc(budgetStatus)}</span>`;

  if(isAuto) {
    return `<span style="font-size:10px;padding:2px 7px;background:var(--green-50);color:var(--green-800);border-radius:4px;cursor:pointer;white-space:nowrap" onclick="openBudgetTagModal('${esc(memo.memoNo)}')" title="Auto จาก project — คลิกเพื่อ override">${esc(source)}${statusText}</span>`;
  }
  return `<span style="font-size:10px;padding:2px 7px;background:${isCompany?'var(--blue-50)':'var(--green-50)'};color:${isCompany?'var(--blue-800)':'var(--green-800)'};border:0.5px solid ${isCompany?'#B5D4F4':'#C0DD97'};border-radius:4px;cursor:pointer;white-space:nowrap" onclick="openBudgetTagModal('${esc(memo.memoNo)}')" title="คลิกเพื่อเปลี่ยน">⚑ ${esc(source)}${statusText}</span>`;
}

// ── Budget Source Tag ──
function buildBudgetSourceBadge(memo) {
  if(!memo.budgetSource) return '<span style="font-size:11px;background:var(--amber-50);color:var(--amber-800);padding:2px 8px;border-radius:4px;cursor:pointer" onclick="openBudgetTagModal(\''+esc(memo.memoNo)+'\')">⚑ ยังไม่ได้ Tag</span>';
  const isCompany = memo.budgetSource === 'Company-Wide';
  return `<span style="font-size:11px;background:${isCompany?'var(--blue-50)':'var(--green-50)'};color:${isCompany?'var(--blue-800)':'var(--green-800)'};padding:2px 8px;border-radius:4px;cursor:pointer" onclick="openBudgetTagModal('${esc(memo.memoNo)}')">${esc(memo.budgetSource)}</span>`;
}

function openBudgetTagModal(memoNo) {
  const memo = getHistoryMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;
  if (typeof isPMO === 'function' && !isPMO()) {
    alert('Tag Budget สำหรับ PMO เท่านั้น');
    return;
  }
  if (memo.status !== 'completed') {
    alert('Tag Budget ได้เฉพาะ Memo ที่อนุมัติแล้วเท่านั้น');
    return;
  }

  const modal = document.getElementById('budget-tag-modal');
  if (!modal) return;

  // ── Load pools ──
  // Phase 7A-9A Step 7: this selector's own year filter/options must use canonical Budget Pool
  // records (createBudgetPoolRecord() derives year from normalized startMonth) — not the raw
  // loadBudgetPools() result — or a legacy corrupted pool (e.g. year:"3112") would be selectable
  // here, and the year filter/pool period display would disagree with Budget Settings/BvA/Export.
  const allPools   = typeof loadBudgetPools === 'function'
    ? loadBudgetPools().map(pool => typeof createBudgetPoolRecord === 'function' ? createBudgetPoolRecord(pool) : pool)
    : [];
  const allMemos   = typeof loadMemos === 'function' ? loadMemos().filter(m => m.status === 'completed') : [];

  // Phase 7A-9C (TD-7A-02): read the canonical Actual Spend mapping result for each memo instead
  // of recomputing a match — the removed legacy pool-matching helper had its own narrowest-pool
  // tie-break that disagreed with the canonical findMatchingBudgetPools()/mapBudgetPool() (app.js)
  // on ambiguous multi-match handling. Ambiguous matches now correctly show as no auto-match here
  // too (Needs PMO Review), the same as everywhere else in the app, instead of silently guessing.
  const actualSpendByMemo = new Map(
    (typeof loadActualSpendRecords === 'function' ? loadActualSpendRecords() : [])
      .filter(record => record.memoId)
      .map(record => [record.memoId, record])
  );
  function effectivePoolId(m) {
    const record = actualSpendByMemo.get(m.memoNo);
    return record && typeof getFinalBudgetPoolId === 'function' ? getFinalBudgetPoolId(record) : null;
  }

  // Current year (BE) for default filter
  const currentYear = getCurrentBuddhistYear();
  const yearKey     = 'btm-year-filter-' + memoNo;

  function getFilterYear() {
    return document.getElementById('btm-year-filter')?.value || currentYear;
  }

  function buildPoolOptions() {
    const yearFilter = getFilterYear();
    const filtered   = allPools.filter(p => !p.year || p.year === yearFilter);

    // Compute budget used per pool
    function poolUsed(pool) {
      return allMemos
        .filter(m => effectivePoolId(m) === pool.id)
        .reduce((s, m) => s + (Number(m.total) || 0), 0);
    }

    const currentPoolId = memo.budgetPoolId || effectivePoolId(memo);

    const optContainer = document.getElementById('btm-options');
    if (!optContainer) return;

    // Group by project
    const byProject = {};
    filtered.forEach(p => {
      if (!byProject[p.project]) byProject[p.project] = [];
      byProject[p.project].push(p);
    });

    const typeLabel = { sl:'SL', hw:'HW', int:'INT', ent:'ENT', dep:'DEP' };

    let html = '';

    // Auto option — reset to auto-match
    const isAuto = !memo.budgetPoolId;
    html += `<label style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border:0.5px solid var(--border);border-radius:var(--r);margin-bottom:6px;cursor:pointer;${isAuto?'background:var(--bg-2);border-color:var(--blue-800)':''}">
      <input type="radio" name="bsrc-opt" value="__auto__" ${isAuto?'checked':''} style="margin-top:3px">
      <div>
        <div style="font-size:12px;font-weight:500">Auto-match</div>
        <div style="font-size:11px;color:var(--text-3)">ให้ระบบ match Pool อัตโนมัติ (ล้าง tag ที่ตั้งไว้)</div>
      </div>
    </label>`;

    if (!filtered.length) {
      html += `<div style="font-size:12px;color:var(--text-3);padding:8px 0">ยังไม่มี Pool ในปี ${getFilterYear()} — กรุณาสร้าง Pool ใน Budget Settings ก่อน</div>`;
    } else {
      Object.entries(byProject).sort(([a],[b])=>a.localeCompare(b)).forEach(([proj, pools]) => {
        html += `<div style="font-size:10px;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin:10px 0 4px">${esc(proj)}</div>`;
        pools.forEach(pool => {
          const used       = poolUsed(pool);
          const remaining  = pool.budget - used;
          const pct        = pool.budget > 0 ? Math.round(used / pool.budget * 100) : 0;
          const isOver     = remaining < 0;
          const isSelected = pool.id === currentPoolId && !!memo.budgetPoolId;
          const types      = (pool.memoTypes || []).map(t => typeLabel[t] || t).join(', ') || 'ทุกประเภท';
          const remainColor = isOver ? 'var(--red-800)' : 'var(--green-800)';

          html += `<label style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;border:0.5px solid var(--border);border-radius:var(--r);margin-bottom:6px;cursor:pointer;${isSelected?'background:var(--blue-50);border-color:var(--blue)':''}">
            <input type="radio" name="bsrc-opt" value="${esc(pool.id)}" ${isSelected?'checked':''} style="margin-top:3px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;justify-content:space-between;align-items:baseline">
                <span style="font-size:12px;font-weight:500">${esc(pool.name)}</span>
                <span style="font-size:11px;font-weight:500;color:${remainColor}">${isOver?'เกิน ':'เหลือ '}${esc(money(Math.abs(remaining)))}</span>
              </div>
              <div style="display:flex;gap:10px;margin-top:2px">
                <span style="font-size:11px;color:var(--text-3)">${esc(types)}</span>
                <span style="font-size:11px;color:var(--text-3)">${esc(formatMonthBE(pool.startMonth))}${pool.endMonth&&pool.endMonth!==pool.startMonth?' → '+esc(formatMonthBE(pool.endMonth)):''}</span>
                <span style="font-size:11px;color:var(--text-3)">ใช้ไป ${pct}%</span>
                ${isOver ? '<span style="font-size:10px;background:#FCEBEB;color:#791F1F;padding:1px 5px;border-radius:3px">เกิน budget</span>' : ''}
              </div>
            </div>
          </label>`;
        });
      });
    }

    optContainer.innerHTML = html;
  }

  // ── Build modal header ──
  const autoMatchPoolId = (actualSpendByMemo.get(memo.memoNo) || {}).autoBudgetPoolId || null;
  const autoMatch = autoMatchPoolId ? allPools.find(p => p.id === autoMatchPoolId) : null;
  const { source: curSource, isAuto } = getEffectiveBudgetSource(memo);

  document.getElementById('btm-memo-no').textContent = memo.memoNo;
  document.getElementById('btm-memo-detail').textContent = `${memo.project} · ${memo.type?.toUpperCase()} · ${typeof money === 'function' ? money(memo.total||0) : memo.total}`;

  const noteEl = document.getElementById('btm-auto-note');
  if (noteEl) {
    if (memo.budgetPoolId) {
      noteEl.textContent = `PMO tag ไว้แล้ว: "${curSource}" — เลือกใหม่เพื่อเปลี่ยน`;
      noteEl.style.color = 'var(--amber-800)';
    } else if (autoMatch) {
      noteEl.textContent = `Auto-match: "${autoMatch.project} / ${autoMatch.name}" — เปลี่ยนได้ถ้าต้องการ`;
      noteEl.style.color = 'var(--text-3)';
    } else {
      noteEl.textContent = `ยังไม่มี Pool ที่ match — เลือก Pool ด้านล่าง`;
      noteEl.style.color = 'var(--amber-800)';
    }
  }

  // ── Year filter ──
  const yearSet = [...new Set(allPools.map(p => p.year).filter(Boolean))].sort().reverse();
  const yearFilterEl = document.getElementById('btm-year-filter');
  if (yearFilterEl) {
    yearFilterEl.innerHTML = yearSet.map(y => `<option value="${esc(y)}" ${y===currentYear?'selected':''}>${esc(y)}</option>`).join('');
    yearFilterEl.onchange = buildPoolOptions;
  }

  buildPoolOptions();
  document.getElementById('btm-save-btn').onclick = () => saveBudgetTag(memoNo);
  modal.style.display = 'flex';
}

function closeBudgetTagModal() {
  const modal = document.getElementById('budget-tag-modal');
  if (modal) modal.style.display = 'none';
}

function saveBudgetTag(memoNo) {
  const memo = getHistoryMemos().find(m => m.memoNo === memoNo);
  if (!memo) return;
  if (memo.status !== 'completed') {
    alert('Tag Budget ได้เฉพาะ Memo ที่อนุมัติแล้วเท่านั้น');
    closeBudgetTagModal();
    return;
  }
  const selected = document.querySelector('input[name="bsrc-opt"]:checked')?.value;
  if (!selected) { alert('กรุณาเลือก Budget Pool'); return; }

  let newPoolId    = null;
  let newSource    = null;

  if (selected === '__auto__') {
    // Reset to auto — clear both fields
    newPoolId = null;
    newSource = null;
  } else {
    // PMO picked a specific pool
    const pools = typeof loadBudgetPools === 'function' ? loadBudgetPools() : [];
    const pool  = pools.find(p => p.id === selected);
    if (!pool) { alert('ไม่พบ Pool ที่เลือก'); return; }
    // Cross-year Manual Override is not allowed for Tag Budget either (Phase 7A-3): the same
    // rule that blocks a Manual Actual Spend override applies here, and it must not silently
    // save — block before writing anything, with a clear error. Compare against the pool's
    // CANONICAL derived year, not its raw stored year (loadBudgetPools() is unnormalized).
    const canonicalPool = typeof createBudgetPoolRecord === 'function' ? createBudgetPoolRecord(pool) : pool;
    // Manual Override must match both project and year (Phase 7A-3). A cross-project pool
    // otherwise "saves" but never appears in BvA (grouped by project/pool scope) — block before
    // writing anything, same as the cross-year guard below.
    if (canonicalPool.project && memo.project && canonicalPool.project !== memo.project) {
      alert(`Budget Pool ที่เลือกอยู่คนละ Project กับ Memo นี้ (Pool: ${canonicalPool.project}, Memo: ${memo.project})\nไม่สามารถ Tag Budget ข้าม Project ได้ กรุณาเลือก Budget Pool ของ Project เดียวกับ Memo`);
      return;
    }
    const existingRecord = typeof loadActualSpendRecords === 'function'
      ? loadActualSpendRecords().find(r => r.memoId === memoNo) : null;
    let mappingDate = existingRecord && typeof actualSpendMappingDate === 'function'
      ? actualSpendMappingDate(existingRecord) : null;
    if (!mappingDate) {
      // No canonical Actual Spend record yet (e.g. canonical storage hasn't been refreshed in
      // this session) — derive the memo's own coverage date directly, mirroring
      // actualSpendFromMemo()'s exact fallback chain, so the cross-year check is never silently
      // skipped just because canonical storage happens to be stale or missing.
      const coverage = typeof memoCoveragePeriod === 'function' ? memoCoveragePeriod(memo) : { startDate: null };
      const fallbackDate = memo.approvedAt || memo.updatedAt || memo.createdAt || null;
      mappingDate = coverage.startDate || (fallbackDate ? String(fallbackDate).slice(0, 10) : null);
    }
    const memoYear = mappingDate && typeof gregorianYearToBuddhistEra === 'function'
      ? gregorianYearToBuddhistEra(mappingDate) : '';
    if (memoYear && String(canonicalPool.year || '') !== memoYear) {
      alert(`Budget Pool ที่เลือกอยู่คนละปีกับ Memo นี้ (Pool ปี ${canonicalPool.year || '-'}, Memo ปี ${memoYear})\nไม่สามารถ Tag Budget ข้ามปีได้ กรุณาเลือก Budget Pool ปีเดียวกับ Memo`);
      return;
    }
    newPoolId = pool.id;
    newSource = pool.project; // derive budgetSource from pool's project
  }

  // ── Write to localStorage directly ──
  const memos = loadMemos();
  const idx   = memos.findIndex(m => m.memoNo === memoNo);
  if (idx < 0) { closeBudgetTagModal(); return; }
  // Milestone 2 Task 2.4 — capture the previous tag before it is overwritten.
  const previousPoolId = memos[idx].budgetPoolId || null;
  const previousLabel  = typeof getEffectiveBudgetSource === 'function'
    ? getEffectiveBudgetSource(memos[idx]).source
    : (memos[idx].budgetSource || '(ไม่ระบุ)');
  const canonicalPools = typeof loadBudgetPoolRecords === 'function' ? loadBudgetPoolRecords() : [];
  let actualSpend = typeof updateActualSpendBudgetOverride === 'function'
    ? updateActualSpendBudgetOverride(memoNo, newPoolId, canonicalPools)
    : null;
  if (!actualSpend && typeof syncMemoToActualSpend === 'function') {
    actualSpend = syncMemoToActualSpend({
      ...memos[idx],
      manualBudgetPoolId: newPoolId,
      budgetPoolId: newPoolId,
    }, canonicalPools);
  }
  memos[idx] = {
    ...memos[idx],
    budgetPoolId: newPoolId,
    manualBudgetPoolId: actualSpend?.manualBudgetPoolId || null,
    autoBudgetPoolId: actualSpend?.autoBudgetPoolId || null,
    finalBudgetPoolId: actualSpend?.finalBudgetPoolId || null,
    budgetStatus: actualSpend?.budgetStatus || 'Unbudgeted',
    budgetSource: newSource,
    updatedAt: new Date().toISOString(),
  };
  // Milestone 2 Task 2.4 — Budget tag audit log entry: previous tag, new tag,
  // actor and timestamp are captured by the shared appendAuditLog() helper.
  // Business logic above (pool selection, cross-year/project guards) is unchanged.
  if (typeof appendAuditLog === 'function') {
    const newLabel = getEffectiveBudgetSource(memos[idx]).source;
    appendAuditLog(memos, memoNo, 'Budget tag changed', `"${previousLabel}" → "${newLabel}"`, {
      previousBudgetPoolId: previousPoolId,
      newBudgetPoolId: newPoolId,
    });
  }
  storeMemos(memos);

  // ── Write to Supabase directly ──
  if (typeof checkSupa === 'function') {
    checkSupa().then(async ok => {
      if (!ok) return;
      try {
        await supaFetch('memos', 'PATCH',
          { budget_source: newSource, updated_at: new Date().toISOString() },
          '?memo_no=eq.' + encodeURIComponent(memoNo)
        );
        // budget_pool_id patch — once column exists in Supabase remove the try/catch wrapper
        try {
          await supaFetch('memos', 'PATCH',
            { budget_pool_id: newPoolId, updated_at: new Date().toISOString() },
            '?memo_no=eq.' + encodeURIComponent(memoNo)
          );
        } catch(e) { /* column not yet in DB — ok */ }
      } catch(e) { console.warn('Budget tag Supabase sync failed:', e.message); }
    });
  }

  closeBudgetTagModal();
  if (typeof renderHistoryMemos === 'function') renderHistoryMemos();
  if (typeof renderBudget === 'function') renderBudget();
}

// ── History Load More ──
function loadMoreHistory() {
  window._histVisible = (window._histVisible || 20) + 20;
  renderHistoryMemos();
}
function resetHistoryPagination() {
  window._histVisible = 20;
}
