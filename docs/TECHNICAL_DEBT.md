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

# Before Release Checklist

Review every OPEN Technical Debt.

Each item must be

- closed

or

- explicitly accepted.

No workaround should remain undocumented.
