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
