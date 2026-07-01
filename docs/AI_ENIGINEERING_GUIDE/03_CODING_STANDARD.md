# AI Coding Standard

Version: 1.0

---

# Purpose

This document defines how AI agents must modify the PMO Dashboard codebase.

It does NOT explain business rules.

It explains engineering discipline.

The goal is:

- small changes
- predictable behavior
- low regression risk
- maintainable history
- minimal review effort

---

# Core Philosophy

The PMO Dashboard is an evolving production system.

The objective is NOT to write the cleanest code.

The objective is to safely evolve the existing system.

Correctness is more important than elegance.

Predictability is more important than cleverness.

Backward compatibility is more important than optimization.

---

# AI Role

An AI working on this repository is an implementation engineer.

It is NOT:

- Product Manager
- Architect (unless explicitly requested)
- Refactoring tool
- Code beautifier
- Optimizer

The AI's responsibility is to implement exactly the requested scope.

Nothing more.

Nothing less.

---

# Mandatory Workflow

Every implementation must follow this sequence.

## Step 1

Read required documents.

Never begin coding immediately.

---

## Step 2

Understand the current implementation.

Never assume.

Never guess.

Read the existing code first.

---

## Step 3

Compare implementation against requirements.

Identify:

- missing behavior
- existing behavior
- compatibility concerns

---

## Step 4

Create a small implementation plan.

List:

- files to modify
- expected changes
- risks

Only after this may implementation begin.

---

## Step 5

Implement.

Only modify approved files.

---

## Step 6

Run tests.

Behavioral tests first.

Regression tests second.

---

## Step 7

Report results.

---

# Scope Discipline

One task.

One phase.

One responsibility.

If the prompt requests:

```
Actual Spend
```

Do not modify:

Forecast

Budget vs Actual

Budget Settings

Import

Export

Authentication

Permissions

unless explicitly instructed.

---

# Phase Discipline

Never implement future phases.

If Phase 6 is requested,

do not implement Phase 7.

If Phase 7 is requested,

do not prepare Phase 8.

Only complete the current phase.

---

# Small Changes

Prefer:

small

localized

predictable

changes.

Avoid:

large

cross-cutting

refactors.

---

# Refactoring Rules

Do NOT refactor unless explicitly requested.

Never refactor because:

"this looks cleaner"

"this is more modern"

"I found a better abstraction"

Those are not requirements.

---

# Existing Code

Respect existing architecture.

Reuse existing helpers.

Follow existing conventions.

Do not introduce new patterns without justification.

---

# File Boundaries

Before implementation,

identify every file that will change.

Do not modify additional files without explaining why.

Unexpected file modifications are considered regressions.

---

# Naming

Do not rename:

functions

variables

fields

IDs

keys

unless explicitly required.

Renaming increases regression risk.

---

# Financial Safety

Any change affecting:

Amount

Coverage

Forecast

Budget

Actual

Totals

requires behavioral verification.

Never assume financial correctness.

Always verify.

---

# Backward Compatibility

Always preserve:

existing records

legacy imports

legacy exports

legacy settings

legacy calculations

Never require manual repair.

Never silently change existing behavior.

---

# Existing Bugs

Do not fix unrelated bugs.

Report them.

Only fix them if explicitly requested.

---

# Architecture

Respect current architecture.

Do not redesign:

reconciliation

canonical projection

Budget Pool

Forecast

unless requested.

---

# UI

UI improvements must not change business logic.

Business logic improvements must not silently change UI behavior.

Keep concerns separate.

---

# Performance

Do not optimize without evidence.

Readability and correctness come first.

---

# Tests

Behavioral tests are preferred.

Tests should verify:

observable behavior

not implementation details.

Avoid fragile implementation-specific assertions.

---

# Regression Checklist

Before finishing,

verify:

✓ Existing totals unchanged

✓ Existing exports unchanged

✓ Existing imports unchanged

✓ Existing reports unchanged

✓ Existing filters unchanged

✓ Existing search unchanged

✓ Existing charts unchanged

✓ Existing IDs unchanged

✓ Existing contracts unchanged

---

# Definition of Done

A task is complete only when:

Requirement implemented

Backward compatibility preserved

Behavioral tests updated

Regression tests pass

Scope respected

No unrelated changes introduced

Documentation updated if required

---

# Things AI Must Never Say

"I fixed this while I was there."

"I also cleaned up..."

"I modernized..."

"I simplified..."

"I renamed..."

"I optimized..."

None of these are valid unless requested.

---

# Things AI Should Say

"I found an unrelated issue but did not modify it."

"This is outside the requested scope."

"I recommend addressing this in a future phase."

"This change would affect Forecast and was intentionally not made."

These statements reduce unnecessary regressions.

---

# Final Rule

The best implementation is not the one that changes the most.

It is the one that delivers the requested feature

while leaving the rest of the system untouched.
