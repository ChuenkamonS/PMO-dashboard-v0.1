# Full-System Requirement Gap Audit

A structural comparison of the current PMO Dashboard implementation against its own governing rulebook — every module, one shared prioritized matrix, no code changed.

## Metadata

- Modules audited: Create Memo, Pending, All Memo, Budget & Spend, License, Device, Settings, Shared/PDF, Tests
- Authoritative docs: 3
- Findings: 22 deduplicated

## Scope
Only SYSTEM_OVERVIEW.md , MEMO_LIFECYCLE.md , and SYSTEM_STATE_MACHINE.md contain actual rules. All seven files under docs/spec/*.md (one per module) are empty discovery templates — section headers only, no content. Anything not addressed by the three real docs is marked as an Open Question below, never invented.

## Summary

- Critical: 3
- High: 5
- Medium: 9
- Low: 5

## Critical lifecycle & data-integrity fixes

These break the memo lifecycle's core promises — an entire documented terminal state doesn't exist, deletes don't actually delete, currency validation contradicts the currency requirement, and a PMO control gate is bypassed entirely.

### G-01 — Void is entirely unimplemented — the whole Approved → Voided branch of the state machine does not exist
- Severity/Priority: Critical | Must Fix
- **Requirement:** MEMO_LIFECYCLE §3.6, §11, §12 · SYSTEM_STATE_MACHINE §2, §6, §10 — PMO-only Void on Approved memos, blocked if irreversible downstream impact exists, excluded from Actual Spend, inactivates related licenses, stays visible/auditable/duplicable.
- **Current behavior:** No 'voided' status value exists anywhere — not in memoToDb / dbToMemo , not in any status-label map, not in Actual Spend filtering. Zero Void UI on any memo screen. The only "void" in the whole codebase is an unrelated manual-expense feature in Budget & Spend.
- **Expected behavior:** PMO can void an Approved memo with reason/evidence, blocked by the exact warning text in MEMO_LIFECYCLE §12 when Device Registry records already exist; voided memo excluded from spend, license lines inactivated, still visible and duplicable.
- **Business impact:** A wrongly-approved memo can never be corrected — it permanently pollutes Actual Spend, license counts, and device/PO pipelines with no recovery path.
- **Files / functions:** app.js: memoToDb / dbToMemo / updateMemoStatusAsync — views/history.js, views/pending.js — views/budget.js (spend calc) — views/license.js: parseLicenseFromMemo — views/device.js (needs downstream-impact guard)
- **Suggested fix:** Add void_reason / voided_by / voided_at / evidence columns and a guarded 'voided' transition that queries Device Management before allowing; wire exclusion into spend calc and license filtering; add the action + badge in All Memo.
- **Test coverage needed:** Void allowed with no downstream records; void blocked with arrived devices + exact warning text; voided memo excluded from spend but still visible/duplicable.

### G-02 — Draft "delete" is not soft delete — it's an ephemeral local filter that can silently reverse itself
- Severity/Priority: Critical | Must Fix
- **Requirement:** SYSTEM_OVERVIEW §2, §6 · MEMO_LIFECYCLE §15 · SYSTEM_STATE_MACHINE §3, §12 — only Draft is user-deletable, and it must be soft delete: deleted flag/by/date/reason, hidden from UI, retained in DB.
- **Current behavior:** deleteDraft() (history.js:869) filters the in-memory/localStorage array only — zero Supabase write. The next loadMemosAsync() re-fetch brings the "deleted" draft straight back. Separately, deleteDeviceAsync / deleteLicenseAsync / deletePoolAsync issue genuine hard DELETE s with no trace at all.
- **Expected behavior:** A PATCH setting deleted/deleted_by/deleted_at/delete_reason; deleted rows filtered out of normal views but retained in the DB for audit — for memos, devices, licenses, and budget pools alike.
- **Business impact:** Deletes are both accidentally reversible (row reappears on reload) and completely untraceable — the single delete path the docs explicitly allow doesn't actually satisfy "no submitted record physically deleted."
- **Files / functions:** views/history.js:869 deleteDraft — app.js: memoToDb/dbToMemo/loadMemosAsync/storeMemos — views/device.js:118 — views/license.js:82 — views/budget.js:2388
- **Suggested fix:** The codebase already has a correct reference implementation — voidManualExpenseAsync (budget.js:155) with voided_at/voided_by/void_reason. Extend that exact pattern to memos, devices, licenses, and pools.
- **Test coverage needed:** Delete a draft, force a re-fetch from Supabase, confirm it stays absent from the UI while the row (with deleted metadata) still exists.

### G-03 — Currency validation actively rejects USD — this isn't "conversion not finished," it's active non-support
- Severity/Priority: High | Must Fix
- **Requirement:** SYSTEM_OVERVIEW §3.4 · MEMO_LIFECYCLE §14 · SYSTEM_STATE_MACHINE §14 — must support THB and USD, stored explicitly at record/line-item level. FX conversion math is explicitly allowed to remain unfinished — outright rejection is not.
- **Current behavior:** validateActualSpendRecord (app.js:178) and validateBudgetPoolRecord (app.js:272) both hard-reject any currency !== 'THB' . No currency field or selector exists anywhere in Create Memo, Budget & Spend, or bulk import. money() (app.js:1549) hardcodes a ฿ prefix unconditionally. budget_manual_expenses has no currency column at all.
- **Expected behavior:** THB and USD both accepted, selectable, and stored explicitly — conversion display can stay a known open item.
- **Business impact:** Every layer — validation, UI, schema, formatting — independently assumes THB-only; USD memos/expenses cannot exist in this system today, full stop.
- **Files / functions:** app.js:178, 272, 146, 251, 956, 1549 — views/create.js (all calc* totals) — views/budget.js (Pool / Manual Expense modals) — supabase/migrations (new column)
- **Suggested fix:** Loosen validation to accept ['THB','USD']; add a currency selector to Create Memo and Budget & Spend forms; make money()/PDF/license display currency-aware instead of a hardcoded symbol.
- **Test coverage needed:** A USD record round-trips through validation and storage without silent coercion to THB; a USD memo displays the correct symbol in UI and PDF.

### G-07 — The Approved-memo PDF doesn't actually prove approval
- Severity/Priority: High | Must Fix
- **Requirement:** MEMO_LIFECYCLE §9.2 — the "official approved version" PDF must show approval status, approval log, approver name, timestamp, and method; when no digital signature exists, the log + timestamp are the proof.
- **Current behavior:** renderMemoPdf (app.js:1705) is one template used for every status, with no branch on data.status . It shows approver name/title always, and only conditionally shows a signature image when a step happens to be 'approved' — no status label, no approval log, no method text. A Pending PDF and an Approved PDF are visually near-identical.
- **Expected behavior:** When status is Approved, render an explicit status marker plus a chronological approval log (actor, action, timestamp, in-system vs. PMO-override) — the primary proof of approval absent a signature.
- **Business impact:** The one document meant to be self-contained external proof of approval (used for email/print approval chains) cannot actually serve that purpose.
- **Files / functions:** app.js:1705–2006 renderMemoPdf · app.js:2069 downloadMemoPdf
- **Suggested fix:** Add a status-conditional block rendering auditLog/approvers as a log table when status is Approved, plus a visible status banner (not a watermark, per §9.1).
- **Test coverage needed:** Render with a completed memo containing auditLog entries; assert the output contains the approval-log block and status marker.

### G-10 — License account-list PMO Review Queue doesn't exist — user mapping is auto-merged with no gate
- Severity/Priority: Critical | Must Fix
- **Requirement:** SYSTEM_OVERVIEW §4.2 · SYSTEM_STATE_MACHINE §7 — an approved memo's account list must enter a PMO Review Queue (Approve All / Reject All), shown above the main table in License Management > User, before it reaches User License Mapping.
- **Current behavior:** _renderLicUsers (license.js:594) merges every approved SL memo's account table straight into the live user-mapping table. No "queue," "pending," or "PMO review" concept exists anywhere in the file.
- **Expected behavior:** New account-list entries land in a review queue first; only PMO-approved rows reach the live mapping table; rejected rows fall to manual assignment later.
- **Business impact:** Unvetted user-to-license assignments publish immediately, bypassing the one explicit PMO governance gate this feature was designed around.
- **Files / functions:** views/license.js:594 _renderLicUsers · :154 parseAccountTableFromMemo
- **Suggested fix:** Persist a pending/approved flag per account-list entry; gate the merge into the main table on that flag; add an Approve All / Reject All queue UI above the table.
- **Test coverage needed:** A new SL memo's account list appears in the queue, not the main table, until PMO approves it.

## Downstream module consistency fixes

The core lifecycle mostly works; these are the places where one module's data doesn't reliably reach another's — missing metadata, missing master lists, and missing audit categories that the docs name explicitly.

### G-04 — Six documented audit-log categories are never written anywhere
- Severity/Priority: High | Should Fix
- **Requirement:** SYSTEM_OVERVIEW §8 · MEMO_LIFECYCLE §17 — audit log required for Delete Draft, Duplicate, Budget tag change, License user assignment, Device status changes, and Master data changes; Override must be non-silent with structured previous/new values.
- **Current behavior:** None of these six categories append any audit entry anywhere (confirmed by grep across history.js, license.js, device.js, settings.js). PMO Override (pending.js:684) logs a free-text string but not structured statusBefore/statusAfter/step fields the way Reject already does. The approver-edit modal (pending.js:827) takes only a text reason, no evidence — unlike the Override modal.
- **Expected behavior:** Every listed action appends {action, actor, timestamp, previous, new, reason, evidence} to the relevant record.
- **Business impact:** The most repeated design principle in the docs — "every important transition must be traceable" — is unmet for over half of the named action categories.
- **Files / functions:** views/history.js (deleteDraft, duplicateMemo, saveBudgetTag) · views/license.js (_toggleLicUserOverride, _saveLicUserEditor) · views/device.js (saveDevice, markArrived) · views/settings.js (saveUserFromModal, deactivateUser, saveAuthorityLimits) · views/pending.js:684, 827
- **Suggested fix:** One shared logAudit(entityType, entityId, action, actor, prev, next, reason, evidence) helper in app.js, called from all nine sites; extend Override's audit call with statusBefore/statusAfter/step.
- **Test coverage needed:** One assertion per action category confirming an audit entry appears with the correct shape.

### G-05 — No timestamp anywhere is explicitly pinned to Asia/Bangkok
- Severity/Priority: Medium–High | Should Fix
- **Requirement:** SYSTEM_OVERVIEW §7 · MEMO_LIFECYCLE §16 · SYSTEM_STATE_MACHINE §13 — every business-facing timestamp must display in Asia/Bangkok, independent of the viewer's browser/server timezone.
- **Current behavior:** Every date helper found — formatDateTime (pending.js:64), thaiDate / shortDate (app.js:1542/1550), formatActualSpendDateTime (budget.js:1964), the History CSV export (history.js:728) — uses local Date getters or toLocaleString with no timeZone option. None pins Bangkok explicitly.
- **Expected behavior:** All business timestamps render in Asia/Bangkok regardless of client/server timezone.
- **Business impact:** Dates/times can silently be wrong by hours for any non-Bangkok machine, with the worst exposure on exact timestamps (e.g. budget's date-time formatter) rather than date-only fields.
- **Files / functions:** app.js:1542, 1550 · views/pending.js:64, 291 · views/history.js:728–749 · views/budget.js:1964–1971 · views/license.js · views/device.js
- **Suggested fix:** One shared formatBangkokDateTime() helper using Intl.DateTimeFormat(..., {timeZone:'Asia/Bangkok'}) ; replace every ad hoc call across every view.
- **Test coverage needed:** Format a known UTC timestamp near a Bangkok day boundary under a non-Bangkok test-runner TZ and assert the correct Bangkok output.

### G-06 — "Created By / Updated By" metadata is missing everywhere except budget manual expenses
- Severity/Priority: Medium | Should Fix
- **Requirement:** SYSTEM_OVERVIEW §5 — Created By/Date, Updated By/Date required for Memo, Device records, PO records, License records, User License Mapping, and Master Data records.
- **Current behavior:** memoToDb / dbToMemo and the device/PO/license mapping functions track created_at / updated_at only — never a generic created_by / updated_by actor (action-specific fields like approvedBy don't cover ordinary edits). budget_manual_expenses is the one entity that gets this right today.
- **Expected behavior:** created_by/updated_by populated from the acting user on every write, for every listed entity.
- **Business impact:** Cannot answer "who created/last touched this record" for the majority of the system's data outside of specific status transitions.
- **Files / functions:** app.js:1194–1284, 1319–1364, 1628–1651 · views/device.js (deviceToDb/poToDb) · views/license.js (licenseToDb) · views/settings.js (saveUserFromModal, deactivateUser)
- **Suggested fix:** Reuse the budget_manual_expenses pattern as the template; add columns; stamp the active user on every create/update path.
- **Test coverage needed:** created_by preserved across edits, updated_by changes on each save, per entity type.

### G-08 — Software master list + PMO approval gate does not exist
- Severity/Priority: High | Should Fix
- **Requirement:** SYSTEM_OVERVIEW §3.7 · SYSTEM_STATE_MACHINE §11 — hybrid entry: suggest from master list → allow free text → PMO must approve before a new free-text name becomes master data.
- **Current behavior:** Create Memo's software field is fully free text, with typeahead sourced only from prior memos' own line items (create.js:161–172) — not a curated master list. Settings has zero software-related code anywhere. No approval queue exists.
- **Expected behavior:** A Settings-managed software master list; Create Memo suggests from it; new free-text names await PMO approval before joining; License Management's filters consume the approved list.
- **Business impact:** Software naming drifts unchecked ("Figma" vs "figma" vs "Figma Inc"), degrading every downstream report that groups by software name.
- **Files / functions:** views/settings.js (new section) · views/create.js:161–197 · views/license.js (filter dropdowns)
- **Suggested fix:** Add a software_master table + Settings CRUD + pending-approval queue (mirror the License review-queue pattern once G-10 lands); switch Create Memo's typeahead source.
- **Test coverage needed:** A new free-text software name isn't queryable as master data until PMO approves it.

### G-11 — No base schema is reproducible from migrations, and memo-number uniqueness isn't enforced at the database layer
- Severity/Priority: Medium | Should Fix
- **Requirement:** MEMO_LIFECYCLE §5 ("Memo Number must be unique") plus the general reproducibility expectation implied by the docs' emphasis on auditability.
- **Current behavior:** No migration in the repo contains CREATE TABLE for memos, user_profiles, devices, or purchase_orders — only ALTER-style deltas exist; base tables were created outside version control. No UNIQUE constraint on memo_no is confirmable; the only enforcement is a client-side pre-check in submitMemo() , a race-condition risk under concurrent submits.
- **Expected behavior:** A committed baseline migration for every base table, including a UNIQUE constraint on memos.memo_no.
- **Business impact:** Environment can't be rebuilt from source control alone; two near-simultaneous submissions with the same memo number could both succeed.
- **Files / functions:** supabase/migrations/ (missing baseline) · views/create.js submitMemo() (client-only check)
- **Suggested fix:** Generate a baseline migration via schema introspection; add the UNIQUE constraint explicitly.
- **Test coverage needed:** Concurrent-submission test asserting the second of two simultaneous same-number submits fails at the DB layer, not just client-side.

### S-07 — License line items aren't persisted records — they're recomputed from memo data on every render
- Severity/Priority: Medium | Should Fix
- **Requirement:** SYSTEM_OVERVIEW §5 (metadata for "License records") · SYSTEM_STATE_MACHINE §7 (License Line Items as a pipeline stage implies a persisted stage).
- **Current behavior:** Memo-derived license rows are never written to the licenses table — parseLicenseFromMemo (license.js:91) rebuilds them from memo.slItems every render, with a synthetic id. Only manual/"Other" licenses are real rows.
- **Expected behavior:** Either materialize license line items as real rows on memo approval (recommended — also unblocks G-01's license-inactivation-on-void requirement and G-06's metadata requirement), or explicitly scope the metadata rule to manual records only.
- **Business impact:** There's no row to attach created_by/updated_by to for the majority of license data, and no natural place to flip a "voided/inactive" flag per G-01.
- **Files / functions:** views/license.js:91–129 parseLicenseFromMemo · :178 getAllLicenses
- **Suggested fix:** This is a design decision, not a small patch — decide with PMO whether to materialize on approval, then implement once.
- **Test coverage needed:** Pending the architecture decision.

## UX, validation & audit polish

Smaller, self-contained fixes and the test-coverage debt that mirrors exactly where the implementation is weakest.

### G-09 — Device Type is hardcoded, not managed as master data
- Severity/Priority: Medium | Should Fix
- **Requirement:** SYSTEM_OVERVIEW §3.7 · SYSTEM_STATE_MACHINE §11 — "Device type should be managed as master data."
- **Current behavior:** Device type options are hardcoded <option> values in index.html and a TYPE_LABEL constant (device.js:333); Settings has zero device-related code.
- **Expected behavior:** A Settings-managed list, consumed by Device Management's dropdowns/labels.
- **Business impact:** PMO can't manage device types without a code change, and type values can drift across records with no controlled vocabulary.
- **Files / functions:** index.html (hardcoded options) · views/device.js:333 TYPE_LABEL · views/settings.js (missing)
- **Suggested fix:** Add a Device Type list to Settings using the same pattern as the existing Project/Team list; point device.js at it.
- **Test coverage needed:** Adding a device type in Settings makes it selectable in Device Management's Add/Edit modal.

### G-12 — Approval-step statuses never use Bypassed or Overridden — both collapse into other values
- Severity/Priority: Medium | Should Fix
- **Requirement:** MEMO_LIFECYCLE §7 · SYSTEM_STATE_MACHINE §5 — step status should be one of Pending/Approved/Rejected/Bypassed/Overridden.
- **Current behavior:** Approver-step objects only ever get 'approved'/'pending'/'rejected'. A self-bypassed A1 is recorded as 'approved' + selfReviewed:true rather than 'bypassed'; a PMO-overridden step is set back to 'pending' rather than 'overridden'.
- **Expected behavior:** Distinct 'bypassed'/'overridden' values so reporting can tell a genuine approval apart from a bypass or override without parsing audit-log text.
- **Business impact:** Reports/UI can't distinguish real approvals from bypassed or overridden ones by status alone.
- **Files / functions:** app.js:1110–1155 prepareMemoForSubmission · app.js:1396–1442 updateMemoStatusAsync · views/pending.js:684–739
- **Suggested fix:** Introduce the two literal status values at the identified call sites.
- **Test coverage needed:** Assert approver-array status values after a self-bypass submission and after a single-step PMO override.

### G-13 — Hardware PO creation scrapes rendered HTML instead of reading structured data
- Severity/Priority: Medium | Should Fix
- **Requirement:** Indirect — consistency with License Management's structured slItems approach, and general robustness for a downstream-impact trigger.
- **Current behavior:** createPurchaseOrdersFromMemo (device.js:227) DOMParser-scrapes an HTML table inside memo.sections matching a specific Thai title — any change to Create Memo's table markup silently breaks PO creation. A structured hwItems -style array already exists in places but isn't what PO creation actually reads.
- **Expected behavior:** PO creation reads a structured array, mirroring slItems for License.
- **Business impact:** A cosmetic edit to the memo PDF/table layout could silently stop Purchase Orders from being created for Hardware memos.
- **Files / functions:** views/device.js:227–271 · views/create.js (hardware row collection) · app.js:2054
- **Suggested fix:** Persist a structured hwItems array on hardware memos (same shape as slItems) and switch PO creation to read it instead of parsing HTML.
- **Test coverage needed:** PO creation still works after the hardware memo's table markup is reordered or relabeled.

### G-14 — Test coverage mirrors the implementation's weak spots almost exactly
- Severity/Priority: High | Should Fix
- **Requirement:** Indirect — the docs' own emphasis on the state machine, memo-number uniqueness, delete policy, PDF handling, and currency implies these need regression protection.
- **Current behavior:** workflow.test.js (12 tests) covers self-bypass and sequential approval well, but has zero tests for PMO override transitions, Void, uniqueness rejection, Draft soft-delete, or PDF content. The 257 combined tests in the two financial test files assert THB-as-default only, never a full USD round-trip.
- **Expected behavior:** Tests for override/void transitions, uniqueness rejection, soft-delete, PDF approval-log content, and USD storage fidelity, added alongside each corresponding fix above.
- **Business impact:** The riskiest, most audit-sensitive transitions (Override, Void) have zero automated regression protection today.
- **Files / functions:** tests/workflow.test.js · tests/financial-models.test.js · tests/budget-expenses.test.js
- **Suggested fix:** Test-with-fix: add coverage in the same change as each of G-01, G-02, G-03, G-07, and G-11.
- **Test coverage needed:** This entry is the coverage gap.

### S-02 — PMO Override's target-status list isn't constrained by the memo's actual current stage
- Severity/Priority: Medium | Should Fix
- **Requirement:** SYSTEM_STATE_MACHINE §2 — Pending → Override → Approved/Rejected only, from valid current states.
- **Current behavior:** openPmoOverrideModal (pending.js:573) hardcodes the same four status options regardless of whether the memo is at A1, A2, or A3 stage — nothing stops selecting a backward transition like pending_a3 → pending.
- **Expected behavior:** Override options constrained to valid forward transitions from the memo's current status.
- **Business impact:** Risk of a PMO operator accidentally rewinding a further-along memo, guarded only by human judgment, not the system.
- **Files / functions:** views/pending.js:573–647 openPmoOverrideModal
- **Suggested fix:** Build the option list dynamically from memo.status.
- **Test coverage needed:** Override options exclude invalid backward transitions for a memo at pending_a3.

### S-05 — The code's "completed" status and the docs' "Approved" status are never explicitly linked
- Severity/Priority: Low | Should Fix
- **Requirement:** SYSTEM_STATE_MACHINE §1 — exists specifically "to prevent each tab from interpreting memo status differently."
- **Current behavior:** Every module independently treats the literal string 'completed' as meaning Approved, with no comment or constant documenting the equivalence.
- **Expected behavior:** A code comment or named constant bridging the two vocabularies.
- **Business impact:** Onboarding/cross-team confusion risk; not a runtime defect today.
- **Files / functions:** all status === 'completed' sites in app.js · views/history.js:8 memoStatusKey
- **Suggested fix:** Add MEMO_STATUS.APPROVED = 'completed' or an equivalent comment at the vocabulary's point of definition.
- **Test coverage needed:** None — documentation-only fix.

### S-09 — Embedded audit-log entries don't self-identify entity type/ID
- Severity/Priority: Low | Should Fix
- **Requirement:** SYSTEM_STATE_MACHINE §15 — audit entries should include entity type and entity ID alongside action/actor/timestamp.
- **Current behavior:** Audit entries live inside each memo's own auditLog array with no explicit entityType/entityId field — the parent record implies it, but nothing self-describes it.
- **Expected behavior:** Each entry carries entityType/entityId, mattering most if a cross-entity audit view is ever built.
- **Business impact:** Minor today; would matter if audit logs are ever centralized/exported across entities.
- **Files / functions:** app.js:1132–1148 prepareMemoForSubmission · views/pending.js:48 appendAuditLog
- **Suggested fix:** Add entityType:'memo', entityId: memoNo to entries at creation, only if a centralized audit view is planned.
- **Test coverage needed:** Defer until a centralized view exists.

## Deferred — auth-adjacent & low-urgency items

Genuinely low priority today, several explicitly blocked on authentication work the docs already say is out of scope for now.

### S-03 — Editing approvers on a live Pending memo has no evidence requirement — unclear if it should be Override-equivalent
- Severity/Priority: Medium | Defer
- **Requirement:** Not explicitly covered by any of the three docs — noted for the behavioral detail only.
- **Current behavior:** confirmPmoEditApprovers (pending.js:827) swaps approver identities on a live Pending memo with only a free-text reason — no evidence upload, unlike the Override modal which requires both.
- **Expected behavior:** Blocked on classification — see Open Questions.
- **Business impact:** If this is procedurally equivalent to an override, it currently skips the "override requires evidence" principle.
- **Files / functions:** views/pending.js:742–871
- **Suggested fix:** Pending PMO clarification on whether this is override-adjacent.
- **Test coverage needed:** N/A until classified.

### S-04 — "Audit" as a distinct allowed action is likely already satisfied by the existing detail-modal timeline
- Severity/Priority: Low | Defer
- **Requirement:** MEMO_LIFECYCLE §4 — Rejected/Cancelled/Voided rows list "Audit" as a distinct PMO-available action.
- **Current behavior:** No separate "Audit" UI exists beyond the detail modal's approval timeline, which functionally covers the same intent.
- **Expected behavior:** Likely no separate fix needed — flagged only for completeness.
- **Business impact:** Minimal.
- **Files / functions:** views/history.js:658 openHistoryDetail · :249 buildApprovalTimeline
- **Suggested fix:** None required beyond G-01 (Void); consider labeling the timeline explicitly as the audit view for terminal memos.
- **Test coverage needed:** N/A

### S-06 — No code marker documents that Budget Pool settings are intended to be PMO-only
- Severity/Priority: Low | Defer
- **Requirement:** SYSTEM_OVERVIEW §3.7 — "only PMO should access that function." Auth enforcement itself is explicitly out of scope (§9).
- **Current behavior:** No role/permission check or comment guards Budget Pool CRUD in budget.js.
- **Expected behavior:** Acceptable for now; a TODO marker would help future auth work.
- **Business impact:** Minimal today; becomes relevant once auth exists, with no code markers to guide it.
- **Files / functions:** views/budget.js (Budget Pool CRUD)
- **Suggested fix:** Add a comment/TODO at each entry point noting intended actor = PMO.
- **Test coverage needed:** None now.

### S-08 — New devices default to an undocumented "not_identified" status instead of "Available"
- Severity/Priority: Low | Defer
- **Requirement:** SYSTEM_STATE_MACHINE §9 — confirmed minimum statuses are Available and In Use; extra statuses are explicitly permitted pending redesign.
- **Current behavior:** The devices table defaults new rows to not_identified , a fifth status not mentioned in any doc.
- **Expected behavior:** Not a strict violation — flagged so PMO can confirm whether it should map to Available for reporting purposes.
- **Business impact:** Minor undercount in Available/In-Use metrics since most freshly-created devices sit outside both doc-recognized states.
- **Files / functions:** views/device.js:335–337 deviceStatusBadge · migration 20260630095215, line 9
- **Suggested fix:** Confirm with PMO whether to alias it into Available for reporting, or keep as an intentional pre-triage state.
- **Test coverage needed:** Pending product decision.

## What already works and should be preserved

- Sequential approval is enforced at two independent layers — UI gating on the current approver, and a backend guard in updateMemoStatusAsync that rejects out-of-order approval actions.
- Cancel correctly restricts to Requester or PMO — checked in logic, not just hidden buttons; Approver cannot cancel, matching the lifecycle table exactly.
- A1 self-bypass routes correctly to A2 when the requester is also the first reviewer, with a matching audit entry — the trickiest edge case in the whole state machine, and it's right, and tested.
- PMO cannot approve or override their own memo — a sensible extra safeguard beyond what the docs strictly require.
- PMO Override requires both reason and evidence , enforced with a blocking check in the override modal.
- Pending PDFs are downloadable with no watermark anywhere in the codebase — correctly supports the external/email approval use case.
- Terminal-state guard blocks further edits to Completed/Rejected/Cancelled memos except through the PMO override path.
- Duplicate never copies the memo number — draftFromMemo explicitly clears it and stores a sourceMemoNo backlink, satisfying the "must not copy Memo Number" rule end to end.
- Memo number is manually entered and freely editable — a plain text field, never system-locked — matching "memo number is not generated by the system."
- Submit performs a live uniqueness check against the database before saving, correctly blocking a duplicate memo number at the point of submission.
- Budget tagging is correctly scoped to PMO and to Approved memos only , and same-project/same-year override constraints are enforced.
- The manual-expense soft-delete/void pattern in Budget & Spend is a genuinely well-built reference implementation — voided_at/voided_by/void_reason, excluded from totals, edits blocked on voided rows. Everything in Batch 1's G-01/G-02 should be modeled on this.
- The Hardware pipeline (PO → partial arrival → Device Registry) is implemented correctly , including the exact "5 requested, 3 arrive, 2 more later" scenario from the docs, and correctly differentiates memo-linked devices from manually-added/bulk-imported ones that don't need a memo reference.
- License Management correctly displays data by software line item , not memo header, with a working expiry-tracking view and a real software × project × seat summary matrix.
- Approver and Reviewer correctly share one person master list with two capability flags , rather than two duplicated lists — exactly the model the docs call for — and the person record includes Name, Position, and Email.
- PMO-only settings are visibly gated in the UI (disabled inputs, "view only" badges) even though real permission enforcement is explicitly out of scope for now.

## Cross-module inconsistencies

- The docs' "Approved" and the code's "completed" are the same thing everywhere, but that equivalence is never written down anywhere in the code (S-05) — exactly the ambiguity SYSTEM_STATE_MACHINE.md says it exists to prevent.
- Status label/badge maps are independently redefined in pending.js, history.js, and budget.js rather than shared — any future status (like Voided) has to be added in three places by hand, and it's easy to miss one.
- License memos carry structured slItems that License Management reads directly; Hardware memos are read by scraping rendered HTML (G-13) — the two most-similar memo types use architecturally different, inconsistent data contracts with downstream modules.
- Delete is implemented three different ways in the same codebase: a correct soft-delete-with-audit pattern for manual budget expenses, silent no-op-on-backend array filtering for memo drafts, and genuine hard deletes with zero trace for devices/licenses/budget pools.
- Currency defaults to 'THB' independently in at least four separate places in app.js and budget.js, with no single shared constant — a future currency change would require hunting down every occurrence rather than editing one source of truth.
- The docs' suggested duplicatedFromMemoId naming and the code's sourceMemoNo differ cosmetically but are functionally equivalent and used consistently — worth noting so nobody "fixes" this by accident.

## Risky areas — fixing one module here can break another


## Open questions — not gaps, not to be guessed at

- Is editing approvers on a live Pending memo (S-03) meant to be Override-equivalent (and therefore require evidence), or a distinct administrative action the docs just haven't named yet?
- Should PMO Override's target-status list be fully constrained to valid current-state transitions (S-02), or is showing all options intentionally flexible for judgment calls the docs don't specify?
- What does "inactivate/exclude related license records if applicable " actually mean for a Voided memo — automatic exclusion, or PMO discretion per case (e.g. already-paid licenses staying active)?
- Is the PMO Review Queue for account lists (G-10) meant to be one queue per memo, or a single merged queue across all pending account lists?
- SYSTEM_OVERVIEW §5 lists "License records" and "Other Subscription records" as separate entities, but the code treats them as the same table filtered by a source flag — is that conflation acceptable, or does Other Subscription need its own structure?
- Where does "License assignment date" (named explicitly in SYSTEM_STATE_MACHINE §13) actually come from? No such field exists in the code today, and its intended source (the account-list date? a per-user timestamp?) isn't specified.
- Is Device Type meant to allow free text the way Software explicitly must (hybrid entry), or should it be a closed list? The docs only mandate hybrid entry for Software.
- The expired status key present in History's label/badge maps has no producer anywhere in the code and appears in none of the three docs — dead code, or a planned future status nobody's built yet?
- FX conversion mechanics (rate source, timing, display currency) are explicitly and intentionally unfinished per SYSTEM_STATE_MACHINE §14 — not a gap, just confirming scope: only currency storage and acceptance (G-03) is in scope now, not conversion math.
- Several real, working Settings features — per-type reason lists, default reviewer/approver, authority limits, signature upload — aren't mentioned in any of the three docs at all. Are these intentional undocumented extensions, or should they be formally specified?
