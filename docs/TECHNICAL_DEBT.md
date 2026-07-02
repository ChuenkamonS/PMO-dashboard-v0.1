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

OPEN

Priority

Low

Introduced

Phase 7A-9A

Owner Phase

Project Dropdown Unification

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

# Before Release Checklist

Review every OPEN Technical Debt.

Each item must be

- closed

or

- explicitly accepted.

No workaround should remain undocumented.
