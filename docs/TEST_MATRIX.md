# PMO Dashboard — Testing Strategy & Regression Matrix

## Purpose

This document defines the testing rules for the PMO Dashboard project.

It is used to:

- prevent regressions
- reduce manual QA effort
- standardize AI-assisted development
- make every feature testable before release

A feature is not complete until the required tests pass.

---

## Testing Layers

Every feature should be tested in four layers.

```text
Unit Tests
  ↓
Integration Tests
  ↓
End-to-End / UI Validation
  ↓
Manual Smoke Test
```

---

## Layer 1 — Unit Tests

Purpose: verify isolated business logic.

Use for:

- calculations
- validation
- normalization
- matching
- formatting
- BE/Gregorian conversion
- data contract behavior

Examples:

- `createBudgetPoolRecord()`
- `normalizeMonthValueToGregorian()`
- `calculateBudgetVsActualDataset()`
- `calculateForecast()`

Requirements:

- deterministic
- no browser dependency
- no manual setup
- must cover happy and negative cases

Target: 100% automated.

---

## Layer 2 — Integration Tests

Purpose: verify complete feature behavior across functions.

Examples:

```text
Create Budget Pool
  ↓
Save
  ↓
Reload
  ↓
Filter
  ↓
Export
```

```text
Actual Spend
  ↓
Budget Matching
  ↓
Budget vs Actual
  ↓
Manual Override
```

Use for:

- save/load behavior
- filtering
- exports
- assignment flows
- Budget vs Actual consistency
- cross-feature regression

Target: mostly automated.

---

## Layer 3 — End-to-End / UI Validation

Purpose: verify the actual application experience.

Examples:

```text
Open app
  ↓
Click Add Pool
  ↓
Fill form
  ↓
Save
  ↓
Verify UI
```

Recommended future tools:

- Playwright
- Cypress

Use only for critical user journeys. Do not replace unit and integration tests with E2E tests.

---

## Layer 4 — Manual Smoke Test

Purpose: quick human verification after automated tests pass.

Manual smoke testing should focus on:

- page loads
- no console errors
- layout not broken
- key buttons work
- major flows still usable
- export/download still works

Manual testing should not be the main way to validate business logic.

Target duration: 5–10 minutes per phase.

---

## Required Test Categories

Every feature must consider these categories.

| Category | Required |
|---|---:|
| Happy path | Yes |
| Negative path | Yes |
| Boundary value | Yes |
| Regression | Yes |
| UI consistency | When UI changes |
| Export/import consistency | When relevant |
| Performance | For large data or expensive flows |
| Accessibility | For major user-facing screens |

---

## Regression Rule

Every fixed bug must have a regression test.

If a bug was found manually, add an automated test that fails before the fix and passes after the fix.

A bug is not considered fully fixed until the regression test exists.

---

## AI Development Rule

Before implementation, AI must review:

1. existing architecture
2. data contract
3. reusable helpers/components
4. edge cases
5. regression risk
6. required tests

AI should not create parallel logic when shared logic already exists.

Preferred solution:

> Smallest safe change that satisfies the requirement and preserves the existing architecture.

---

## AI Testing Rule

Every AI-assisted implementation must return:

1. files modified
2. summary of changes
3. tests added or updated
4. exact test commands run
5. pass/fail result
6. manual testing checklist
7. remaining issues or deferred items

Existing tests must continue passing.

---

# Feature Regression Matrix

## Budget Pool

### Unit Tests

Required coverage:

- Budget Pool canonicalization
- BE/Gregorian normalization
- `startMonth` / `endMonth` validation
- `year` derivation from `startMonth`
- duplicate/overlap validation when implemented
- active/archive/delete behavior when implemented

### Integration Tests

Required coverage:

- create pool
- edit pool
- save/reload pool
- filter by year
- filter by project
- Budget vs Actual matching
- export consistency

### Regression Cases

Must cover:

- BE month input such as `2569-01`
- CE month input such as `2026-01`
- legacy bad data where raw `year` disagrees with `startMonth`
- `2569-01` must not become `3112`
- Budget Settings filter must use canonical year
- Budget Pool save must not persist stale independent year

---

