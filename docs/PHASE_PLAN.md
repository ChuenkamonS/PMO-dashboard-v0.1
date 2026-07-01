# PHASE_PLAN.md

## Review Baseline (2026-06-30)

This plan covers `MASTER_SPEC.md` and `BvA_REQUIREMENT.md`. The current implementation is a partial legacy implementation and must be migrated without creating parallel financial sources.

Current strengths:
- Budget & Spend already has Overview, Actual Spend, Forecast, Budget vs Actual, Settings, and a legacy Others tab.
- Completed memos, historical/manual expenses, infra costs, budget pools, imports, exports, and drill-downs have partial implementations.
- Memo workflow and historical/manual expense tests pass.

Current critical gaps:
- There is no persisted, canonical Actual Spend table/model. Pages calculate independently from memos, manual expenses, and infra records.
- Budget pools still use memo-type codes rather than the shared Spend Type master.
- Mapping does not represent `autoBudgetPoolId`, `manualBudgetPoolId`, `finalBudgetPoolId`, or `budgetStatus`; multiple matches are silently resolved instead of marked `Needs PMO Review`.
- New or changed pools do not re-evaluate prior Unbudgeted records.
- Overview uses a separate legacy SL budget store and calculations differ between KPI, chart, Actual Spend, Budget vs Actual, forecast, and exports.
- Forecast uses averaging and configurable history windows rather than the specified rolling 6 months actual + 6 months forecast based on coverage periods.
- Infra is stored and calculated separately instead of flowing through Actual Spend as Spend Type `Infra`.
- The legacy Others tab is still present.

## Phase 0 - Specification Alignment and Safety Net

Scope:
- Confirm terminology, date/year convention, missing/partial coverage behavior, import failure behavior, and migration/backfill rules.
- Define a requirement-to-phase traceability checklist.
- Add characterization tests for current totals before changing financial data flow.

Expected files:
- `MASTER_SPEC.md`
- `BvA_REQUIREMENT.md`
- `PHASE_PLAN.md`
- `CHANGELOG.md`
- `tests/budget-expenses.test.js`
- New focused budget calculation/mapping tests as needed

Exit criteria:
- One unambiguous specification baseline and test fixtures for memo, manual, infra, pool, mapping, forecast, and export parity.

## Phase 1 - Canonical Financial Models and Shared Engine

Scope:
- Create the canonical Actual Spend model/table for exactly three sources: Approved Memo, Historical/Manual Expense, and Infra Cost.
- Create the shared Spend Type master and memo-type mapping.
- Align Budget Pool to one project, many pools, and many Spend Types.
- Implement shared calculation and query functions consumed by UI and exports.
- Implement against the existing local structure, keeping field names and boundaries compatible with future Supabase integration.
- Plan idempotent backfill from existing completed memos, manual expenses, infra costs, and budget pools, but defer Supabase migration until the baseline schema is available.

Expected files:
- `app.js`
- `views/budget.js` or new shared financial service/module loaded by `index.html`
- `index.html` only if a shared module is introduced
- Budget model/calculation tests
- No Supabase migration while the baseline schema is missing

Dependencies:
- Existing production schema for `memos`, `budget_pools`, and `infra_costs`
- Confirmed data ownership, missing/partial coverage behavior, and backfill acceptance

Exit criteria:
- Every financial record can be represented once in Actual Spend; calculations no longer need page-specific source assembly.

## Phase 2 - Memo Lifecycle to Actual Spend

Scope:
- Create or update Actual Spend idempotently only when a memo becomes Approved/Completed.
- Ensure Rejected and Cancelled memos never create Actual Spend.
- Map memo types to shared Spend Types.
- Show final Budget Pool and budget status in All Memo; provide PMO manual override with audit fields.

Expected files:
- `app.js`
- `views/pending.js`
- `views/history.js`
- `views/create.js` only if coverage data capture must change
- `index.html`
- Relevant Supabase migration(s)
- `tests/workflow.test.js`
- Memo-to-spend integration tests

Dependencies:
- Phase 1 canonical models and transaction/idempotency design

Exit criteria:
- Memo completion and financial posting cannot diverge or duplicate; manual override always wins.

## Phase 3 - Budget Mapping and Settings

Scope:
- Implement mapping priority: Manual Override, Auto Mapping, Unbudgeted.
- Auto-match by project, Spend Type, and pool period.
- Mark multiple matches as `Needs PMO Review`; do not silently select a pool.
- Re-evaluate previous Unbudgeted records whenever a pool is created or changed.
- Validate pool periods, Spend Types, overlap behavior, and safe deletion/deactivation rules.

Expected files:
- `views/budget.js` or shared financial service/module
- `index.html`
- Relevant Supabase migration(s)
- Budget mapping and settings tests

Dependencies:
- Phase 1 Actual Spend and Budget Pool models
- Temporary authorization assumption: PMO/admin manages mapping, overrides, imports, exports, and pool settings; full role-based enforcement is deferred

