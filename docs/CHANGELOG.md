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
