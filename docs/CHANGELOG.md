# CHANGELOG.md

## Format

### Phase X
#### Added
- ...

#### Changed
- ...

#### Fixed
- ...

#### Removed
- ...

#### Remaining Work
- ...

---

## Current Baseline

### Phase 7A-3 - Same-Year Budget Pool Mapping Contract
#### Follow-up fixes (pre-commit clarification pass)
- `saveBudgetTag()`'s cross-year guard no longer fails open when no canonical Actual Spend record
  exists yet for the memo (e.g. stale/unrefreshed canonical storage) — it now falls back to
  deriving the memo's own coverage date via `memoCoveragePeriod()`, mirroring
  `actualSpendFromMemo()`'s exact fallback chain, so the check is never silently skipped.
- `createActualSpendRecord()` now preserves `mappingWarning` across normalization. Previously the
  flag only existed in `mapBudgetPool()`'s immediate return value and was silently dropped every
  time a record passed through `storeActualSpendRecords()`/`loadActualSpendRecords()` — meaning a
  blocked cross-year override could become indistinguishable from an ordinary never-assigned
  Unbudgeted record after a single store/reload cycle.

#### Follow-up fixes (strict review, pre-commit)
- Tag Budget (`saveBudgetTag()` in `views/history.js`) now blocks a cross-year Budget Pool
  assignment at save time with a clear error, instead of silently persisting a memo whose
  underlying Actual Spend record was reclassified to `Unbudgeted` without any user feedback.
  Compares against the pool's canonical derived year, not its raw stored year.
- `budgetPoolDeletionBlockers()` now also checks persisted manual expense and memo-level
  `budgetPoolId` references, not just the canonical Actual Spend mapping — a Budget Pool no longer
  becomes deletable merely because a cross-year override was cleared from the canonical record;
  any raw source still referencing it keeps deletion blocked.
- `saveManualExpenseFromModal()`'s save-time validation now compares against the Budget Pool's
  canonical derived year (`createBudgetPoolRecord()`), not the raw stored `year` from the
  unnormalized `loadBudgetPools()` cache, so a pool whose raw label disagrees with its own dates
  is validated correctly rather than against a stale label.

#### Changed
- Budget Pool `year` is now always derived from the pool's own `startDate`/`startMonth`
  (`createBudgetPoolRecord()`), using a new shared `gregorianYearToBuddhistEra()` helper — a
  conflicting `year` input is ignored whenever coverage dates exist, and is only used as a
  fallback when no date data is present at all.
- Budget Pools can no longer span multiple Gregorian years — `validateBudgetPoolRecord()` now
  rejects a pool whose `startDate` and `endDate` fall in different years with
  `"Budget Pool must not span multiple years"`.
- Manual Actual Spend no longer auto-maps under any circumstance. With no Budget Pool selected it
  is always `Unbudgeted`, even if a matching pool would otherwise be found by project/spend
  type/date range (`mapBudgetPool()`).
