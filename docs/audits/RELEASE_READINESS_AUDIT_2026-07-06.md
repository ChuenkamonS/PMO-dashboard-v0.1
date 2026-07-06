# Release Readiness / Handoff Audit — 2026-07-06

Scope: documentation + technical-debt + migration + risk audit for handoff. No code changed as
part of this audit. Findings are based on `docs/MASTER_SPEC.md`, `docs/SYSTEM_OVERVIEW.md`,
`docs/MEMO_LIFECYCLE.md`, `docs/SYSTEM_STATE_MACHINE.md`, `docs/CODING_GUIDELINE.md`,
`docs/PROJECT_STATUS.md`, `docs/TECHNICAL_DEBT.md`, `docs/CHANGELOG.md`, every file under
`supabase/migrations/`, a full `node --test tests/*.test.js` run (536/536 passing at audit time),
and targeted code/git-history checks where the docs disagreed with each other.

---

## 1. Current Readiness Status

**Functionally ready for UAT / internal testing. Not ready for Production handoff.**

- Memo, Approval, Budget & Spend, License Management, Device Management, and the PDF Business
  Document are all functionally complete per `PROJECT_STATUS.md`'s own checklist and confirmed by
  `CHANGELOG.md` entries through 2026-07-06. (`PROJECT_STATUS.md` itself is stale on this point —
  see §6.)
- Automated regression suite is healthy: 536/536 tests passing, matches the count the last
  CHANGELOG entry claims — no drift between docs and code state.
- Production blockers are almost entirely **infrastructure/process**, not missing features: 5
  Supabase migrations not confirmed applied to the live project, no committed baseline schema for
  6 core tables, one financial-integrity edge case tied to the migration gap, and a documentation
  split (two different `CHANGELOG.md` files) that actively risks losing project history at handoff.

---

## 2. Release Blockers