## Budget vs Actual

### Unit Tests

Required coverage:

- Budget KPI
- Actual KPI
- Forecast KPI
- Variance KPI
- utilization
- matching logic
- canonical filtered dataset

### Integration Tests

Required coverage:

- project filter
- spend type filter
- year/period filter
- search
- drill-down
- assignment workspace
- manual override
- Needs PMO Review
- Unbudgeted
- export

### Regression Cases

Must cover:

- KPI totals match table totals
- chart/donut totals match KPI where applicable
- export matches visible filtered UI
- Budget Pool row drill-down matches selected pool
- Unbudgeted and Needs PMO Review do not disappear behind wrong empty states

---

## Actual Spend

### Unit Tests

Required coverage:

- actual spend normalization
- manual spend record creation
- import row parsing
- amount calculation
- spend type mapping

### Integration Tests

Required coverage:

- import actual spend
- add manual actual spend
- edit manual actual spend
- delete/manual remove if applicable
- Budget Pool matching
- Budget vs Actual impact

### Regression Cases

Must cover:

- manual spend displays in canonical Actual Spend
- memo-created spend and manual spend use the same projection
- filters update KPI/table/export consistently

---

## Forecast

### Unit Tests

Required coverage:

- monthly forecast calculation
- coverage month logic
- actual vs forecast month separation
- remaining budget

### Integration Tests

Required coverage:

- Forecast table
- Forecast export
- relationship with Actual Spend
- relationship with Budget Pool where applicable

### Regression Cases

Must cover:

- actual months remain coverage-bound
- forecast months continue after coverage when required
- UI and export use the same dataset

---

## Memo

### Unit Tests

Required coverage:

- memo total calculation
- memo type mapping
- required field validation
- approval status transitions

### Integration Tests

Required coverage:

- create memo
- approve memo
- reject memo
- history listing
- actual spend projection after approval

### Regression Cases

Must cover:

- approved memo creates expected spend projection
- rejected memo does not affect spend
- memo type maps correctly to spend type

---

## History

### Integration Tests

Required coverage:

- status filter
- project filter
- type filter
- date filter
- export
- budget tagging modal

### Regression Cases

Must cover:

- Budget Tag modal uses correct pool year
- completed memo tagging does not corrupt Actual Spend or BvA

---

## License Management

### Unit Tests

Required coverage:

- `parseLicenseFromMemo` — memo → license line-item derivation (slItems JSON preferred over HTML
  fallback), unique `id` per line item even when name/plan/coverage collide across lines
- `parseLicenseFromMemo` expiry math — `start` normalized to day 1 of month before
  `setMonth(+months)` (prevents Jan 31 + 1mo rolling into March instead of Feb)
- `getAllLicenses` — memo-derived + manual merge, manual records override memo-derived on id
  collision
- `getLicenseStatus` — Active / Expiring (≤7/≤15/≤30d) / Expired / Cancelled (`statusOverride`)
  classification and day-count math
- `licReviewDefaultStatus` / `licReviewStatusForMemo` — grandfather cutoff
  (`LIC_REVIEW_ROLLOUT_AT = 2026-07-03T00:00:00Z`): pre-cutoff memo defaults to `approved`,
  post-cutoff defaults to `pending`; explicit review record always wins over the default
- `computeLicUserMappingData` — pending memos excluded from mapping + added to queue; rejected
  memos excluded from both; voided memos excluded from both; manual/imported rows appended
  independent of Review Queue status; memos without an account table never enter either
- `_ovIsActive` — normalizes legacy plain-boolean override vs. new `{active, licenseId}` shape
- `_licAssignableIdentities` — widens assignable software universe to full License Inventory (memo
  + manual + imported); `"Name — Plan"` used only when a name has more than one distinct plan;
  cancelled licenses excluded
- `_resolveInventoryIdentity` — resolves an identity to an inventory record, preferring pinned
  `licenseId`, then group's own project, then project-less record, then any match; never resolves
  cancelled records
- `_licSeatsByProjectSoftwarePlan` — Purchased Seats aggregation by (project, name, plan), excluding
  cancelled
