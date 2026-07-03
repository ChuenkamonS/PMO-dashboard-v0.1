# PMO Dashboard Technical Debt Register

This document tracks intentional temporary workarounds, deferred architecture improvements, and cleanup tasks.

Rules:

- Every temporary mitigation MUST have an Exit Criteria.
- No workaround may become permanent without updating this document.
- Before Release, every OPEN item must be reviewed.

---

# TD-7A-01

Title

Temporary Budget Pool Year Mitigation

Status

OPEN

Priority

High

Introduced

Phase 7A-3

Owner Phase

Budget Pool Normalization

Reason

Current Budget Pool records may contain inconsistent:

- year
- startMonth
- endMonth

This can cause Actual Spend to disappear from Budget vs Actual.

Temporary Mitigation

calculateBudgetVsActualDataset()

temporarily accepts

- pool.year

OR

- derived year from coverage

to prevent silent financial data loss.

Business Rule

Coverage dates are authoritative.

Budget Pool year is display metadata only.

Exit Criteria

Remove the mitigation only after ALL are true:

- Budget Pool year is derived automatically from coverage.
- Budget Pool create/edit derives year.
- Budget Pool import derives year.
- Existing Budget Pools audited or migrated.
- Regression tests prove no mismatched pools remain.

Regression Tests

- Year mismatch tests
- Budget vs Actual totals
- Budget Pool mapping parity

Phase 7A-9A Update

"Budget Pool create/edit derives year" is now also true at the UI layer: the Add/Edit modal's
read-only `bpool-year` field recomputes live from `bpool-start` via `_updateBpoolYearFromStart()`
instead of trusting a possibly-stale stored label or the ambient year filter. The data layer already
satisfied this criterion since Phase 7A-3.

Phase 7A-9A Contract Fix Update

`createBudgetPoolRecord()` now normalizes `startDate`/`startMonth`/`endDate`/`endMonth` to Gregorian
before deriving `year`, and every canonical read path (Budget Settings list/filter/grouping, Edit
modal, Budget vs Actual, CSV export fallback, memo/manual-expense matching) goes through it — so an
existing mismatched or BE-typed-legacy record now self-heals at read time everywhere, not only in
the Edit modal. `savePoolAsync()` (the single write path for manual save and bulk import) also
canonicalizes before persisting, so a fresh save can no longer introduce a new mismatch.
`openBudgetTagModal()` (the Assign Budget Pool selector, `views/history.js`) is now included in this
canonical-read list — its year filter and pool option list can no longer surface a raw corrupted
year (e.g. `3112`) or an un-normalized `startMonth`/`endMonth`.

Still OPEN: Budget Pool import still writes its own `year` column at the UI layer without deriving
it from Start Month before the duplicate-check step (`_confirmPoolImport()`'s inline dedupe still
compares against the caller-supplied `it.yr`, though the value it ultimately persists via
`savePoolAsync()` is now corrected). Existing pools already in storage are not audited/bulk-migrated
(by design — only self-heal on read, or on an explicit re-save). No regression test yet proves zero
mismatched legacy pools remain in real production/Supabase data.

---

# TD-7A-02

Title

Duplicate Budget Pool Matching Logic

Status

CLOSED (Phase 7A-9C)

Priority

Medium

Owner Phase

Tag Budget Canonicalization

Original Situation

Budget matching existed in two implementations.

Canonical

app.js

- findMatchingBudgetPools()
- mapBudgetPool()

Legacy

views/history.js

- matchMemoToPool()

Risk

UI preview may disagree with canonical mapping.

Resolution (Phase 7A-9C)