Real functional/data-integrity risks only (per the audit brief's own criteria — no UI polish).

### B1. Five Supabase migrations not confirmed applied to the live project
`docs/TECHNICAL_DEBT.md` (TD-M1-03, TD-M1-04, TD-M2-01, TD-M2-03, TD-M3B-01) all state "no live DB
access available" at the time each was written, with no later entry confirming application. Until
applied, Void, Draft soft-delete, memo detail restore fields, currency/audit metadata, and the
Device/PO/Manual-Expense audit trail all silently fall back to local-only persistence — they work
in the browser session but do not survive a real reload once Supabase is the source of truth. See
§5 for the full list and per-migration risk.

### B2. Void can silently resurrect a memo's Actual Spend on reload (TD-AUDIT-03)
Direct consequence of B1. `voidMemoAsync()` does not set `throwOnSyncError: true` (unlike
`confirmApprove()`). If the Void PATCH is rejected because the migration isn't applied yet, the
memo shows Voided locally, but Supabase keeps `status: 'completed'`. The next real
`loadMemosAsync()` refetch brings the old status back and `reconcileActualSpendSources()`
recreates the same Actual Spend record — a Voided memo's spend can reappear in Overview / Actual
Spend / Budget vs Actual / Forecast with no error shown. This is a genuine "wrong calculation /
data resurrection" risk, not just a cosmetic gap.

### B3. No database-level uniqueness on `memos.memo_no` (TD-M1-01)
Enforcement today is a client-side pre-check only (`views/create.js`) — a race between two
near-simultaneous submissions could create two memos with the same number. Also newly documented:
the check explicitly does **not** block reusing a Rejected memo's number, which appears to
contradict MEMO_LIFECYCLE.md §5's flat "duplicate memo number is not allowed" with no stated
exception. Needs a PMO/BA ruling either way before handoff.

### B4. No committed baseline schema for 6 core tables (TD-M1-01, TD-7A-06)
`memos`, `user_profiles`, `devices`, `purchase_orders`, `budget_pools`, `infra_costs` have no
`create table` migration anywhere in `supabase/migrations/` — every migration in the repo is an
`alter table` delta against schema that exists only in the live Supabase project. If the Supabase
project itself isn't handed over cleanly (or needs to be rebuilt), the schema cannot be
reconstructed from source control alone. This is the audit brief's own "impossible handoff"
category.

### B5. Two divergent, actively-written `CHANGELOG.md` files
Not a runtime bug, but a real handoff-blocking documentation-integrity issue, confirmed by diff:

- `/CHANGELOG.md` (root) contains Milestone 1A/1B/2/3A/3B, Phase 7A-9D/9E/11, and License Phase
  2B/2C ("Assignment Excel/CSV Import", a `licenseKey()` dedup bug fix) — **none of these appear in
  `/docs/CHANGELOG.md`.**
- `/docs/CHANGELOG.md` contains the detailed Phase 7A-1 through 7A-10 history, the 2026-07-05
  Functional Audit, the PDF Business Document Milestone, and License Phase 1/2D/2E + every UX
  hotfix — **none of these appear in the root file.**
- Three of the most recent commits (`4d400ba` reconciliation deep-link navigation, `672ef65`
  Software multi-select filter, `4dc06dd` summary reporting filters/sticky columns — all
  2026-07-06) have **no changelog entry in either file**, despite `CODING_GUIDELINE.md`'s explicit
  rule to update `CHANGELOG.md` after every change.

Whoever picks up this project will read one of these two files (most likely `docs/CHANGELOG.md`,
since that's what every other doc and this audit brief point to) and get a materially incomplete
project history. See §6 for the proposed fix.

---

## 3. Should-Fix-Before-Handoff

Open technical debt / doc gaps that are not launch-blocking today but will cost the incoming team
real time or produce visible number mismatches if left unresolved:

- **TD-AUDIT-01** — Forecast tab's embedded "Budget vs Actual" widget is a third, independent
  calculation engine (re-walks memos + legacy `loadSLBudgets()`) that can disagree with the real
  Budget vs Actual tab for the same project/period. Needs a PMO/BA decision on which engine wins.
- **TD-7A-09** — Overview vs Budget vs Actual reconcile only when the month range is exactly a
  calendar year and every project has ≥1 Actual Spend record; otherwise the two views can show
  different Budget/Actual totals for "the same" scope. Should get explicit PMO sign-off that this
  is accepted, since it's a customer-facing number mismatch, not a subtle internal detail.
- **TD-AUDIT-05** — the Void-block check for irreversible downstream device records reads a
  synchronous, possibly-stale in-memory device cache. Narrow timing window, but if hit, PMO could
  void a Hardware memo that already has real Device Registry records.
- **TD-AUDIT-06** — Settings/master-data changes (Projects, default Approver/Reviewer, routing)
  write zero audit entries, directly contradicting `SYSTEM_OVERVIEW.md` §8's own requirement list.
- **TD-M3A-01 / TD-PHASE2B-01** — License manual override edits and Assignment Import both lack an
  audit trail / actor attribution. Same class of gap, should be designed together per
  TD-PHASE2B-01's own recommendation.
- **TD-7A-08** — Budget Pool delete: app enforces a hard block, but the committed FK for
  `budget_manual_expenses.budget_pool_id` is `on delete set null`. Unreachable through the app
  today, but a direct/out-of-band Supabase delete would silently orphan records. Needs resolving
  alongside B4's schema audit.
- **TD-PDF-01** — the external PDF server's real print fidelity has never been verified against a
  live download; `style.css` at repo root is confirmed dead/orphaned and should be deleted or
  explicitly retired.
- **Documentation currency** (see §6 in full): `PROJECT_STATUS.md` is ~2 days stale (misses the
  entire License Phase 1–2E body of work, the Functional Audit, and PDF Milestone completion), and
  `TEST_MATRIX.md` has no License or Device sections despite these being the two most heavily
  regression-tested modules in the repo today.

---

## 4. Deferred (Accepted, No Action Needed Before Handoff)

These are explicitly and reasonably deferred in the existing docs; listed here only for
completeness of the audit, not as action items:

- **TD-7A-05** — Budget Pool audit fields (`createdAt`/`createdBy`/etc.) synthesized, not
  persisted. Long-standing, low priority.
- **TD-7A-07** — Project dropdown data-source fragmentation across ~12 dropdowns. Explicitly
  paused pending a future Project Master module (design review already completed and preserved).
- **TD-AUDIT-02** — Forecast can merge two same-named line items within one memo into one row.
  Display/labeling decision, not a calculation error.
- **TD-AUDIT-04** — License Review Queue "Reject" has no manual re-assignment UI. New feature,
  correctly scoped out of a "no new features" audit.
- **TD-LIC-USR-01** — Manage Licenses manual-add has no free-text option; correctly gated behind a
  future Software Master to avoid fragmenting the software vocabulary.
- **TD-PHASE2B-01** (Excel support half) — Assignment Import is CSV-only; `.xlsx` deferred by
  explicit instruction, CSV-from-Excel is a viable workaround.
- Settings module ownership, Resource Management merge, UI/UX visual polish, and
  Authentication/Authorization remain Tech-Team/future-phase scope per `PROJECT_STATUS.md` and
  `SYSTEM_OVERVIEW.md` §9 — unchanged, no new findings here.

---

## 5. Migration Checklist

| Migration | Tables/Columns Affected | Manual Apply Needed? | Risk If Not Applied |
|---|---|---|---|
| `20260629123554_phase1_memo_workflow.sql` | `user_profiles` (+3 cols), `memos` (+4 cols, backfill) | Presumed applied — no open TD flags it; later phases build on it without complaint | N/A if already applied; verify during handoff regardless |
| `20260629161656_historical_budget_expenses.sql` | Creates `budget_manual_expenses` + RLS policies | Presumed applied — Manual Entries feature is live against real data per changelog | N/A if already applied |
| `20260630095215_device_fields_storage_status.sql` | `devices` (+5 cols), creates `device-photos` storage bucket + policies | Presumed applied — device photo upload is a working feature per changelog | N/A if already applied |
| `20260630101500_tighten_device_photo_policies.sql` | Drops 2 storage policies | Presumed applied alongside the above | N/A if already applied |
| `20260701090000_add_manual_expense_vendor_program.sql` | `budget_manual_expenses.vendor_program` | Presumed applied — referenced as an established fallback precedent by later TD entries | N/A if already applied |
| **`20260703140000_memo_void_and_soft_delete.sql`** | `memos` +8 cols (`voided_*`, `deleted*`) | **Not confirmed applied (TD-M1-03)** | Void / Draft soft-delete succeed locally only; ties directly into **B2** (Actual Spend resurrection) |
| **`20260703150000_memo_detail_restore.sql`** | `memos` +6 cols (`hw_items`, `acct_cols`, etc.) | **Not confirmed applied (TD-M1-04)** | Save Draft / Submit for every memo type persists locally only, not to Supabase |
| **`20260703160000_milestone2_financial_foundation.sql`** | `memos`, `devices`, `purchase_orders`, `budget_pools` (currency/audit cols) | **Not confirmed applied (TD-M2-01)** | Currency + Created/Updated By metadata locally only |
| **`20260703170000_manual_expense_audit_log.sql`** | `budget_manual_expenses.audit_log` | **Not confirmed applied (TD-M2-03)** | Has a column-missing fallback — other fields still persist; only the audit trail itself is local-only |
| **`20260703180000_device_registry_m3b.sql`** | `devices` (+4 cols incl. soft delete), `purchase_orders.audit_log` | **Not confirmed applied (TD-M3B-01)** | `audit_log` has a fallback; the soft-delete columns do **not** — a Device delete's PATCH fails outright until applied |

**Separately from "applied or not":** per B4, there is no committed baseline `create table`
migration for `memos`, `user_profiles`, `devices`, `purchase_orders`, `budget_pools`, or
`infra_costs` anywhere in this repo — a schema dump/introspection against the live project should
be captured and committed regardless of the apply status above, so the environment is reproducible
from source control.

**Recommended action:** confirm current live-project column state for the 5 unconfirmed
migrations (a single `information_schema.columns` query per table settles this) before UAT even
starts — if they're already applied, TD-M1-03/M1-04/M2-01/M2-03/M3B-01 just need their status
updated to CLOSED; if not, apply them before any Void/Delete/Detail-Restore testing is trusted.

---

## 6. Documentation Update Recommendations

Per the audit brief's instruction, these are **proposed**, not yet applied.

1. **Reconcile the two `CHANGELOG.md` files (highest priority).** Recommend `docs/CHANGELOG.md` as
   the single canonical file (it's what `CODING_GUIDELINE.md`'s neighboring docs and this audit
   brief already treat as authoritative). Proposed approach: merge the root file's unique sections
   (Milestone 1A/1B/2/3A/3B, Phase 7A-9D/9E/11, License Phase 2B/2C) into `docs/CHANGELOG.md` in
   correct chronological order, then either delete the root `CHANGELOG.md` or turn it into a
   pointer stub ("see `docs/CHANGELOG.md`") so no future commit can update the wrong one by
   accident. This is a large, content-sensitive merge — I did not do it inline; confirm the
   direction before I execute it.
2. **Add changelog entries for the 3 currently-undocumented 2026-07-06 commits** (reconciliation
   deep-link navigation, Software multi-select filter, summary reporting filters/sticky columns) —
   small addition, do once the canonical-file question above is settled.
3. **Refresh `PROJECT_STATUS.md`** (currently dated 2026-07-04): move PDF Business Document from
   "Current Focus" to "Completed" (Approval Info/Timeline/Status Banner/Void+Override info are all
   shipped per the PDF Milestone changelog entry; only TD-PDF-01's verification/cleanup items
   remain open), add the full License Phase 1 (Inventory↔Assignment Alignment, Reconciliation,
   Assignment Import) through Phase 2E body of work to "Completed," and reflect the 2026-07-05
   Functional Audit + Final UX Consistency Pass outcomes (TD-AUDIT-01 through 09) in the gap
   tracking section.
4. **Update `TEST_MATRIX.md`** to add License Management and Device Management sections to the
   Feature Regression Matrix — both are now core modules with substantial dedicated test files
   (`tests/license.test.js`, `tests/device.test.js`) but have no documented required-coverage
   checklist, unlike Budget Pool/BvA/Actual Spend/Forecast/Memo/History/Settings/Import/Export.
5. **Minor: `SYSTEM_OVERVIEW.md` §3.5 License Management** could name "Reconciliation"
   (Purchased/Assigned/Remaining seats) and "Assignment Import" (CSV bulk-assign) as their own
   sub-areas — they exist today as real, separate features and aren't literally called out, though
   the current wording isn't wrong, just incomplete. Low priority.
6. **`MASTER_SPEC.md`** — no update needed. Recent License changes (Phase 1–2E) did not alter any
   Budget/Spend/Actual-Spend/Forecast business rule this document owns.

---

## 7. Next Recommended Action

1. **Resolve the migration-apply question (B1/§5) first** — a single schema check against the live
   Supabase project settles whether B1–B2 are still live risks or already-closed TD items.
2. **Decide the CHANGELOG.md canonical-file question (B5)** and give the go-ahead to execute the
   merge described in §6.1.
3. **Refresh `PROJECT_STATUS.md` and `TEST_MATRIX.md`** (§6.3–6.4) so the handoff starting point is
   accurate.
4. **Run a PMO/BA sign-off pass over every OPEN item in `docs/TECHNICAL_DEBT.md`**, per that
   document's own "Before Release Checklist" — each must end up CLOSED or explicitly accepted; §3
   above is the shortlist of ones most worth that conversation before Tech Team handoff.
