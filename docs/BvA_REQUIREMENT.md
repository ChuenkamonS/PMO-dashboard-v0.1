
# MASTER_SPEC.md
# PMO Dashboard - Master Specification

> This document defines the permanent business rules, data model, calculation rules and system-wide data flow.
> Feature requirements should reference this document instead of redefining business logic.

## 1. Purpose
This specification is the single source of truth for the Budget & Spend module. It defines:
- Business rules
- Data model
- Calculation rules
- Data flow
- Integration rules
- Acceptance rules

Feature-specific UI requirements belong in REQUIREMENT.md, not here.

---

# 2. System Scope

Budget & Spend contains only 5 tabs:

1. Overview
2. Actual Spend
3. Forecast
4. Budget vs Actual
5. Settings

The legacy "Others" tab is removed.

---

# 3. Single Source of Truth

## Memo
Source: Memo table

## Actual Spend
Source: Actual Spend table

## Budget
Source: Budget Pool table

## Forecast
Source: Actual Spend + Coverage Period

Every dashboard page, chart and export must use these same sources.

---

# 4. Memo Lifecycle

Draft
→ Pending
→ Approved / Completed
→ Actual Spend

Rejected and Cancelled never create Actual Spend.

Only Approved / Completed memo contributes to financial reporting.

---

# 5. Spend Type Master

Spend Types:

- Software
- Hardware
- Team Activity
- Client Expense
- Deployment
- Infra
- Others

Memo Type is only an input.

Memo Type mapping:

SL → Software
HW → Hardware
INT → Team Activity
ENT → Client Expense
DEP → Deployment

All modules must use the same Spend Type master.

---

# 6. Actual Spend Model

Actual Spend is the financial source of truth.

Allowed sources:

1. Approved Memo
2. Manual / Historical Expense
3. Infra Cost

No other source is allowed.

Recommended record:

- id
- source
- referenceNo
- memoId
- project
- spendType
- amount
- currency
- startDate
- endDate
- month
- year
- vendorProgram
- description
- autoBudgetPoolId
- manualBudgetPoolId
- finalBudgetPoolId
- budgetStatus
- createdBy
- createdAt
- updatedBy
- updatedAt

---

# 7. Budget Pool

Budget Pool stores budgets only.

It never stores Actual Spend.

Actual Spend references Budget Pool.

One Project
→ Many Budget Pools

One Budget Pool
→ Many Spend Types

---

# 8. Budget Mapping

Priority:

Manual Override
→ Auto Mapping
→ Unbudgeted

Auto Mapping Rules:

- Project matches
- Spend Type matches
- Date is within pool period

If multiple pools match:

Status = Needs PMO Review

If no pool matches:

Status = Unbudgeted

Creating a new Budget Pool must automatically re-evaluate previous Unbudgeted records.

---

# 9. Manual Override

PMO can override Budget Pool.

Manual Override always wins.

Auto Mapping must never overwrite a manual override.

---

# 10. Forecast Rules

Forecast only uses:

- Software
- Infra

Monthly Cost:

Amount ÷ Coverage Months

Forecast view:

- Rolling 6 months Actual
- Rolling 6 months Forecast

---

# 11. KPI Rules

All KPI calculations must come from Actual Spend.

Never calculate independently per page.

Overview, Forecast and Budget vs Actual must produce identical totals.

---

# 12. Calculation Engine

Business calculations must exist in shared reusable functions.

Examples:

- calculateActualSpend()
- calculateForecast()
- calculateBudgetUtilization()
- mapBudgetPool()

Never duplicate business logic in UI components.

---

# 13. Export Rules

Exports must use exactly the same data source and calculations as the UI.

Do not create separate export queries with different logic.

---

# 14. Integration Rules

Approved Memo

↓

Actual Spend

↓

Budget Mapping

↓

Overview

↓

Budget vs Actual

↓

Forecast (Software / Infra only)

↓

Export

All downstream modules consume Actual Spend.

---

# 15. Architectural Principles

- Reuse existing implementation whenever possible.
- Refactor only where required.
- Do not introduce duplicate data sources.
- Do not create a separate Infra module.
- Infra is a Spend Type within Actual Spend.
- UI should consume business services rather than implementing calculations.

---

# 16. Definition of Done

The implementation is complete only when:

- All financial pages use Actual Spend as source of truth.
- Budget Pool mapping is consistent.
- Manual Override is respected.
- Forecast uses Software + Infra only.
- Others tab is removed.
- Spend Type master is shared.
- Export matches UI.
- No duplicate calculation logic exists.

---

# Phase 7A-1 — Budget Pool Data Contract (Locked)

Status: Documentation only. No implementation performed in this sub-phase.

