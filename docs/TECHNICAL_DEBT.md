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

OPEN

Priority

Medium

Owner Phase

Overview Cleanup

Current Situation

Overview BvA still reads

loadSLBudgets()

instead of

Budget Pool.

Risk

Overview Budget totals may differ from Budget vs Actual.

Exit Criteria

- Overview uses canonical Budget Pool.
- Overview and BvA reconcile exactly.

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
