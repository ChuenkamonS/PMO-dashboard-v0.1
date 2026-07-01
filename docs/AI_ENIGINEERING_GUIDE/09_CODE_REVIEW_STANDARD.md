# AI Code Review Standard

Version: 1.0

---

# Purpose

This document defines the mandatory review process that every AI must perform before returning a completed implementation.

Implementation is not finished when the code compiles.

Implementation is finished only after architecture, business rules, regression risk, and scope have been reviewed.

---

# Core Principle

Every AI must act as two separate engineers.

Engineer 1

Implements the requested feature.

↓

Engineer 2

Reviews the implementation as if reviewing another developer's Pull Request.

Never skip the second role.

---

# Review Workflow

Every implementation must complete the following sequence.

Requirement Review

↓

Architecture Review

↓

Business Rule Review

↓

Financial Review

↓

Regression Review

↓

Testing Review

↓

Scope Review

↓

Return

---

# Requirement Review

Verify:

✓ Every requested requirement is implemented.

✓ No requested requirement is missing.

✓ No additional requirement was implemented.

✓ No assumptions were introduced.

Questions:

Did I implement exactly what was requested?

Did I accidentally solve another problem?

---

# Architecture Review

Verify:

✓ Existing architecture preserved.

✓ No ownership moved.

✓ No duplicated responsibilities created.

✓ Canonical data still consumed correctly.

✓ No upstream reconstruction introduced.

Questions:

Did I move business logic?

Did I duplicate business logic?

Did I introduce a second source of truth?

---

# Financial Review

Every financial implementation must verify:

✓ Parent Amount unchanged.

✓ No double counting.

✓ Coverage unchanged unless required.

✓ Forecast totals unchanged unless required.

✓ BvA totals unchanged unless required.

✓ Report totals unchanged unless required.

✓ Export totals unchanged unless required.

Questions:

Could this implementation silently change money?

If yes,

FAIL.

---

# Data Ownership Review

Verify ownership remains correct.

Memo

Owns Memo.

Manual Entries

Owns Manual persistence.

Budget Pool

Owns mapping.

Forecast

Owns projection.

Report

Owns presentation.

Questions:

Did I accidentally make one module own another module's data?

---

# Canonical Review

Verify:

Consumers read canonical data.

Consumers do not recreate canonical data.

Consumers do not parse Memo.

Consumers do not parse HTML.

Questions:

Am I consuming canonical data?

Or recreating it?

---

# Scope Review

Verify:

Only requested modules changed.

Only approved files modified.

Future phases untouched.

Past phases preserved.

Questions:

Did I touch another phase?

Did I refactor while implementing?

Did I improve unrelated code?

If yes,

remove it.

---

# File Review

Before returning:

List every modified file.

For every file answer:

Why was it modified?

Could this change have been avoided?

Unexpected files require justification.

---

# Business Rule Review

Review every changed business rule.

If any business rule changed unexpectedly,

FAIL.

Business rules must never drift accidentally.

---

# Backward Compatibility Review

Verify:

Legacy records still load.

Legacy imports still work.

Legacy exports still work.

Optional fields remain optional.

Missing fields remain safe.

No production repair required.

---

# Testing Review

Behavioral tests

↓

Regression tests

↓

Edge cases

↓

Legacy cases

↓

Manual testing

Never rely only on unit tests.

---

# Edge Case Review

Review:

Empty data

Null values

Legacy records

Malformed records

Duplicate records

Wrong year

Wrong project

Deleted references

Unexpected values

Missing optional fields

---

# Phase Review

Verify:

Current phase complete.

Future phase untouched.

Roadmap respected.

Architecture preserved.

---

# Review Checklist

Before returning PASS verify:

✓ Requirements complete

✓ Scope respected

✓ Architecture preserved

✓ Financial rules preserved

✓ Business rules preserved

✓ Canonical model preserved

✓ Tests pass

✓ Regression risk acceptable

✓ Documentation updated (if required)

---

# Mandatory Return Format

Every implementation must return:

PASS / FAIL

Files Modified

Summary

Tests Added

Tests Updated

Tests Executed

Manual Testing Checklist

Remaining Issues

Technical Debt Left Unchanged

Known Risks

Out-of-Scope Findings

Never return only "Done."

---

# Automatic FAIL Conditions

Return FAIL if any of the following occur:

A requested feature is incomplete.

Financial totals changed unexpectedly.

Business rules changed unexpectedly.

Backward compatibility broken.

Scope exceeded.

Unrelated modules modified.

Architecture changed without approval.

Tests failing.

Requirements uncertain.

When uncertain,

report uncertainty.

Never guess.

---

# AI Self Questions

Before finishing ask:

Did I implement only the requested feature?

Did I preserve architecture?

Did I preserve business rules?

Did I preserve financial correctness?

Did I preserve backward compatibility?

Did I accidentally optimize?

Did I refactor?

Did I touch another phase?

Did I duplicate logic?

Did I guess requirements?

If any answer is YES,

review again.

---

# Final Principle

Good code is not enough.

The implementation must also be:

Correct.

Reviewable.

Maintainable.

Backward compatible.

Architecturally consistent.

Financially accurate.

Only then should the AI return PASS.
