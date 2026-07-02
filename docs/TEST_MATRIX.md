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
