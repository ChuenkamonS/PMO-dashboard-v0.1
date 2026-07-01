# Known AI Mistakes

Version: 1.0

---

# Purpose

This document records mistakes commonly made by AI assistants while working on the PMO Dashboard.

These mistakes have already occurred during previous implementation phases or are known high-risk behaviors.

Every AI must read this document before implementing changes.

The objective is to reduce regressions, unnecessary refactoring, and architectural drift.

---

# Core Principle

AI should never assume that "better code" is better software.

The PMO Dashboard values:

1. Correct business behavior
2. Financial correctness
3. Stability
4. Backward compatibility

above elegance.

---

# Mistake 1

## Expanding Scope

Example

User requests:

Fix Actual Spend.

AI modifies:

Forecast

Budget Settings

Export

Import

Tests

Refactors helpers

Problem

Large regression risk.

Rule

Implement only the requested scope.

Report unrelated findings.

Do not fix them.

---

# Mistake 2

## Implementing Future Phases

Example

While implementing Phase 5,

AI also implements Phase 6.

Or while implementing Budget vs Actual,

AI redesigns Forecast.

Problem

Roadmap becomes inconsistent.

Regression risk increases.

Rule

Never implement future phases.

Complete one phase.

Close it.

Move forward.

---

# Mistake 3

## Refactoring Without Permission

Example

"I simplified..."

"I modernized..."

"I extracted helpers..."

"I renamed functions..."

Problem

Huge review effort.

Higher regression probability.

Rule

Never refactor unless explicitly requested.

---

# Mistake 4

## Touching Unrelated Files

Example

Requirement affects:

app.js

AI modifies:

10 additional files.

Problem

Review becomes difficult.

Unexpected regressions.

Rule

List target files before coding.

Modify only those files.

---

# Mistake 5

## Reconstructing Canonical Data

Example

Forecast reads

memo.sections

or

memo.slItems

instead of canonical Actual Spend.

Problem

Business rules become duplicated.

Future changes become inconsistent.

Rule

Consume canonical data whenever available.

Never recreate upstream information.

---

# Mistake 6

## Double Counting

Example

Parent Amount

+

detailLines

both contribute to totals.

Problem

Financial totals become incorrect.

Rule

detailLines explain amount.

They never create additional financial value.

---

# Mistake 7

## Breaking One Memo Rule

Example

One Software memo

↓

Multiple Actual Spend records.

Problem

Report

Forecast

Budget vs Actual

all become inconsistent.

Rule

One Memo

=

One Actual Spend record.

Always.

---

# Mistake 8

## Ignoring Legacy Records

Example

Implementation assumes every record has the latest fields.

Problem

Older production data fails.

Rule

Optional fields must remain optional.

Missing values must load safely.

---

# Mistake 9

## Changing Financial Totals

Example

Small UI improvement.

Unexpected total changes.

Problem

Users lose trust.

Rule

UI improvements must never change financial values.

---

# Mistake 10

## Guessing Business Rules

Example

"This looks more logical..."

Problem

Business logic changes without approval.

Rule

If a rule is unclear:

Stop.

Report.

Do not invent.

---

# Mistake 11

## Parsing HTML

Example

Reading

memo.sections.html

to rebuild business objects.

Problem

HTML is presentation.

Not business data.

Rule

Never parse HTML when structured canonical data exists.

---

# Mistake 12

## Optimizing Prematurely

Example

Replacing existing logic because it is "cleaner."

Problem

Risk exceeds benefit.

Rule

Correctness first.

Optimization only when requested.

---

# Mistake 13

## Renaming Stable Contracts

Example

Changing:

field names

IDs

helper names

API contracts

Problem

Breaks downstream modules.

Rule

Stable contracts remain stable.

---

# Mistake 14

## Weak Testing

Example

Testing implementation details.

Ignoring behavior.

Problem

False confidence.

Rule

Behavioral tests first.

---

# Mistake 15

## Silent Architecture Changes

Example

Moving responsibilities between modules.

Problem

Future maintainers become confused.

Rule

Architecture changes require explicit approval.

---

# Mistake 16

## Hidden Business Logic

Business rules should exist once.

Never duplicate:

year logic

mapping logic

override logic

coverage logic

financial calculations

---

# Mistake 17

## Mixing Data Ownership

Examples

Forecast edits Actual Spend.

Report edits Manual Entries.

Budget Settings edits Reports.

Problem

Ownership becomes unclear.

Rule

Each module owns exactly one responsibility.

---

# Mistake 18

## Breaking Backward Compatibility

Never require:

manual repair

production fixes

hidden migrations

unless explicitly approved.

---

# Mistake 19

## Solving the Wrong Problem

Example

Requirement:

Display new information.

AI changes:

storage

calculation

architecture

Problem

Scope explosion.

Rule

Solve the requested problem.

Nothing more.

---

# Mistake 20

## "While I'm Here"

Examples

"I also..."

"I noticed..."

"I fixed..."

"I cleaned..."

"I modernized..."

These are dangerous.

Every unrelated change increases regression risk.

---

# Before Every Commit

Ask:

Is this required?

Is it inside scope?

Does it change financial totals?

Does it affect another phase?

Does it break compatibility?

If any answer is uncertain,

stop and report.

---

# AI Decision Tree

Requirement

↓

Understand

↓

Read Existing Code

↓

Read Existing Tests

↓

Compare

↓

Plan

↓

Implement

↓

Behavioral Tests

↓

Regression Tests

↓

Review Scope

↓

Return

Never skip steps.

---

# Final Principle

The best AI engineer is not the one that writes the most code.

It is the one that delivers the requested behavior,

changes the fewest files,

preserves compatibility,

keeps financial correctness,

and leaves the rest of the project untouched.