Authority: This section is the locked business contract for Budget Pool identity, year handling,
mapping, override, import, and deletion behavior. It is authoritative over any conflicting code
comment or ad-hoc assumption. Phase 7A-2 and later sub-phases must implement against this section
without re-deriving the rules. If code and this section disagree, this section wins unless a future
phase explicitly amends it.

Grounding: Every "Current implementation" note below cites the exact function and file/line as of
this writing so a future agent can verify the claim still holds before acting on it.

## 1. Budget Pool Identity

- Business identity = `(project, name, year)`. Two pools with the same project, the same name
  (case-insensitive), and the same year are the same business entity and must never both exist.
- `id` is an opaque technical identifier only. It must never be parsed, displayed as a business
  key, or treated as meaningful outside storage/reference purposes.
- Current implementation already matches this: `validateBudgetPoolChange()` (`app.js:273-293`)
  compares `project` + case-insensitive `name` + string-compared `year` to detect duplicates and
  overlap conflicts.

## 2. Budget Pool Year Handling

- Contract: Budget Pool `year` must be **derived** from the pool's own `startMonth`/`startDate`.
  It must never be an independently editable label that can disagree with the pool's date range.
- **Known Issue #1 (not fixed in 7A-1):** `createBudgetPoolRecord()` (`app.js:223-240`) stores
  `year: input.year || null` with no derivation from `startDate`/`endDate`/`startMonth`. The
  Add/Edit modal (`openBudgetPoolModal()`, `views/budget.js:2734-2789`) renders `year` as a
  separate readonly field seeded from the ambient Budget Settings year context — not computed from
  the date range the user picks — and `saveBudgetPool()` (`views/budget.js:2795-2817`) persists
  whatever value that field holds. A pool can therefore be saved with a `year` that contradicts its
  own `startDate`/`endDate`. Contrast with Actual Spend, where `createActualSpendRecord()`
  (`app.js:150`) already derives `year` from the effective date when not explicitly given.
- Contract for Phase 7A-2+: introduce one shared year-derivation helper that computes Budget Pool
  `year` from `startDate`/`startMonth`, and stop accepting an independently divergent `year` input
  on create/edit.
- Storage and date calculation: Gregorian (ISO `YYYY-MM` / `YYYY-MM-DD`), matching the existing
  Actual Spend `startDate`/`endDate` convention. Do not store Buddhist Era in persisted date/year
  fields.
- Display: Buddhist Era (BE = Gregorian + 543) only in Thai-facing year UI controls where the UI
  already displays BE.
- **Known Issue #2 (not fixed in 7A-1):** BE conversion (`getFullYear() + 543`) is duplicated
  ad hoc in at least three places in `views/budget.js` (around lines `855`, `1022`, and `1441`,
  each inside a different Overview/BvA rendering function) instead of going through one shared
  helper. This violates the "one business rule, one place" rule already stated in
  `10_BUSINESS_RULES.md` ("Year Rules") and `06_KNOWN_ARCHITECTURE_LIMITATIONS.md`.
- Contract for Phase 7A-2+: introduce one shared BE⇄Gregorian conversion/normalization function.
  Every year filter (Actual Spend year filter, Budget vs Actual year filter, Overview year context,
  Budget Pool duplicate/overlap checks) must call that one function — never re-derive year math
  locally.

## 3. Multi-Month Actual Spend Crossing a Pool Boundary

- Contract: Phase 7A does **not** split or prorate one Actual Spend record's amount across multiple
  Budget Pools. Mapping is whole-record mapping keyed on the record's own `startDate`.
- Current implementation already matches this and must not change in 7A-2 without a new decision:
  `actualSpendMappingDate()` (`app.js:384-386`) resolves to the record's `startDate` (falling back
  to `month`, then `year-01`). `findMatchingBudgetPools()` (`app.js:388-396`) tests only that single
  date against each pool's `[startDate, endDate]` range. A record's `endDate` is never consulted for
  mapping purposes, so a record whose coverage period spans a pool boundary maps 100% to whichever
  pool contains its `startDate` — never split.
- This is a **known, accepted limitation** for Phase 7A, not a bug: do not introduce monthly
  allocation or split-mapping logic in this phase. (Note: unrelated monthly allocation exists for
  Forecast display, e.g. `app.js` coverage-month spreading around lines `431-448` — that logic
  allocates amounts across months for display/Forecast only and must not be confused with, or
  reused for, Budget Pool mapping.)

## 4. Manual Override

- Contract: Manual Override always wins. Automatic mapping must never overwrite a manual override.
- Current implementation already matches this: `mapBudgetPool()` (`app.js:398-421`) checks
  `actualSpend.manualBudgetPoolId` first and returns immediately with
  `budgetStatus = 'Manual Override'` without ever calling `findMatchingBudgetPools()` for that
  record — auto mapping is structurally never evaluated once a manual override exists.