- `_bpComputeMatrix` — License Summary matrix aggregation (shared by on-screen render and
  `exportLicSummaryCSV`)
- `computeLicReconciliation` — Purchased/Assigned/Remaining join across inventory + effective
  (post-Review-Queue, post-override) assignments; same-project duplicate memo grant counted once
  per user; Over Assigned flag when `remaining < 0`
- `_parseCSVText` / `_parseAssignmentImportFile` — RFC4180-ish CSV parsing and template-header
  mapping
- `computeAssignmentImportPreview` — validation/matching: missing/invalid fields rejected; no
  inventory match rejected; blank Plan + single matching plan valid; blank Plan + multiple plans
  ambiguous; explicit Plan disambiguates; duplicate row flagged; cross-project match requires
  Project; cancelled inventory excluded, expired inventory NOT excluded
- `applyAssignmentImport` — writes `{active:true, licenseId, source:'import', importedAt}`
  overrides + ensures manual `(email, project)` row exists; idempotent on re-apply
- `_buildLicUserGroups` / `_licActiveForGroup` / `_licUserAssignmentDetail` /
  `_licAssignmentSourceLabel` / `_licChipsForUser` — user-centric grouping, effective active-license
  resolution, chip merge (same Software+Plan across memos/projects merges; distinct Plans stay
  separate)
- `_licUsrComputeKpis` — Users tab KPI aggregation, same active-license computation as the table
- `importLicenses()` (`views/bulk_import.js`) — `licenseKey(l)` composite identity includes
  `project` (two records with same Software+Plan+dates but different Project must not collide)

### Integration Tests

Required coverage:

- License Index: metrics, Search + Status + Project multi-select filters (AND logic), sort, Load
  More pagination, Add/Edit/Delete manual license
- License Summary: Summary vs Reconciliation sub-tabs, Project/Software/Plan filters apply to both,
  Year/Status filters apply to Summary only, sticky Software/Plan/Total columns, export matches UI
- Reconciliation: Purchased/Assigned/Remaining table, "Over Assigned only"/"Has Remaining only"
  filters, Assigned Users drill-down (read-only, never mutates state), export matches UI
- Reconciliation → Users deep link: "View in Users tab" only when `assignedCount > 0`; context
  banner; "Back to Reconciliation" clears the deep-link filter; existing Search still layers on top
- PMO Review Queue: empty-state rendering; View Memo / Approve / Reject; audit entries written on
  every action
- Users tab (Manage Licenses): user-centric table, compact chip preview, single "Manage Licenses"
  action grouping Current Licenses vs "+ Add Manual License" by Project, realtime search, scrollable
  options with fixed Save/Cancel
- Users tab filters: Search + Project multi-select + Software multi-select combine with AND logic;
  KPI cards track the current filter; empty state when filters exclude everyone
- `exportUserLicensesCSV` — exact User × (Software — Plan) matrix, exports only the currently
  visible filtered rows, never recomputes independently
- Assignment Import: Download Template → Import CSV → preview modal → Confirm writes overrides
- Historical License Inventory Import (bulk Excel via `importLicenses()`): distinct Project creates
  a separate record; exact duplicate collapses; re-import of the same key updates in place
- Other Subscription tab: License Type/Project/Status multi-select filters, Add/Edit/Delete
- Exports must match UI per MASTER_SPEC export rule: `exportLicenseCSV`, `exportUserLicensesCSV`,
  `exportLicSummaryCSV`, `exportLicReconciliationCSV`

### Regression Cases

Must cover:

- Grandfather rule: pre-cutoff approved SL memo's account list is visible in User Mapping by
  default with zero review action; post-cutoff appears in the Review Queue and is excluded from
  User Mapping until reviewed
- Approving a queued item moves it to User Mapping; rejecting keeps it out of both User Mapping and
  the queue; rejecting a memo never touches the separate manual override store
- A Voided License memo stays excluded from both User Mapping and the Review Queue
- Approve/Reject write an audit entry with the correct shape; Reject requires and stores a reason;
  cancelling the reject prompt leaves review status unchanged
- `parseLicenseFromMemo`: duplicate-named line items in one memo retain distinct ids; missing/
  invalid `startMonth` must not let `Date.setMonth()` overflow the expiry into the next month
