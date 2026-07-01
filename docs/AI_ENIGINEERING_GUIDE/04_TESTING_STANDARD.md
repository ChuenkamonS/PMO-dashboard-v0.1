# /docs/AI_ENGINEERING_GUIDE/04_TESTING_STANDARD.md

# AI Testing & Validation Standard

Version: 1.0

---

# Purpose

This document defines how every AI agent validates changes before considering a task complete.

The objective is to prevent regressions.

Passing tests alone does not mean the implementation is correct.

Behavior must also remain correct.

---

# Testing Philosophy

Every change should answer two questions:

1.

Did the requested feature work?

2.

Did anything else stop working?

Both questions are equally important.

---

# Testing Priority

Always test in this order.

## Level 1

Behavior

Does the application behave correctly?

Highest priority.

---

## Level 2

Business Rules

Does the implementation still satisfy all financial rules?

---

## Level 3

Regression

Did unrelated features remain unchanged?

---

## Level 4

Implementation

Only verify internal implementation when necessary.

Avoid implementation-specific tests whenever behavioral tests are sufficient.

---

# Financial Validation

Every financial change must verify:

✓ Amount

✓ Coverage

✓ Totals

✓ Parent-child relationships

✓ Budget values

✓ Forecast values

✓ BvA values

Financial correctness always overrides implementation elegance.

---

# Canonical Data Validation

Whenever canonical data changes, verify:

Report

Report Detail

Overview KPI

Overview Charts

Forecast

Budget vs Actual

Export

All consumers should observe the same canonical behavior.

---

# Phase Validation

Every phase should verify:

Current phase requirements implemented.

Previous phases still pass.

Future phases not accidentally implemented.

Scope remains unchanged.

---

# Regression Checklist

Before marking PASS verify:

Existing calculations unchanged.

Existing reports unchanged.

Existing exports unchanged.

Existing imports unchanged.

Existing search unchanged.

Existing filters unchanged.

Existing charts unchanged.

Existing IDs unchanged.

Existing persistence unchanged.

Backward compatibility preserved.

---

# Behavioral Test Principles

Prefer:

"Given

When

Then"

Examples:

Given a Software memo with two lines

When approved

Then exactly one Actual Spend record exists.

Not:

Function X returned array length two.

Behavior first.

---

# Financial Equality Tests

Verify:

Memo Total

=

Actual Spend Amount

Report Total

=

Actual Spend Total

Forecast Total

=

Expected Total

Budget vs Actual

Actual

=

Actual Spend

Never allow hidden drift.

---

# Backward Compatibility Tests

Always test:

Legacy records

Legacy imports

Legacy exports

Legacy settings

Missing optional fields

Malformed optional fields

Unexpected null values

---

# Edge Cases

Every feature should consider:

Empty dataset

Single record

Multiple records

Duplicate records

Deleted records

Legacy records

Missing references

Wrong year

Wrong project

Malformed values

Unknown values

Null values

---

# AI Validation Workflow

Before returning PASS:

1.

Read requirements again.

2.

Compare implementation.

3.

Review changed files.

4.

Run tests.

5.

Review regression risks.

6.

Review scope.

7.

Review backward compatibility.

Only then return PASS.

---

# Required Return Format

Every implementation should report:

PASS / FAIL

Files modified

Summary

Tests added

Tests updated

Tests executed

Manual testing checklist

Remaining issues

Technical debt left unchanged

---

# Automatic Failure Conditions

Return FAIL if:

Tests fail.

Financial totals changed unexpectedly.

Backward compatibility broken.

Requirements incomplete.

Scope exceeded.

Unrelated modules modified without justification.

---

# Golden Rule

A feature is NOT complete because tests pass.

A feature is complete only when:

Requirements are satisfied.

Business rules remain correct.

Regression risk is acceptable.

Scope is respected.

The rest of the application behaves exactly as before.