- **Known gap (deferred, not implemented in 7A-1):** there is no plausibility check today. Neither
  `mapBudgetPool()` nor `budgetPoolDeletionBlockers()` (`app.js:295-296`) verifies that a manually
  selected pool's `project` / `spendTypes` / `year` actually matches the Actual Spend record before
  honoring the override.
- Contract for a later implementation phase (explicitly **not** Phase 7A-1): when a manual override
  points to a pool that does not plausibly match project/spend type/year, the system should surface
  a warning but must not block the save or silently revert the override. Designing and implementing
  that warning is out of scope for this documentation phase.

## 5. Automatic Mapping (Canonical Rule)

The canonical, and only permitted, automatic mapping rule is:

1. `pool.project === actualSpend.project`
2. `actualSpend.spendType` is a member of `pool.spendTypes`
3. the Actual Spend record's mapping date (its `startDate`, see §3) falls within
   `[pool.startDate, pool.endDate]` (or legacy `startMonth`/`endMonth`)
4. exactly one pool matches → `budgetStatus = 'Mapped'`, `finalBudgetPoolId` = that pool's id
5. zero pools match → `budgetStatus = 'Unbudgeted'`, `finalBudgetPoolId = null`
6. more than one pool matches → `budgetStatus = 'Needs PMO Review'`, `finalBudgetPoolId = null`
   (no pool is auto-selected)

- Current implementation already matches this rule exactly: `findMatchingBudgetPools()` +
  `mapBudgetPool()` (`app.js:388-421`), invoked in batch by `mapActualSpendRecords()`
  (`app.js:423-425`), which is called from the single reconciliation entry point
  `reconcileActualSpendSources()` (`views/budget.js:469`). This is the only mapping implementation
  found; there is no separate legacy preview/modal that recomputes mapping independently for the
  dedicated Budget vs Actual page.
- Contract: this remains the single mapping implementation. No feature added in Phase 7A-2 or later
  (including any future preview UI or modal) may reimplement or approximate this rule — every
  caller must go through the shared function.

## 6. Missing Budget Pool

- Contract and current behavior already agree: an Actual Spend record with zero matching pools is
  `Unbudgeted`. The system must never invent a pool or silently assign a non-matching one.

## 7. Duplicate Budget Pools

- Contract: duplicate business identity (§1) must never be silently created by any write path,
  including manual add/edit and bulk import.
- Manual add/edit already enforces this via `validateBudgetPoolChange()` (`app.js:273-293`).
- **Known Issue #3 (not fixed in 7A-1):** bulk import does **not** call
  `validateBudgetPoolChange()`. `_confirmPoolImport()` (`views/budget.js`, around line `2680`)
  re-implements its own inline duplicate check:
  `existing.find(p => p.project === it.proj && p.name === it.name && p.year === it.yr)`.
  This is a **case-sensitive** name compare, unlike the manual path's case-insensitive compare in
  `validateBudgetPoolChange()` — the two paths can already disagree on what counts as a duplicate.
- Contract for a later implementation phase: bulk import must call the same shared
  `validateBudgetPoolChange()` (or an equivalent shared function) used by manual add/edit — not a
  parallel, separately-maintained rule. Do not implement this fix in Phase 7A-1.

## 8. Budget Pool Bulk Import

- Contract: bulk import must apply the same validation as manual add/edit — required fields,
  positive budget, valid period, duplicate identity (§7), and overlap conflicts (project + year +
  overlapping date range + shared spend type).
- **Current behavior differs (documented as a known issue, not implemented in 7A-1):** the bulk
  import path (`handlePoolBulkUpload()` and `_confirmPoolImport()`, `views/budget.js`, around lines
  `2568-2680+`) performs its own inline duplicate and conflict checks instead of delegating to
  `validateBudgetPoolChange()`. Field-level required/range validation for bulk-imported rows has not
  been confirmed to match `validateBudgetPoolRecord()` exactly.
- Contract for a later implementation phase: unify bulk import onto the same shared validation
  function used by manual add/edit, with no bypass path. Do not implement this in Phase 7A-1.
- **Amendment (Phase 7A-9E, business rule update):** the "overlap conflicts (project + year +
  overlapping date range + shared spend type)" clause above is superseded. Overlapping Budget Pools
  (same Project + Spend Type + Period) are now an explicitly allowed, intentional PMO workflow —
  PMO may create multiple buckets for the same project/type/period to separate budget purposes.
  Overlap is no longer validated as a blocking error in either manual add/edit
  (`saveBudgetPool()`) or bulk import (`validateBudgetPoolImportBatch()`); only exact duplicate
  business identity (§1/§7: Project + Pool Name + Year) remains blocked. `validateBudgetPoolChange()`
  still computes `conflicts` (informational only, never surfaced as an error). This does not change
  automatic mapping (§5): an Actual Spend record matching more than one pool still resolves to
  `Needs PMO Review`, never an auto-pick.