- License Index's Load More control (`#license-load-more`) must actually exist in the rendered DOM
- Manage Licenses: Current Licenses must not show Purchased/Assigned/Remaining; "+ Add Manual
  License" shows Plan only, grouped by Project; single-project user renders a flat list
- A manual license (never referenced by any memo) still appears in the assignable list; an imported
  record participates identically to a hand-entered manual one
- Legacy plain-boolean overrides continue to work end-to-end with no migration; the new
  `{active, licenseId}` shape pins the exact inventory record for unambiguous resolution
- Reconciliation stays correct when the same user has a duplicate grant across memos for the same
  project (counted once, not twice); Over Assigned flags correctly
- Assignment Import: blank Plan matches only when exactly one plan exists; same software in
  different Projects requires Project to disambiguate; duplicate row in one file is flagged, not
  double-counted; re-applying the same valid row does not double-count
- An imported assignment appears for a user with no memo account-table row at all, affects
  Reconciliation counts, does not block on Review Queue status, and is labeled "Import"
- Historical License Inventory Import: Project is part of the dedup identity key — two rows with
  identical Software+Plan+dates but different Project must create two separate records
- Users tab: Search + Project + Software filters combine with AND logic (not OR); opening Manage
  Licenses, saving, and returning preserves filter state with no full-tab re-render
- License Summary matrix totals are unchanged by the filter machinery when no filter is applied
  (regression control); Software/Plan/Total columns stay frozen while Project columns scroll

### Known Gaps (deferred — do not regression-test as fixed)

- Manual override edits via "Edit licenses" write no audit entry (`TD-M3A-01`)
- After Reject, there is no in-app "Add user" affordance to manually re-grant a user (`TD-AUDIT-04`)
- "+ Add Manual License" only lists software already known from some approved SL memo — no
  free-text entry (`TD-LIC-USR-01`)
- Assignment Import is CSV-only; no per-import batch/actor metadata (`TD-PHASE2B-01`)

---

## Settings

### Integration Tests

Required coverage:

- project settings
- project dropdown refresh
- spend type settings if applicable
- user/approver settings if applicable

### Regression Cases

Must cover:

- Budget Pool project dropdown uses canonical project list
- changing project settings updates relevant dropdowns
- no dead dropdown references break refresh logic

---

## Import / Bulk Upload

### Unit Tests

Required coverage:

- row parsing
- required columns
- BE/Gregorian normalization
- amount parsing
- invalid row detection

### Integration Tests

Required coverage:

- valid import
- invalid import
- partial failure handling
- duplicate handling
- rollback/commit behavior if applicable

### Regression Cases

Must cover:

- Budget Pool bulk import must not persist stale year values
- Start Month / End Month must agree with derived Budget Year
- invalid rows must not corrupt existing data

---

## Export

### Integration Tests

Required coverage:

- exported rows match visible filtered UI
- column names are stable
- currency formatting is correct
- totals match UI

### Regression Cases

Must cover:

- Budget vs Actual export matches KPI/table
- Budget Pool export uses canonical year
- export fallback must not use stale raw data

---

# Phase Completion Checklist

Before any phase is marked complete, verify:

- [ ] requirements implemented
- [ ] data contract preserved
- [ ] unit tests added/updated
- [ ] integration tests added/updated
- [ ] regression tests added for every bug fixed
- [ ] existing tests pass
- [ ] manual smoke test completed
- [ ] documentation updated if behavior changed
- [ ] remaining issues documented

---

# Standard Test Commands

Use the project’s current test runner.

Current command:

```bash
node --test tests/*.test.js
```

If the local shell does not have `node` on PATH, use the available local binary and report the exact command used.

---

# Definition of Done

A feature is complete only when:

1. implementation matches the approved requirement
2. no out-of-scope behavior was changed
3. automated tests pass
4. regression tests cover fixed bugs
5. manual smoke test passes
6. remaining issues are documented

If any item is missing, status is:

```text
NOT COMPLETE
```

---

# Maintenance Rule

This file is a living document.

When a new feature, bug, or workflow is added, update this matrix instead of creating a separate testing standard.