- Cross-year Manual Override is blocked at both layers: the data layer (`mapBudgetPool()` refuses
  to honor a `manualBudgetPoolId` whose pool's year disagrees with the spend's own coverage year,
  clearing `manualBudgetPoolId`/`autoBudgetPoolId`/`finalBudgetPoolId` and setting
  `mappingWarning: "blocked-cross-year-override"` so it is detected, not silently normalized) and
  the save layer (`saveManualExpenseFromModal()` in `views/budget.js` now rejects the save with a
  clear error and does not persist the invalid `budgetPoolId` if the selected pool's year does not
  match the manual spend's coverage year).
- Approved Memo-created Actual Spend and Infra Cost continue to auto-map exactly as before, with
  one addition: `findMatchingBudgetPools()` now also requires the candidate pool's year to match
  the record's coverage year, closing the Phase 7A-1/7A-2 silent-drop gap at its source rather
  than compensating for it in `calculateBudgetVsActualDataset()`.

#### Unchanged
- `calculateBudgetVsActualDataset()` and `budgetVsActualExportDataset()` were not modified — no
  `outOfScopePoolRecords`-style bucket was introduced. Once mapping only ever produces a same-year
  `finalBudgetPoolId` (or `null`), the existing `unbudgetedRecords`/`totals.unbudgetedActual`
  already account for every blocked or never-assigned record without any structural change.
- Forecast, Overview, Import, and the Tag Budget modal were not modified.

#### Known Issues (not fixed in this phase)
- Existing invalid legacy records — a Budget Pool already spanning multiple years, or an Actual
  Spend record with an already-stored cross-year override — are detected and flagged
  (`mappingWarning`) the next time reconciliation runs, but are not retroactively repaired. The
  underlying stored `budgetPoolId`/`year` values are left exactly as they were; only the derived
  `budgetStatus` changes. A manual data-quality review of existing pools and overrides is
  recommended before relying on this phase's totals for historical years.
- Budget Pool bulk import still does not call the shared validator, so a bulk-imported pool could
  still be saved spanning multiple years (pre-existing gap, documented in
  `docs/BvA_REQUIREMENT.md` "Phase 7A-1" §7/§8, not addressed here).

#### Tests
- Replaced the two Phase 7A-2 fail-first tests, which constructed their mismatched pool by passing
  a conflicting `year` alongside `startMonth`/`endMonth` directly to `createBudgetPoolRecord()` —
  that construction is no longer possible now that `year` is always derived from dates, so the bug
  is fixed structurally rather than reproduced. Replaced with a legacy-simulation test (a
  mismatched pool is hand-constructed to simulate pre-fix stored data) proving the record remains
  visible as `Unbudgeted` rather than vanishing.
- Added tests in `tests/financial-models.test.js` for: year derivation and the conflicting-input
  fallback; multi-year-span rejection; Manual Actual Spend never auto-mapping; same-year Manual
  Override; cross-year Manual Override being blocked and flagged (asserting
  `getFinalBudgetPoolId()` returns `null`); Approved Memo and Infra Cost same-year auto-mapping
  (positive and negative); BvA totals including flagged Unbudgeted records; and Forecast being
  unaffected by the new mapping/blocking logic.
- One pre-existing test's fixture (`Phase 7 Budget Pool CRUD validation rejects invalid and
  duplicate pools...`) was adjusted to remove a `startDate`/`endDate` pair that would otherwise
  now allow `year` to be derived, which had made its `"Year is required"` assertion obsolete under
  the new derivation rule; the assertion itself is unchanged.

### Phase 7A-2 - BvA Year Silent-Drop Bug: Fail-First Regression Tests
#### Added
- Three behavioral tests in `tests/financial-models.test.js` proving the Budget Pool year
  silent-drop bug documented in `docs/BvA_REQUIREMENT.md` "Phase 7A-1" §2: a Budget Pool whose
  `year` label disagrees with its own `startMonth`/`endMonth` can cause a validly-mapped Actual
  Spend record to disappear from `calculateBudgetVsActualDataset()`'s totals entirely — neither
  matched under its pool nor counted as Unbudgeted — regardless of whether Budget vs Actual is
  filtered by the pool's year label or by the record's own date-derived year.
- A control test proving the same mapping/BvA path works correctly when a pool's `year` agrees
  with its date range, isolating the bug to the year-mismatch condition specifically.

#### Tests
- `Phase 7A-2 (fail-first): BvA must not silently drop a mapped Actual Spend record when filtered
  by the pool's own year label, even though the pool's date range disagrees` — fails on current
  code.
- `Phase 7A-2 (fail-first): BvA must not silently drop a mapped Actual Spend record when filtered
  by the record's date-derived year, even though the pool's year label disagrees` — fails on
  current code.
- `Phase 7A-2 control: BvA includes actual spend normally when pool.year agrees with its
  startMonth/endMonth` — passes on current code.

#### Unchanged
- No application logic, UI, or Supabase migrations were modified. No existing test was changed or
  weakened. `calculateBudgetVsActualDataset()`, `mapActualSpendRecords()`, and related mapping
  functions remain exactly as before.

#### Remaining Work
- Phase 7A-3 must reconcile Budget Pool `year` with its own date range (or otherwise close this
  gap) so the two new fail-first tests above pass without weakening the control test.

### Phase 7A-1 - Budget Pool Data Contract Documentation
#### Added
- Locked Budget Pool business contract in `BvA_REQUIREMENT.md` covering identity
  (`project` + `name` + `year`), year handling, multi-month mapping, manual override precedence,
  the canonical automatic mapping rule, missing-pool behavior, duplicate-pool rules, bulk import,
  deletion/orphan risk, Forecast independence, the Overview legacy-budget-source issue, the
  Supabase schema-audit requirement, and dead-code-cleanup ordering.
- `Phase 7A` entry in `PHASE_PLAN.md` distinguishing this roadmap track (per
  `docs/AI_ENIGINEERING_GUIDE/05_PHASE_HISTORY.md`) from the earlier, differently-scoped `Phase 7`
  already recorded in this changelog and plan.

#### Known Issues Documented (not fixed in this sub-phase)
- Budget Pool `year` is an independently stored field, not derived from `startDate`/`startMonth`,
  and can be saved contradicting the pool's own date range.
- Buddhist Era year conversion is duplicated across multiple call sites instead of one shared
  helper.
- Budget Pool bulk import re-implements its own duplicate/conflict validation instead of reusing
  the shared manual add/edit validator, and its duplicate check is case-sensitive where the manual
  path is case-insensitive.
- The Budget Pool deletion guard checks only canonical Actual Spend references, not legacy
  memo-level Budget Pool references.
- Overview's KPI and embedded Budget-vs-Actual widgets read a separate legacy budget store instead
  of the canonical Budget Pool table, so Overview figures may not reconcile with the canonical
  Budget vs Actual tab.

#### Unchanged
- No application logic, UI, tests, or Supabase migrations were modified. All mapping, override,
  deletion, Forecast, and Overview behavior described above reflects the pre-existing
  implementation, verified by reading the code, not altered by this documentation phase.

#### Remaining Work
- Phase 7A-2 onward implements against the locked contract (year derivation, shared BE helper,
  bulk import unification, manual override warnings, memo-level orphan review), per
  `PHASE_PLAN.md`.

### Phase C - Actual Spend Export Alignment
#### Changed
- Actual Spend CSV export now includes canonical record identity, currency, amount basis, coverage status, vendor/program, final Budget Pool, and optional Notes alongside the existing audit fields.
- Existing Reference, date, and Budget Pool columns were clarified as Reference No, Start/End Date, and Final Budget Pool.
- Export Amount remains the canonical total for the coverage period and continues to use the same filtered records as the UI.

#### Tests
- Added export coverage for canonical field alignment, UI/export total parity, and Approved Memo, Manual / Historical, and Infra Cost rows.

### Phase B - Actual Spend Field Clarity
#### Changed
- The Manual Historical form now labels Monthly entries as a monthly amount and explains that the resulting total equals monthly amount multiplied by inclusive coverage months.
- One-time entries are explicitly labeled as a one-time total without changing their calculation.
- The Actual Spend import template now states that Amount is the total amount for the coverage period, not a monthly amount.

#### Tests
- Added focused label/helper coverage while retaining the existing one-time, monthly, Infra, and import validation behavior tests.

### Phase A - Actual Spend Import Validation
#### Changed
- Actual Spend imports now reject unknown Source and Spend Type values with row-level field errors instead of coercing them to Manual/Historical or Others.
- Approved Memo, Manual / Historical, and Infra Cost remain accepted; the supported Infrastructure label maps to the shared Infra Spend Type.
- The import template now lists the accepted Source values and uses the Manual / Historical label.

#### Tests
- Added behavioral coverage for invalid enum rejection, all-or-nothing row validation, all three valid sources, and the supported Infrastructure alias.

### Infra Cost Entry Consolidation
#### Changed
- Actual Spend is now the only UI path for entering or importing Infra Cost spending.
- Settings now contains Budget Pool configuration only.

#### Removed
- Settings Infra Cost navigation, manual add/edit/delete modal, and dedicated bulk-upload flow.

#### Tests
- Added regression coverage proving the Settings entry paths are absent while Infra Cost remains valid in canonical Actual Spend, Budget vs Actual, Forecast, export, drill-down data, and Unbudgeted totals.

### Phase 7 - Budget Pool Integration and Release Verification
#### Added
- Shared Budget Pool create/edit validation for required fields, positive budgets, valid periods, duplicate identity, and overlapping project/Spend Type conflicts.
- Safe deletion guard for Budget Pools referenced by canonical Actual Spend.
- Focused regression coverage for Budget Pool validation, conflict handling, re-mapping, BvA recalculation, export parity, and the five-tab release scope.

#### Changed
- Budget Pool create/edit/delete now re-runs shared Actual Spend mapping so Budget vs Actual, utilization, remaining budget, drill-down, export, and Unbudgeted data stay aligned.
- Overlapping pools may be confirmed and saved; affected records follow the shared `Needs PMO Review` mapping rule.

#### Removed
- Obsolete Others tab, panel, and legacy memo-based rendering path, as required by `BvA_REQUIREMENT.md`.

#### Data Flow
- Budget Pool CRUD → shared validation → canonical Budget Pool storage → shared Actual Spend mapping → canonical Budget vs Actual dataset and export.

#### Remaining Work
- Full role-based authorization and Supabase baseline/RLS verification remain deferred per the confirmed project decisions.

### Phase 6 - Budget vs Actual
#### Added
- Shared Budget vs Actual dataset and CSV serializer for KPI, chart, pool table, drill-down, export, and Unbudgeted totals.
- Canonical Actual Spend drill-down for all spend, individual Budget Pools, and Unbudgeted items.
- Focused behavioral tests for utilization parity, remaining-budget calculation, drill-down/export total parity, and Unbudgeted selection.

#### Changed
- Budget vs Actual now consumes canonical Actual Spend and the shared Budget Utilization calculation instead of recalculating from memos and manual expenses.
- Remaining Budget is consistently derived as Budget minus Actual Spend; the page and export reuse the same totals.

#### Data Flow
- Canonical Actual Spend + Budget Pools → shared Budget vs Actual dataset → KPI, comparison chart, pool table, drill-down, Unbudgeted section, and CSV export.

#### Remaining Work
- Later cleanup phases remain unchanged.

### Phase 5 - Forecast
#### Added
- Shared rolling forecast calculation and Forecast CSV export.
- Focused coverage for Software/Infra filtering, inclusive monthly allocation, and the fixed rolling window.

#### Changed
- Forecast now consumes canonical Actual Spend only and displays six actual months plus six forecast months.
- UI and export reuse the same filtered forecast dataset and shared calculation engine.
- Actual months remain coverage-bound; forecast months now carry the latest calculable monthly cost forward after coverage ends.
- Forecast CSV serialization now comes from the same shared Forecast dataset rendered by the table.

#### Remaining Work
- Records with missing coverage remain excluded from monthly Forecast allocation.

---

### Phase 0
#### Added
- Master Specification
- Requirement document
- Coding Guide

#### Remaining Work
- Phase 1 implementation

---

## Review - 2026-06-30

#### Reviewed
- Compared the current implementation with `MASTER_SPEC.md`, `BvA_REQUIREMENT.md`, and the existing phase plan.
- Confirmed partial implementations for memo lifecycle, historical/manual expense, infra cost, budget pools, Budget & Spend views, imports, exports, and drill-downs.
- Ran 14 existing tests successfully and verified JavaScript syntax for `app.js` and `views/budget.js`.

#### Gaps Identified
- No canonical persisted Actual Spend source; financial pages assemble different source sets and calculations.
- No shared Spend Type model across memo, Actual Spend, Budget Pool, forecast, and exports.
- Budget mapping lacks persisted auto/manual/final pool fields, ambiguity status, and Unbudgeted re-evaluation.
- Overview still uses a separate SL budget store; totals and allocation logic differ across pages and exports.
- Forecast does not implement the required rolling 6 actual + 6 forecast coverage-period rule.
- Infra remains a separate calculation/storage path instead of an Actual Spend record with Spend Type Infra.
- The legacy Others tab remains present.
- Existing tests do not cover mapping priority, ambiguity, re-evaluation, forecast rules, or cross-page/export parity.

#### Documentation Changed
- Reworked `PHASE_PLAN.md` into dependency-ordered phases with expected files, exit criteria, requirement traceability, risks, and blockers.

#### Remaining Work
- Resolve the specification/schema decisions listed as blockers in `PHASE_PLAN.md` before implementation.
- Implement Phases 0-7; no feature code was changed during this review.

---

### Phase 1A
#### Added
- Shared Spend Type master and memo-type mapping.
- Local, Supabase-compatible Actual Spend and Budget Pool model normalizers.
- Inclusive coverage-month calculation with `Missing Coverage` handling.
- Shared financial storage, duplicate detection, validation, and all-or-nothing import helpers.
- Focused model and storage tests.

#### Changed
- Current calculations default to THB while retaining a currency field for future use.
- Added generated Actual Spend IDs and strict calendar validation.
- Added Budget Pool validation and canonical-to-legacy Spend Type synchronization.
- Restricted shared persistence to validated financial records.
- Added shared Actual Spend/Budget Pool query helpers under a common helper namespace.

#### Remaining Work
- Connect the shared models to application workflows and financial pages in later phases.
- Defer Supabase migration until the baseline schema is available.

---

### Phase 1B
#### Added
- Shared Budget Pool auto-mapping by project, Spend Type, and pool period.
- Manual override precedence and shared Budget Status values.
- Multiple-match handling with `Needs PMO Review` and no-match handling with `Unbudgeted`.
- Shared Actual Spend total and Budget utilization calculations.
- Batch mapping helper for re-evaluating Actual Spend records.

#### Remaining Work
- Connect shared mapping and calculations to workflows and UI in later phases.

---

### Phase 2
#### Added
- Idempotent Actual Spend posting when a memo reaches Completed status.
- Memo lifecycle removal guard so Pending, Rejected, and Cancelled memos do not contribute to Actual Spend.
- Canonical Budget Pool and Budget Status display in the existing All Memo Budget column.
- Existing PMO Budget Pool modal now persists manual overrides to Actual Spend.

#### Changed
- Completed memo posting uses the Phase 1 Spend Type master and Budget Pool mapping priority.

#### Remaining Work
- Downstream financial pages continue to use their existing data paths until their planned phases.

---

### Phase 3 - Unified Actual Spend
#### Added
- Actual Spend summary cards, canonical record table, Budget Status filter, and row drill-down.
- Historical/Manual and Infra Cost projection into the shared Phase 1A Actual Spend model.
- Actual Spend spreadsheet import using Phase 1A validation, all-or-nothing failure, and duplicate rules.
- Focused tests covering the three allowed sources and inclusive Historical/Infra coverage totals.

#### Changed
- Actual Spend filters and CSV export now consume the same canonical, Phase 1B-mapped records.
- Completed memos remain idempotently integrated from Phase 2; Historical and Infra records are reconciled by stable source IDs.
- Invalid legacy source rows are skipped during reconciliation so they cannot block valid Actual Spend records from rendering.
- Actual Spend now defaults to a selectable data year and groups the filtered result by Project, Spend Type, and Source.
- Replaced Actual Spend KPI cards with a compact year-specific total line and project summaries.
- Removed the Overview budget KPI card and clarified the wording of the remaining KPI values.
- Actual Spend drill-down now uses responsive detail cards that fit within one view without horizontal scrolling.
- Added a downloadable Actual Spend Excel import template with valid examples, accepted values, and duplicate/validation instructions.

#### Data Flow
- Approved Memo + Historical/Manual Expense + Infra Cost → shared Actual Spend → Budget Pool mapping → filters, summary cards, drill-down, and export.

#### Remaining Work
- Forecast, Budget vs Actual, Overview, Settings, and later cleanup phases remain unchanged.

---

### Phase 4 - Overview KPI, Charts, and Filters
#### Changed
- Overview KPI actuals, monthly chart, donut breakdown, and embedded project budget-vs-actual rows now consume canonical Actual Spend records.
- Project, Spend Type, and period filters now apply consistently to every Overview actual calculation, including Infra and Other spend when present.
- Added shared coverage-period monthly allocation and range-total helpers to the financial calculation engine.
- Preserved the Forecast tab UI and rendering path; only the existing Overview forecast KPI now receives its actual/YTD inputs from canonical Actual Spend.

#### Data Flow
- Approved Memo + Historical/Manual Expense + Infra Cost → canonical Actual Spend → shared monthly allocation/range calculation → Overview filters → KPI cards and charts.

#### Tests
- Added behavioral parity coverage proving Overview KPI, chart, donut, and project comparison totals remain equal for project and Spend Type filters plus 3M, 6M, 12M, and custom periods.

#### Remaining Work
- Standalone Budget vs Actual, Forecast, Settings, exports, and cleanup remain unchanged.
