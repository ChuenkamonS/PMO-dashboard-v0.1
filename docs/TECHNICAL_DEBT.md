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

Still OPEN: Budget Pool import still does not derive year (bulk import untouched this phase),
existing pools are not audited/migrated, and no regression test yet proves zero mismatched legacy
pools remain in real data.

---

# TD-7A-02

Title

Duplicate Budget Pool Matching Logic

Status

OPEN

Priority

Medium

Owner Phase

Tag Budget Canonicalization

Current Situation

Budget matching exists in two implementations.

Canonical

app.js

- findMatchingBudgetPools()
- mapBudgetPool()

Legacy

views/history.js

- matchMemoToPool()

Risk

UI preview may disagree with canonical mapping.

Exit Criteria

- Tag Budget modal uses canonical mapping only.
- matchMemoToPool() removed.
- Regression tests pass.

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

OPEN

Priority

Medium

Owner Phase

Budget Pool Validation

Current Situation

Bulk import bypasses

validateBudgetPoolChange()

Risk

Duplicate pools
Invalid pools
Inconsistent validation

Exit Criteria

Bulk import uses the same validation as manual create/edit.

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

# Before Release Checklist

Review every OPEN Technical Debt.

Each item must be

- closed

or

- explicitly accepted.

No workaround should remain undocumented.