Exit criteria:
- `finalBudgetPoolId` and `budgetStatus` are deterministic, persisted, auditable, and consistent everywhere.

## Phase 4 - Unified Actual Spend, Imports, and Drill-down

Scope:
- Make Actual Spend page read only from canonical Actual Spend.
- Route Historical/Manual Expense and Infra Cost entry/import into that source.
- Preserve source reference, coverage period, audit data, final pool, and budget status.
- Add filters and drill-down required by the specification.

Expected files:
- `views/budget.js`
- `views/bulk_import.js`
- `index.html`
- Relevant Supabase migration(s)
- `tests/budget-expenses.test.js`
- Import and Actual Spend query tests

Dependencies:
- Phases 1-3
- Confirmed import failure/rollback behavior

Exit criteria:
- Actual Spend contains all and only valid sources, with no duplicated totals.

## Phase 5 - Overview and Budget vs Actual Parity

Scope:
- Replace legacy SL-budget and direct-memo calculations with shared Actual Spend and Budget Pool calculations.
- Implement consistent KPIs, utilization, remaining budget, Unbudgeted/Needs Review handling, filters, and drill-down.
- Ensure Overview and Budget vs Actual totals reconcile exactly.

Expected files:
- `views/budget.js`
- `index.html`
- Shared financial service/module if introduced
- KPI and cross-page parity tests

Dependencies:
- Phases 1-4

Exit criteria:
- The same filter scope produces identical actual totals on Actual Spend, Overview, and Budget vs Actual.

## Phase 6 - Forecast

Scope:
- Forecast only Software and Infra from Actual Spend plus coverage periods.
- Apply `Monthly Cost = Amount / Coverage Months` with the confirmed inclusive-month rule.
- Implement fixed rolling 6 months actual + 6 months forecast.
- Remove averaging and license-monitor-derived financial logic unless explicitly approved in the specification.

Expected files:
- `views/budget.js`
- `index.html`
- Shared financial service/module if introduced
- Forecast allocation and rolling-window tests

Dependencies:
- Canonical coverage dates and Actual Spend from Phase 1/4

Exit criteria:
- Forecast contains no non-Software/Infra spend and reconciles to shared Actual Spend inputs.

## Phase 7 - Shared Exports, Cleanup, and Release Verification

Scope:
- Make all financial exports consume the same filtered shared result sets as their UI views.
- Remove the Others tab and its legacy rendering path.
- Remove obsolete SL budget storage and duplicated calculation paths after reconciliation.
- Run migration, regression, permission/RLS, import, parity, and end-to-end tests.

Expected files:
- `views/budget.js`
- `index.html`
- `app.js` if export helpers change
- Relevant migration cleanup only when proven safe
- All budget and workflow tests
- `CHANGELOG.md`

Dependencies:
- Phases 1-6 complete and reconciled
- Staging data snapshot and migration rollback plan

Exit criteria:
- Five Budget & Spend tabs only; UI and exports match; all Master Definition of Done items pass.

## Phase 7A - Budget Pool Data Contract and Mapping Hardening

This phase is tracked separately from the `Phase 7` entry above (`Shared Exports, Cleanup, and
Release Verification`), which predates and is unrelated to this numbering. `Phase 7A` follows the
roadmap defined in `docs/AI_ENIGINEERING_GUIDE/05_PHASE_HISTORY.md`
(`Phase 7A → Phase 7B → Phase 8 → Phase 9 → Phase 10`) and targets the Budget Pool identity, year,
mapping, override, import, and deletion contract specifically.

### Phase 7A-1 - Budget Pool Data Contract Documentation (this sub-phase)

Scope:
- Document-only. Lock the Budget Pool business contract before any Phase 7A implementation begins.
- No application logic, tests, UI, or Supabase migrations were changed.

Delivered:
- `docs/BvA_REQUIREMENT.md` — new "Phase 7A-1 — Budget Pool Data Contract (Locked)" section
  covering identity, year handling, multi-month mapping, manual override, canonical automatic
  mapping, missing-pool behavior, duplicate-pool rules, bulk import, deletion/orphan risk,
  Forecast independence, the Overview legacy-budget-source known issue, the Supabase schema-audit
  requirement, and dead-code-cleanup ordering.

Known issues documented (not fixed in 7A-1, cited with exact function/file/line evidence):
- Budget Pool `year` is stored as an independent field (`app.js:223-240`), not derived from
  `startDate`/`startMonth`, and can be saved contradicting the pool's own date range
  (`views/budget.js:2734-2817`).
- Buddhist Era year conversion is duplicated across at least three call sites in
  `views/budget.js` (around lines `855`, `1022`, `1441`) instead of one shared helper.
- Budget Pool bulk import (`views/budget.js`, around lines `2568-2680+`) re-implements its own
  duplicate/conflict checks instead of calling the shared `validateBudgetPoolChange()`
  (`app.js:273-293`) used by manual add/edit, and its duplicate check is case-sensitive where the
  manual path is case-insensitive.