## 9. Deleted / Orphaned Pools

- Contract and current behavior already agree on canonical Actual Spend: `deleteBudgetPool()`
  (`views/budget.js:2819+`) calls `budgetPoolDeletionBlockers()` (`app.js:295-296`), which finds any
  canonical Actual Spend record whose `getFinalBudgetPoolId()` equals the pool id and blocks
  deletion if any exist.
- **Known risk (documented, not fixed in 7A-1):** Memo objects carry their own legacy
  `budgetPoolId`-style field, separate from canonical Actual Spend, used by the PMO manual
  Budget-Pool-tagging modal on a Memo (see `views/history.js`, e.g. around lines `915`, `1003`,
  `1024`, `1079`). `budgetPoolDeletionBlockers()` only inspects canonical Actual Spend records — it
  does not check these memo-level references. A pool could theoretically be deleted while a Memo
  still references it, leaving an orphaned reference outside canonical Actual Spend.
- This must be reviewed in a later implementation phase. Do not change the deletion guard in
  Phase 7A-1.

## 10. Forecast

- Confirmed independent and must remain so through Phase 7A: `calculateForecast()`
  (`app.js`, around lines `458-501`) filters Actual Spend by `spendType` in `{Software, Infra}` and
  coverage status only. It never reads `finalBudgetPoolId`, `autoBudgetPoolId`,
  `manualBudgetPoolId`, or any Budget Pool table.
- Forecast must not be changed in Phase 7A-1, and no future Phase 7A sub-phase may introduce a
  Budget Pool dependency into Forecast. That remains reserved for Phase 8 per
  `05_PHASE_HISTORY.md`.

## 11. Overview BvA

- **Known issue, confirmed by code (not fixed in 7A-1):** the Overview tab's embedded budget
  figures use a separate legacy store, `loadSLBudgets()` (`views/budget.js:1543-1549`), not the
  canonical Budget Pool table. Specifically:
  - `_ovUpdateKPIs()` (`views/budget.js:841-858`) computes the Overview "Budget" KPI from
    `loadSLBudgets()[year][project]`, not from `loadBudgetPoolRecords()` /
    `calculateBudgetVsActualDataset()`.
  - `_ovRenderBvA()` (`views/budget.js:1013` onward, using `slBudgets` at `1023`/`1043`) renders
    Overview's embedded budget-vs-actual comparison from the same legacy `loadSLBudgets()` source.
  - This is distinct from the dedicated Budget vs Actual tab, which already consumes the canonical
    `calculateBudgetVsActualDataset()` pipeline (per `CHANGELOG.md` Phase 6/7 history).
  - As a result, Overview's budget figures may not reconcile with the canonical Budget vs Actual
    tab for the same project/year.
- Do not fix Overview in Phase 7A-1. This is recorded here so Phase 7A-2+ (or a dedicated Overview
  parity phase) does not have to rediscover it.

## 12. Supabase Schema

- No Supabase schema change is made or planned in Phase 7A-1.
- Before any Budget Pool or Infra-related schema migration in a later sub-phase, a live schema
  audit of the deployed Supabase tables (`budget_pools`, `memos`, `infra_costs`, and related) is
  required, per the unresolved blocker already recorded in `PHASE_PLAN.md` ("Current
  Blockers / Decisions Required"). Do not assume the local JS model's shape matches the deployed
  schema.

## 13. Dead Code / Duplicate Mapping Paths

- The duplicate bulk-import validation/mapping logic described in §7 and §8 is confirmed dead-weight
  relative to the shared validator, but it is **not** to be removed in Phase 7A-1 or any phase
  before tests exist that pin bulk import's current and desired behavior.
- Contract: clean up duplicate mapping/validation code only after Phase 7A-2 (or later) adds test
  coverage proving the unified behavior is correct; never delete first and verify after.

---

## Phase 7A-1 Scope Boundary

Explicitly out of scope for this documentation-only sub-phase (deferred to later Phase 7A
sub-phases or later phases per `05_PHASE_HISTORY.md`):

- Year normalization implementation (§2)
- Budget vs Actual calculation fixes
- Budget Pool bulk import validation unification (§7, §8)
- Manual override plausibility warnings (§4)
- Tag Budget modal changes
- Overview BvA fix (§11)
- Forecast changes (§10)
- Budget Settings UX changes
- Supabase migrations (§12)
- Dead-code cleanup (§13)
- Any test changes

No application logic, UI, tests, or Supabase migrations were modified to produce this section.
