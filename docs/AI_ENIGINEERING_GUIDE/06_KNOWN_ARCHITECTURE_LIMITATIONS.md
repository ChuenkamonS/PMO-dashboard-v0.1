# Known Architecture Limitations

Version: 1.0

---

# Purpose

This document lists known architecture limitations that are intentionally accepted.

These are NOT implementation bugs.

These are NOT invitations to refactor.

These are NOT automatic improvement opportunities.

Unless a task explicitly targets one of these areas,
AI must preserve the existing behavior.

---

# Philosophy

Large software systems always contain limitations.

A limitation is acceptable if:

- business behavior is correct
- users are unaffected
- architecture remains understandable
- future phases already plan to address it

Do not "fix" accepted limitations during unrelated work.

---

# Limitation Categories

There are three categories.

## Accepted

Intentionally kept.

Do not modify.

---

## Planned

Known limitation.

Scheduled for a future phase.

Do not implement early.

---

## Unknown

Unexpected behavior.

Report.

Do not redesign automatically.

---

# Current Accepted Limitations

---

## Canonical Actual Spend

Status:

Accepted

Description:

Canonical Actual Spend is currently a materialized projection.

It is regenerated from:

- Memo
- Manual Actual Spend
- Infra

Current architecture:

Memo

+

Manual

+

Infra

↓

reconcileActualSpendSources()

↓

Canonical Actual Spend

Reason:

Incremental migration strategy.

Rule:

Do not remove reconciliation.

---

## Manual Entries Ownership

Status:

Accepted

Manual Entries owns:

- persistence
- edit
- delete
- import

Reason:

Manual Entries is the CRUD owner.

Rule:

Do not bypass Manual persistence.

---

## One Memo Rule

Status:

Accepted

One approved Memo

=

One Actual Spend record.

Software detail belongs inside:

detailLines

Never split one Memo into multiple Actual Spend records.

---

## detailLines

Status:

Accepted

detailLines explains the parent record.

It does not create transactions.

It does not replace amount.

It does not affect financial totals.

---

## Budget Pool

Status:

Planned

Budget Pool contract is not finalized.

Reason:

Phase 7A.

Rule:

Do not redesign Budget Pool before Phase 7A.

---

## Budget vs Actual

Status:

Planned

Known work remains:

- mapping
- year handling
- orphan overrides
- reconciliation

Rule:

Implement only during Phase 7.

---

## Forecast

Status:

Planned

Forecast currently consumes parent Actual Spend.

Software detail presentation is intentionally postponed.

Rule:

Do not redesign Forecast before Phase 8.

---

## Budget Settings

Status:

Planned

Budget Settings UX will evolve after Budget Pool contract stabilizes.

Rule:

Do not redesign settings during Budget vs Actual work.

---

# Accepted Duplication

Some duplication currently exists.

Examples:

reconciliation

legacy compatibility

projection helpers

Reason:

Backward compatibility.

Rule:

Do not remove duplication without architectural approval.

---

# Legacy Compatibility

Legacy records remain supported.

Examples:

missing fields

legacy imports

optional properties

older persistence models

Rule:

Never remove compatibility simply because newer records no longer require it.

---

# Current Project Decisions

These are intentional.

✓ Small phases

✓ Localized changes

✓ Backward compatibility

✓ Behavioral testing

✓ Canonical consumption

✓ Existing UI preserved until dedicated phase

Do not reverse these decisions.

---

# Things AI Must Report

Instead of fixing:

Forecast architecture

Budget Pool redesign

Canonical persistence redesign

Large refactors

Report them.

Do not implement them.

---

# Things AI Must Ignore

Do not spend implementation effort on:

code style

folder organization

modern syntax

helper extraction

renaming

formatting

unused abstraction opportunities

unless explicitly requested.

---

# Future Architecture

The following improvements are expected later:

Phase 7A

Budget Pool contract

↓

Phase 7B

Budget vs Actual

↓

Phase 8

Forecast

↓

Phase 9

Budget Settings

↓

Future

Canonical persistence redesign

Until then,

respect the current architecture.

---

# Final Rule

The existence of a limitation

does not imply

permission to change it.

Only the current implementation phase

determines what may be modified.