Tag Budget (`openBudgetTagModal()`, `views/history.js`) no longer recomputes a match at all. It
reads the memo's own canonical Actual Spend record (`loadActualSpendRecords().find(r => r.memoId
=== memo.memoNo)`) and derives the effective/auto-match pool via the existing `getFinalBudgetPoolId()`
(app.js) and the record's `autoBudgetPoolId`. `matchMemoToPool()`, and the already-dead
`autoTagBudgetPool()` / `getPoolMemos()` / `getPoolActual()` (confirmed zero remaining callers by
repo-wide search before removal), were deleted from `views/budget.js`.

This also closes the narrowest-pool-wins vs. `Needs PMO Review` disagreement: Tag Budget now
follows the canonical ambiguous-multi-match result (no auto-match shown) instead of silently
guessing a pool.

Exit Criteria (met)

- [x] Tag Budget modal uses canonical mapping only (reads canonical Actual Spend, never recomputes).
- [x] matchMemoToPool() removed.
- [x] Regression tests pass (`tests/financial-models.test.js`, `tests/budget-expenses.test.js`).

---

# TD-7A-03

Title

Legacy Overview Budget Source

Status

CLOSED (Phase 7A-11) — see residual gap TD-7A-09

Priority

Medium

Owner Phase

Overview Cleanup

Original Situation

Overview BvA still reads

loadSLBudgets()

instead of

Budget Pool.

Risk

Overview Budget totals may differ from Budget vs Actual.

Resolution (Phase 7A-11)

`_ovUpdateKPIs()` and `_ovRenderBvA()` (`views/budget.js`) no longer call `loadSLBudgets()`. Both now
read a new shared helper, `_ovCanonicalDataset()`, which calls the exact same
`calculateBudgetVsActualDataset()` engine the Budget vs Actual tab uses (`_renderBvaWith()`),
scoped to the current BE year. Overview's Budget KPI card and Section B project bars sum
`row.budget` from that dataset's `rows` per active project, instead of an independent
`loadSLBudgets()[year][project]` lookup. `loadSLBudgets()` itself, and its remaining call sites in
the Forecast tab (`_renderBudgetSLInfraWith()`) and Budget Settings, are unchanged and untouched —
out of scope per this phase's explicit "do not change Forecast" instruction (see TD-7A-09).

Exit Criteria (met)

- [x] Overview uses canonical Budget Pool (via the shared dataset engine, not a re-derived query).
- [x] Overview and Budget vs Actual reconcile exactly for the same project + full current year
      (proven by tests in `tests/budget-expenses.test.js`, Phase 7A-11).
- [ ] Full reconciliation for every arbitrary Overview month-range/project-chip combination is a
      separate, larger UI change — see TD-7A-09 (explicitly deferred, not required by this phase's
      "do not redesign Overview UI" instruction).

Regression Tests

- `tests/budget-expenses.test.js`: Budget KPI sourced from Budget Pool with `loadSLBudgets()`
  asserted empty; KPI/Section-B parity with `calculateBudgetVsActualDataset()` for a matching
  project+year; chart/donut/KPI actual-total parity for the unfiltered scope; static scan confirming
  no remaining `loadSLBudgets(` call inside the Overview sub-tab section.

---

# TD-7A-09

Title

Overview Rolling-Window vs Budget vs Actual Calendar-Year Divergence

Status

OPEN (documented, accepted for Phase 7A-11)

Priority

Low

Introduced

Phase 7A-11

Owner Phase

Overview Cleanup (future UI phase)

Reason

Phase 7A-11 replaced Overview's legacy `loadSLBudgets()` Budget source with the canonical Budget
Pool total (TD-7A-03), so Budget now comes from the same engine as Budget vs Actual. Two other,
pre-existing differences between the two views were explicitly out of scope ("do not redesign
Overview UI / do not change layout") and remain:

1. Overview's "Actual" figure (`calculateActualSpendInRange()`) allocates each record's amount
   across its coverage months and sums only the months inside the selected rolling window (e.g. the
   trailing 12 months ending "now"). Budget vs Actual's "Actual" (`calculateActualSpend()` +
   `actualSpendOverlapsYear()`) counts a record's full amount once for any discrete calendar year it
   overlaps. For a record that spans a year boundary, or an Overview window that isn't aligned to a
   full Jan–Dec calendar year (the common case, since "now" is usually mid-year), the two totals can
   differ by a small amount.
2. Overview's Project/Spend Type chips (`_ov.activeProjKeys`/`_ov.activeTypeKeys`) are derived from
   observed canonical Actual Spend records, not from Budget Pool. A project with a Budget Pool but
   zero Actual Spend records never appears as a chip, so its budget is silently excluded from
   Overview's Budget KPI sum — while Budget vs Actual's "All Projects" filter includes it. Verified
   against real browser data during Phase 7A-11 manual testing (see CHANGELOG.md): Overview showed
   Actual ฿250,173,597 / Budget ฿125,354,721 vs Budget vs Actual's Actual ฿250,857,150 / Budget
   ฿125,854,721 for the same nominal "current year, all projects" scope.

Current Situation

Both are real, verified, reproducible differences on production-shaped data. Overview and Budget vs
Actual reconcile exactly only when: Overview's active project chips already cover every project with
a current-year Budget Pool, and Overview's selected month range is exactly Jan–Dec of the current
Gregorian year (a full 12-month, calendar-aligned window) — not just "12 months" in general.

Risk

A PMO user comparing Overview's KPI card to the Budget vs Actual tab side-by-side for "the same
project/year" can see numbers that are close but not bit-identical, unless the month range happens
to be calendar-aligned and every relevant project has at least one Actual Spend record.

Exit Criteria

- Decide (separate UI-design phase, not a data-source fix) whether Overview's month-range picker
  should gain a calendar-year-aligned mode, and whether its Project/Type chip universe should include
  Budget-Pool-only projects — both are UI/behavior changes, not calculation-engine changes, so they
  require their own reviewed scope, distinct from TD-7A-03's "duplicate calculation" fix.
- Until then, this gap is accepted; it must not be quietly re-introduced as a "calculation bug" fix
  attempt without addressing the chip-derivation and rolling-window design questions above.

---

# TD-7A-04

Title

Budget Pool Bulk Import Validation

Status

CLOSED (Phase 7A-9C)

Priority

Medium

Owner Phase

Budget Pool Validation

Original Situation

Bulk import bypassed `validateBudgetPoolChange()`, used a case-sensitive, single-row-only duplicate
check, had no overlap-conflict detection, allowed partial-success imports, and silently coerced a
negative budget positive by stripping the minus sign during parsing.

Risk

Duplicate pools
Invalid pools
Inconsistent validation

Resolution (Phase 7A-9C)

New `validateBudgetPoolImportBatch()` (app.js) reuses `validateBudgetPoolChange()` row-by-row
against a context that grows with every row already accepted earlier in the same batch — so
duplicates are caught both against existing pools AND within the same file (including two rows
both resolving to the same existing pool). Overlap/shared-Spend-Type conflicts, which are only a
confirmable warning in the manual single-save flow, are escalated to a hard failure for bulk
import. Import is strict all-or-nothing: `handlePoolBulkUpload()` shows an error report and imports
nothing if any row fails; the preview (with New/Update tags) only appears once the entire batch is
valid. The budget parser now preserves a negative sign so the shared `budget > 0` check rejects it,
instead of stripping the sign and silently coercing it positive. `_confirmPoolImport()` now remaps
Actual Spend exactly once after the whole batch commits, not once per imported pool.

Exit Criteria (met)

- [x] Bulk import uses the same validation as manual create/edit.
- [x] Intra-file and vs-existing duplicate detection (case-insensitive, canonical-year-based).
- [x] Overlap/conflict detection.
- [x] Negative budget rejected, not sign-stripped.
- [x] All-or-nothing commit; batch remap runs once.
- [x] Regression tests pass (`tests/financial-models.test.js`, `tests/budget-expenses.test.js`).

---

# TD-7A-05

Title

Budget Pool Audit Fields

Status

OPEN

Priority

Low

Owner Phase

Infrastructure Cleanup

Current Situation

createdAt

updatedAt

createdBy

updatedBy

are synthesized during normalization and are not persisted.

Risk

Audit metadata is unreliable.

Exit Criteria

Audit fields are persisted from storage.

---

# TD-7A-06

Title

Budget Pool Live Schema

Status

OPEN

Priority

Medium

Owner Phase

Supabase Alignment

Current Situation

Repository does not contain the baseline migration for:

- budget_pools
- infra_costs

Risk

Future migrations cannot safely assume production schema.

Exit Criteria

Baseline migration committed.

---

# TD-7A-07

Title

Project Dropdown Data-Source Fragmentation

Status

DEFERRED (Phase 7A-12 design review completed 2026-07-02; implementation paused — see below)

Priority

Low

Introduced

Phase 7A-9A

Owner Phase

Project Dropdown Unification — deferred until the Project Master module exists

Reason

Roughly a dozen "Project" dropdowns across the app split between two different data sources:

- Settings-canonical (`loadSettings().projects`), now available via `getCanonicalProjectList()`
  (`app.js`, Phase 7A-9A).
- Data-derived (observed project values from memos, canonical Actual Spend, Budget Pools, or
  Resources), e.g. Pending's `pend-filter-project`, Actual Spend's `as-project`, BvA's
  `bva-project`, and Resource's `rf-project`/`rtf-project`.

There is also no single refresh path: `refreshProjectDropdowns()` (`views/settings.js`) only covers
6 of the Settings-sourced dropdowns; the data-derived ones re-populate themselves independently on
their own next render.

Current Situation

Phase 7A-9A migrated only `bpool-project` (Budget Pool Settings) onto `getCanonicalProjectList()`.
No other dropdown was changed.

Risk

A project renamed or removed in Settings can disagree with what a data-derived dropdown still shows
(and vice versa) — e.g. a decommissioned project with historical memos stays visible in Pending's
filter but disappears from Create Memo's dropdown.

Exit Criteria

- Decide, per dropdown, whether it should be Settings-canonical or intentionally data-derived (some
  legitimately need to keep surfacing legacy/renamed projects present in historical data).
- Migrate the Settings-canonical dropdowns onto `getCanonicalProjectList()`.
- `refreshProjectDropdowns()` covers every Settings-canonical dropdown id (no silently-uncovered
  ones).

Regression Tests

- Per-dropdown source assertions once each is migrated.
- `refreshProjectDropdowns()` coverage test against the full canonical dropdown id list.

Phase 7A-12 Design Review (2026-07-02) — completed, implementation paused

A design review was performed for a Budget & Spend-scoped fix (a new `getBudgetSpendProjectList()`
union helper over Budget Pools + Approved Memos + Manual Expenses + Infra Costs + canonical Actual
Spend, explicitly excluding `loadSLBudgets()`). No code was written. Decision: **do not implement
this now** — the long-term roadmap calls for a future Master Settings module introducing a real
Project Master (alongside Approvers, Reviewers, Signers, Signature images, Memo Reasons, etc.).
Every Budget & Spend Project dropdown will migrate to that single source once it exists; building a
union-based intermediate source now would only be replaced shortly afterward. This section preserves
the review's findings so the eventual Project Master migration (or a future revisit of this exact
plan) does not have to be re-derived from scratch.

Inventory of every Project dropdown/filter found in Budget & Spend (full detail, file:line, current
source, and DOM ids captured in the Phase 7A-12 conversation transcript — condensed here):

- Overview: chips (`ov-proj-chips`), not a `<select>` — `_ovInitState()` (`views/budget.js:756-759`),
  sourced from Actual Spend only.
- Actual Spend (Report): `as-project` — `renderActualSpend()` (`views/budget.js:2142-2149`), Actual
  Spend only.
- Actual Spend (Manual Entries): `as-manual-project` — `renderManualEntries()`
  (`views/budget.js:1991`), Manual Expenses only.
- Forecast: `sl-forecast-proj` — `_renderForecastTable()` (`views/budget.js:1284-1297`), derived from
  `calculateForecast()` rows (Software+Infra, Complete coverage only — narrower by design).
- Budget vs Actual: `bva-project` — `_renderBvaWith()` (`views/budget.js:2478-2486`), Budget Pools ∪
  Actual Spend (closest to the target union already); populates once per session
  (`options.length <= 1` guard).
- Budget Settings Add/Edit Pool modal: `bpool-project` — `openBudgetPoolModal()`
  (`views/budget.js:3247, 3258`), sourced from `getCanonicalProjectList()` (Settings), migrated there
  in Phase 7A-9A.
- Budget Settings pool list: `bset-search` is a free-text search over already-loaded pools, not a
  project list — nothing to unify.
- Bulk Upload (import/template/export): no dropdown; Project is a data column or inherited from
  `_bvaDataset`/the full pool list.
- Assignment Workspace: no dropdown; operates on `_bvaDataset`, so it inherits whatever `bva-project`
  already produced.
- Tag Budget modal (`views/history.js`, `openBudgetTagModal()`): not a project filter — shows all of
  a memo's candidate pools grouped by `pool.project` for section headers
  (`Object.entries(byProject).sort(...)`); no project list is ever selectively hidden/shown.
- Export dialogs: confirmed none have their own modal project dropdown; every export reads the
  already-rendered tab's filter value or dataset, so fixing the source dropdowns would have fixed
  their exports automatically.

Key conflict surfaced (relevant again if/when this is revisited before Project Master lands, or as
input to Project Master's own design): `bpool-project` is a **creation** input (picking the project
for a brand-new Budget Pool), not a filter, and unlike `f-project` it has no free-text "type your own
project" fallback. Moving it onto a financial-history-derived union (rather than an admin-curated
list) would silently remove the ability to create the *first* Budget Pool for a project with zero
prior financial footprint — a functional regression, not just a display inconsistency. Whatever
eventually replaces `getCanonicalProjectList()`/this dropdown's source must keep supporting
"pick a project that has no financial history yet."

Exit Criteria (superseded)

The exit criteria above (decide per-dropdown Settings-canonical vs. data-derived, migrate, cover via
`refreshProjectDropdowns()`) are superseded by "migrate every Budget & Spend Project dropdown to the
Project Master module once it ships." Do not build the union-based `getBudgetSpendProjectList()`
helper described above as a permanent fix — it was scoped as an intermediate step and is no longer
planned.

---

# TD-7A-08

Title

Budget Pool Delete Semantics Mismatch Between App and Supabase FK

Status

OPEN (documented, not fixed — accepted for Phase 7A-9C)

Priority

Low

Introduced

Phase 7A-9C design review

Owner Phase

Budget Pool Lifecycle / Delete Strategy (future phase)

Reason

The application enforces a hard block on deleting a Budget Pool that has any reference
(`budgetPoolDeletionBlockers()`, app.js) — canonical Actual Spend, manual expense, or memo. The
committed Supabase migration for `budget_manual_expenses`
(`supabase/migrations/20260629161656_historical_budget_expenses.sql`) declares
`budget_pool_id references public.budget_pools(id) on delete set null` — i.e. the database layer is
wired for a cascade/unassign semantic at that one table, while the application layer enforces a
hard block. There is no committed baseline migration for `budget_pools` itself (TD-7A-06), so this
mismatch cannot be resolved without first doing the schema audit TD-7A-06 already calls for.

Current Situation

Unreachable in normal use — the app always blocks deletion before Supabase is ever asked to delete
a referenced pool. Only reachable if a pool is deleted directly via Supabase (bypassing the app),
in which case `budget_manual_expenses.budget_pool_id` would silently go `null` with no
application-level reconciliation triggered.

Risk

A direct/out-of-band Supabase deletion could silently orphan manual expense records with no audit
trail, while the app's own UI never allows the equivalent action.

Explicitly deferred (per approved Phase 7A-9C decision)

No Supabase migration or FK change is made in Phase 7A-9C. Do not change the FK direction (e.g. to
`on delete restrict`) or the app's hard-block behavior without going through TD-7A-06's schema audit
first, and without a separate reviewed decision on Budget Pool Lifecycle/Archive and Delete
Strategy (Active/Archived was also explicitly deferred out of 7A-9C for the same reason — it cannot
durably persist without touching the same `budget_pools` schema).

Exit Criteria

- TD-7A-06 (baseline migration + live schema audit) resolved first.
- Explicit decision made on whether the FK should be tightened to `on delete restrict` (matching the
  app) or the mismatch is a deliberately accepted safety net — either way, documented here.

---

# TD-M1-01

Title

Memo/Device/PO/User Profile Baseline Schema + Memo Number Uniqueness

Status

OPEN

Priority

High

Introduced

Milestone 1A (Implementation Roadmap, Task 1.1)

Owner Phase

Core Lifecycle Foundation

Current Situation

Repository does not contain baseline `create table` migrations for:

- memos
- user_profiles
- devices
- purchase_orders

Every migration under `supabase/migrations/` is an `alter table` delta against these tables — the
base schema was created outside version control (confirmed by grep: no `create table` statement for
any of the four tables exists in any committed migration).

There is also no database-level `unique` constraint on `memos.memo_no` (confirmed: no `unique` or
`memo_no` constraint text anywhere in `supabase/migrations/*.sql`). The only enforcement today is a
client-side pre-check in `submitMemo()` (`views/create.js:707-714`): a `GET` query for an existing
row with the same `memo_no` before saving.

Additional finding from this review, not previously documented: that same pre-check explicitly does
**not** block when the conflicting existing row's status is `'rejected'` —
`if (conflict && conflict.status !== 'rejected' && !editingSameDraft)`. So today, a new memo can
reuse a memo number that belongs to a previously Rejected memo. This may or may not be intentional;
it is flagged here as a review finding only. Per MEMO_LIFECYCLE.md §5, "Duplicate Memo Number is not
allowed" with no stated exception for Rejected memos — this looks like an undocumented behavior gap,
not a requirement. Not fixed as part of this review (business-rule change, out of Milestone 1A scope
per explicit instruction to keep this task a review, not an implementation).

Risk

1. Environment cannot be rebuilt from source control alone (schema reproducibility).
2. Two near-simultaneous submissions with the same memo number could both succeed (race condition —
   client-side check only, no DB-level guard).
3. A new memo can silently reuse a Rejected memo's number today, which may contradict the documented
   uniqueness rule.

Exit Criteria

- A committed baseline migration exists for `memos`, `user_profiles`, `devices`, and
  `purchase_orders`, generated via schema introspection against the live Supabase project (requires
  live DB access this review did not have — not fabricated from assumptions here).
- A `unique` constraint on `memos.memo_no` is added at the database layer once the baseline exists,
  with a graceful client-side error path for the resulting DB-level conflict (currently
  `submitMemo()` only handles its own pre-check failing, not a DB-level unique-violation response).
- PMO/BA decision recorded on whether reusing a Rejected memo's number is intentional or should be
  blocked like every other non-Draft status.

Regression Tests

- Pending baseline migration + constraint (no code changed yet to test).

---

# TD-M1-02

Title

Pending Memo Card Uses a Separate Inline Status Pill, Not the Shared Status Vocabulary

Status

OPEN

Priority

Low

Introduced

Milestone 1A (Implementation Roadmap, Task 1.4)

Owner Phase

Core Lifecycle Foundation

Current Situation

Task 1.4 moved `memoStatusKey()` / `histStatusLabel()` / `histStatusBadgeClass()` from
`views/history.js` into `app.js` as the single canonical memo-status vocabulary (behavior-preserving
relocation only). `views/budget.js` already consumed `memoStatusKey()` as a boolean filter and is
unaffected.

`views/pending.js`'s memo card renderer (around the `statusCls`/`statusLbl` local variables) still
computes its own separate 3-way inline status label/color ternary
(`completed`/`rejected`/else-show-current-stage) instead of calling the now-centralized helpers. This
was deliberately left alone in Task 1.4 for two reasons: (1) it renders inline hex-based pill styles,
not the `badge-*` CSS classes the shared helpers return — merging them is a visual styling change, not
a pure data-source change; (2) its "else" case intentionally shows the dynamic current-approval-stage
label (e.g. which approver is next), which is a different display intent than History's fixed
`Pending A1`/`Pending A2`/`Pending A3` labels — collapsing them could change what Pending users see.

Risk

When a future milestone adds a new memo status (e.g. Voided), it must be added in two independently
maintained places — `app.js`'s shared vocabulary and `views/pending.js`'s inline ternary — with no
compiler/lint check tying them together. Missing the second one would show Voided memos in Pending
with an incorrect fallback style (today's ternary's default `else` branch), though Voided memos should
never actually reach Pending's list per SYSTEM_STATE_MACHINE.md §2, which limits the practical
exposure.

Exit Criteria

- Decide whether Pending's card should adopt the shared `badge-*` class system (a visual change
  requiring design sign-off) or keep its own inline-styled pill permanently, with the inline ternary
  explicitly cross-referencing `histStatusLabel`/`histStatusBadgeClass` in a code comment either way.
- Whichever is decided, implement it before or alongside the Milestone 1 Void feature (Task 1.5 in the
  roadmap), since that is the next milestone to introduce a new memo status value.

Milestone 1B Update

Void shipped in Milestone 1B without touching this pill, and that turned out to be safe: Pending's
card view only ever renders memos whose status is `pending`/`pending_a2`/`pending_a3`
(`isMemoVisibleInPending()`, app.js). A Voided memo can only exist once a memo has already left
Pending (Approved → Voided), so it structurally never reaches this inline ternary. This entry remains
open only for the pre-existing Draft/Approved/Rejected duplication risk described above, not as a
Void-specific blocker.

---

# TD-M1-03

Title

Milestone 1B Deployment Prerequisite + Two Narrow Edge Cases Found During Implementation

Status

OPEN

Priority

Medium

Introduced

Milestone 1B (Void memo-side lifecycle, Draft soft delete)

Owner Phase

Core Lifecycle Foundation

Current Situation

1. **Migration not yet applied.** `supabase/migrations/20260703140000_memo_void_and_soft_delete.sql`
   adds the eight new `memos` columns (`voided_at`, `voided_by`, `void_reason`, `void_evidence_url`,
   `deleted`, `deleted_at`, `deleted_by`, `delete_reason`) that `voidMemoAsync()` and the soft-deleted
   Draft path write via `updateMemoStatusAsync()`'s dynamic Supabase patch. This file has not been
   applied to the live Supabase project (no live DB access available during this milestone, consistent
   with TD-M1-01). Until it is applied, a Void or Draft-delete action's Supabase `PATCH` will fail for
   the new columns; the existing catch-and-continue behavior in `updateMemoStatusAsync()` means the
   action still succeeds locally (in-memory cache + localStorage) but silently does not persist the
   new fields to Supabase, so they would not survive a real reload once Supabase is reachable again.
2. **Local-cache-only edge case for soft delete.** `loadMemos()`/`loadMemosAsync()` (app.js) now filter
   out `deleted: true` records so every view is covered by one change. Several existing functions
   (`confirmReject`, `cancelMemo`, `confirmPmoOverride`, `confirmPmoEditApprovers`) follow a
   `const memos = loadMemos(); ...; storeMemos(memos)` pattern — since `loadMemos()` now returns a
   filtered copy, an unrelated action's `storeMemos()` call can overwrite the local
   cache/`localStorage` backup without the just-soft-deleted draft in it. Supabase itself is
   unaffected (it was already updated by the explicit `voidMemoAsync`/`updateMemoStatusAsync` `PATCH`
   with a `memo_no` filter, not by `storeMemos`), and the next successful `loadMemosAsync()` refetch
   restores the correct filtered view either way. The only exposure is the same one every other
   feature in this app already accepts: local-only persistence in the narrow window where Supabase is
   fully unreachable.
3. ~~**Deleted Drafts still block memo-number reuse.**~~ **RESOLVED** (same-day correction,
   2026-07-03): confirmed business rule is that a soft-deleted Draft is deleted from the user's
   perspective and must not block reuse. `submitMemo()`'s uniqueness check (`views/create.js`) now
   selects `deleted` alongside `memo_no`/`status` and excludes `deleted: true` rows from
   `MEMO_NO_BLOCKING_STATUSES` blocking, regardless of the row's `status`.

Risk

Item 1 is the one that matters operationally: Void/Delete will appear to work in every environment
this milestone was tested in (offline/local fallback), but won't durably persist to Supabase until the
migration is run. Item 2 is a narrow, already-consistent-with-existing-behavior edge case, not a
regression. Item 3 is resolved.

Exit Criteria

- Apply `20260703140000_memo_void_and_soft_delete.sql` to the live Supabase project, then confirm a
  Void and a Draft soft-delete both survive a real `loadMemosAsync()` refetch (not just local cache).
- ~~PMO/BA decision on deleted-Draft memo number reuse~~ — resolved, see item 3 above.

---

# TD-M1-04

Title

Hotfix: Memo Detail Restore — Deployment Prerequisite + One Narrow Pre-Existing Gap Left Untouched

Status

OPEN

Priority

High

Introduced

Hotfix: Memo Detail Restore (2026-07-03), ahead of Milestone 2

Owner Phase

Core Lifecycle Foundation

Current Situation

1. **Migration not yet applied.** `supabase/migrations/20260703150000_memo_detail_restore.sql` adds
   six new `memos` columns (`hw_items`, `hw_owner`, `acct_cols`, `acct_rows`, `int_names`,
   `dep_items`) that `memoToDb()` now writes on every Save Draft / Submit, for every memo type (not
   just the type the new columns describe — `memoToDb()` builds one flat row). This file has not been
   applied to the live Supabase project (no live DB access available during this hotfix, same
   constraint as TD-M1-01/TD-M1-03). Until it is applied, every Supabase `POST` in `saveMemoAsync()`
   will be rejected for the unrecognized columns; the existing catch-and-fallback in `saveMemoAsync()`
   means Save Draft/Submit still succeeds locally (in-memory cache + localStorage) but does not persist
   to Supabase, so a memo saved before the migration is applied would not survive a real reload once
   Supabase is reachable again — matching the exact risk shape already accepted in TD-M1-03 item 1.
2. **`resetMemoForm()` clears the Memo Date without restoring today's default.** Found while fixing
   date restoration on Re-edit/Duplicate; unrelated to this hotfix's reported symptoms (it affects a
   brand-new memo created after using Save Draft once in the same session, not the Re-edit/Duplicate
   path this hotfix targets) and left unfixed to keep this hotfix's diff minimal and scoped to the
   reported bug. `initApp()` sets `#f-date` to `todayISO` once at page load; `resetMemoForm()`
   (`views/create.js`) blanks every `#form-body input` — including `#f-date` — without re-applying
   `todayISO`, so the date field shows blank (not today) for the next memo created in the same session.

Risk

Item 1 is the one that matters operationally, identical in shape to TD-M1-03 item 1: apply the
migration before or together with deploying this code change. Item 2 is a narrow, low-severity,
pre-existing UX gap (an empty required field the user must notice and fill before Submit already
blocks via `validateMemo()` — no silent data loss), not a regression introduced by this hotfix.

Exit Criteria

- Apply `20260703150000_memo_detail_restore.sql` to the live Supabase project, then confirm a Software
  memo's `hw_items`/`acct_cols`/`acct_rows` and an Internal memo's `int_names` both survive a real
  `loadMemosAsync()` refetch (not just local cache).
- Decide whether `resetMemoForm()` should re-apply `todayISO` to `#f-date` (and `#f-signdate`) after
  clearing the form; fix in a follow-up if confirmed.

---

# TD-M2-01

Title

Milestone 2 Deployment Prerequisite + Deferred/Partial Scope Items

Status

OPEN

Priority

Medium

Introduced

Milestone 2 — Financial Foundation

Owner Phase

Financial Foundation

Current Situation

1. **Migration not yet applied.** `supabase/migrations/20260703160000_milestone2_financial_foundation.sql`
   adds `memos.currency`/`created_by`/`updated_by`, `devices.created_by`/`updated_by`,
   `purchase_orders.created_at`/`created_by`/`updated_by`, and
   `budget_pools.created_at`/`created_by`/`updated_by`. Not yet applied to the live Supabase project
   (same constraint as TD-M1-01/TD-M1-03/TD-M1-04). Until it is applied, writes to these tables fall
   back to local-only persistence for the new columns — the same accepted risk shape as those prior
   items, not a new one.
2. **PDF document generation does not vary its wording by currency.** `renderMemoPdf()` (`app.js`)
   builds its Thai-language body/closing sentences with the literal word "บาท" (Baht) hardcoded
   throughout — it does not call the now currency-aware `money()` helper for its main totals at all
   (it formats numbers directly and appends "บาท" as prose). A USD memo's printed PDF will show a
   USD-denominated number immediately followed by "บาท", which is misleading. Rewriting the
   bilingual legal/business sentence templates was explicitly out of scope for this milestone (task
   instructions: "PDF / display only if touched by existing helper" — `renderMemoPdf()`'s main totals
   are not funneled through `money()`, so they were left untouched rather than redesigned).
3. **Budget & Spend manual entry stays THB-only by default.** `validateActualSpendRecord()`/
   `validateBudgetPoolRecord()` now accept USD, and `actualSpendFromMemo()` propagates a memo's own
   currency — but the Manual Expense modal, the Budget Pool modal, and the Actual Spend bulk-import
   template still have no currency selector/column, so every manually-entered or imported record is
   still created with `currency: 'THB'`. Only Approved-Memo-sourced Actual Spend records can be USD
   today (by inheriting the source memo's currency).
4. **License module's Created By / Updated By metadata is deferred**, per explicit instruction
   ("License may be deferred if it depends on future License materialization") — licenses are
   memo-derived, not their own persisted record with independent metadata.
5. **A few secondary Device/PO write paths don't stamp Created By / Updated By.** The primary
   Add/Edit Device modal (`saveDevice()`), photo-arrival device auto-creation (`markArrived()`), and
   Purchase-Order auto-creation on memo approval (`createPurchaseOrdersFromMemo()`) all stamp an
   actor. Device bulk import and the photo-only upload/remove helpers (`uploadDevicePhoto()`,
   `removeDevicePhoto()`-equivalent) do not — they were left untouched to keep this milestone's diff
   scoped to the primary CRUD paths.

Risk

Item 1 is the one that matters operationally — apply the migration before/with this code, same as
every prior milestone's deployment step. Items 2–5 are documented, intentionally deferred scope
reductions, not regressions; none of them cause silent data loss or incorrect financial totals (a
USD amount is never silently converted to THB anywhere in this milestone).

Exit Criteria

- Apply `20260703160000_milestone2_financial_foundation.sql` to the live Supabase project, then
  confirm a USD memo's `currency` and a Device/PO/Budget Pool's `created_by`/`updated_by` all survive
  a real reload (not just local cache).
- PMO/BA decision on whether the PDF template needs bilingual currency wording (item 2), a Manual
  Expense/Budget Pool currency selector (item 3), and/or License metadata (item 4) — each is a larger,
  separately-scoped follow-up if confirmed necessary.

---

# Before Release Checklist

Review every OPEN Technical Debt.

Each item must be

- closed

or

- explicitly accepted.

No workaround should remain undocumented.