- The Budget Pool deletion guard (`budgetPoolDeletionBlockers()`, `app.js:295-296`) checks only
  canonical Actual Spend references, not legacy memo-level `budgetPoolId` references
  (`views/history.js`, around lines `915`, `1003`, `1024`, `1079`).
- Overview's KPI and embedded Budget-vs-Actual widgets (`_ovUpdateKPIs()`
  `views/budget.js:841-858`; `_ovRenderBvA()` `views/budget.js:1013` onward) read a separate legacy
  `loadSLBudgets()` store (`views/budget.js:1543-1549`) instead of the canonical Budget Pool table,
  so Overview budget figures may not reconcile with the canonical Budget vs Actual tab.

Confirmed-correct behavior (verified against code, not assumed):
- Canonical automatic mapping (project + spend type + date range using the record's `startDate`,
  single-match/no-match/multi-match → Mapped/Unbudgeted/Needs PMO Review) is already implemented
  once, in `findMatchingBudgetPools()` + `mapBudgetPool()` (`app.js:388-421`), with no competing
  legacy implementation found.
- Manual override already always wins and is never overwritten by auto mapping
  (`mapBudgetPool()`, `app.js:398-421`).
- Mapping already uses whole-record mapping by `startDate` only; multi-month Actual Spend is never
  split across pools (`actualSpendMappingDate()`, `app.js:384-386`).
- Forecast already has no Budget Pool dependency (`calculateForecast()`, `app.js:458-501`).

Expected files for Phase 7A-2 onward (not modified in 7A-1):
- `app.js` (year derivation helper, shared BE conversion helper, bulk import validation reuse)
- `views/budget.js` (bulk import wiring, Overview/BE call sites)
- `views/history.js` (memo-level Budget Pool reference review)
- Budget Pool contract tests

Exit criteria for 7A-1:
- The contract in `docs/BvA_REQUIREMENT.md` is specific enough (exact rules, current-vs-contract
  gaps, file/line evidence) that a future implementation agent can execute Phase 7A-2 without
  re-deriving business rules from scratch.

Out of scope for 7A-1 (see `docs/BvA_REQUIREMENT.md`, "Phase 7A-1 Scope Boundary"):
- Year normalization implementation, BvA calculation fixes, Budget Pool import validation
  unification, manual override warnings, Tag Budget modal changes, Overview BvA fix, Forecast
  changes, Budget Settings UX changes, Supabase migrations, dead-code cleanup, test changes.

## Requirement Coverage

| Requirement | Planned phase(s) |
| --- | --- |
| Shared Spend Type master and memo mapping | 1, 2 |
| Canonical Actual Spend and allowed sources | 1, 2, 4 |
| Memo lifecycle posting rules | 2 |
| Budget Pool model | 1, 3 |
| Auto mapping, ambiguity, Unbudgeted | 3 |
| Manual override precedence and audit | 2, 3 |
| Re-evaluate Unbudgeted after pool changes | 3 |
| Overview and KPI parity | 5 |
| Actual Spend page, import, drill-down | 4 |
| Software + Infra rolling forecast | 6 |
| Budget vs Actual, utilization, remaining | 5 |
| Shared UI/export calculations | 1, 7 |
| Remove Others tab and duplicate logic | 7 |
| Regression, migration, permissions, acceptance | 0, 7 |

## Current Blockers / Decisions Required

- The requested `/docs/...` paths do not exist; specification files are at repository root, and the coding document is `CODING_GUIDE.md` rather than `CODING_GUIDELINE.md`.
- The repository has no migration that defines the existing `memos`, `budget_pools`, or `infra_costs` baseline, so the deployed schema and RLS policies must be inspected before model changes.
- Missing coverage dates, partial months, and zero/invalid duration behavior still need explicit rules.
- Import failure/rollback behavior is not specified.
- Full role-based permission and database enforcement are deferred; the temporary PMO/admin assumption must not be mistaken for complete security enforcement.

## Confirmed Planning Decisions (2026-06-30)

- Currency: store a currency field for future use; default to THB and calculate in THB only for the current scope.
- Coverage months: count calendar months inclusively; January 2026 through March 2026 equals 3 months.
- Import duplicates: compare Source + Reference No + Project + Spend Type + Amount + Start Date + End Date. Skip matching rows and display them as duplicates.
- Authorization: assume PMO/admin can manage budget mapping, manual overrides, imports, exports, and Budget Pool settings. Do not implement full role-based permission yet.
- Supabase: do not create a migration while the baseline schema is missing. Use the existing local structure and keep the model compatible with later Supabase integration.

## Implementation Guardrails

- Reuse existing components and migrate incrementally.
- Do not create parallel financial sources or duplicate calculations.
- Do not refactor unrelated modules.
- Update `CHANGELOG.md` after each implementation phase.
- Each phase must list modified files, data-flow changes, tests run, and remaining work.
