# PMO Dashboard Business Rules

Version: 1.0

---

# Purpose

This document defines the official business rules governing the PMO Dashboard.

It is the single source of truth for business behavior.

Code should implement these rules.

Tests should validate these rules.

AI must never invent new business rules.

If implementation conflicts with this document,

this document wins.

---

# Business Philosophy

The PMO Dashboard exists to provide one trusted financial view.

Every feature should support:

• Financial correctness

• Consistency

• Traceability

• Backward compatibility

Business rules are more important than implementation.

---

# Core Financial Rules

## Rule 1

One Approved Memo

=

One Actual Spend Record

Never create multiple Actual Spend records from one Memo.

Software detail belongs inside detailLines.

---

## Rule 2

Parent Amount is authoritative.

Everything else explains the Parent Amount.

Never replace Parent Amount.

---

## Rule 3

detailLines are informational.

detailLines never become transactions.

detailLines never become Actual Spend.

detailLines never increase totals.

---

## Rule 4

Financial totals must not change unless the requirement explicitly changes.

UI changes

≠

Financial changes.

---

# Memo Rules

Memo owns:

- Approval
- Original business request
- Software line items
- Original total

Memo does NOT own:

Forecast

Budget Pool

Budget vs Actual

Reports

Exports

---

# Approved Memo Rules

Only Approved Memos generate Actual Spend.

Rejected or Draft Memos never generate Actual Spend.

Approval state is authoritative.

---

# Manual Actual Spend Rules

Manual Entries owns:

- Create
- Edit
- Delete
- Import

Manual Entries is the only CRUD owner.

Other modules consume Manual records.

They never edit them.

---

# Infra Rules

Infra is an independent source system.

It is not derived from Memo.

It is not derived from Manual.

---

# Canonical Actual Spend Rules

Canonical Actual Spend is the shared financial model.

Consumers should consume canonical data.

Consumers should never recreate canonical data.

Current architecture uses a materialized projection.

Do not redesign this without explicit approval.

---

# Reconciliation Rules

Current reconciliation combines:

Approved Memo

+

Manual Actual Spend

+

Infra Cost

↓

Canonical Actual Spend

Reconciliation must preserve financial equality.

Reconciliation must be idempotent.

Running reconciliation multiple times should produce the same result.

---

# Software Rules

One Software Memo

↓

One Actual Spend

↓

Many detailLines

Never:

One Software Memo

↓

Many Actual Spend records

---

# detailLines Rules

Each detailLine represents one Software item.

detailLines should contain:

- Program
- Plan
- Quantity
- Unit Cost
- Monthly Cost
- Coverage
- Line Amount

detailLines exist only for explanation and display.

---

# Coverage Rules

Coverage represents allocation period.

Coverage does not create additional spending.

Coverage should not modify ownership.

Coverage should not create duplicate values.

---

# Monthly Cost Rules

Monthly Cost is derived.

Current definition:

Unit Cost × Quantity

Monthly Cost is not authoritative.

Parent Amount remains authoritative.

---

# Budget Pool Rules

Budget Pool owns mapping.

Budget Pool does NOT own spending.

Budget Pool does NOT own transactions.

Budget Pool exists only between:

Canonical Actual Spend

↓

Budget vs Actual

---

# Budget Mapping Rules

Mapping should be deterministic.

The same Actual Spend should always resolve to the same Budget Pool under identical conditions.

Mapping logic should exist in one place.

Never duplicate mapping rules.

---

# Manual Override Rules

Manual Override always has higher priority than automatic mapping.

Override should never silently disappear.

Invalid override should be reported.

Not ignored.

---

# Missing Budget Pool Rules

If no matching Budget Pool exists:

Do not invent one.

Do not silently assign another.

Mark as unmapped.

Follow the current business behavior.

---

# Year Rules

Budget Pool year handling must be consistent across the application.

Year normalization should occur in one place.

Do not duplicate year conversion logic.

---

# Duplicate Pool Rules

Duplicate Budget Pools should never produce ambiguous mappings.

The business contract should define deterministic behavior.

Do not guess.

---

# Forecast Rules

Forecast consumes Canonical Actual Spend.

Forecast never consumes Memo directly.

Forecast never parses memo.sections.

Forecast never parses memo.slItems.

Forecast never edits Actual Spend.

Forecast projects spending only.

---

# Budget vs Actual Rules

Budget vs Actual compares:

Budget

vs

Canonical Actual Spend

Budget vs Actual never owns transactions.

Budget vs Actual never creates Actual Spend.

Budget vs Actual never modifies Actual Spend.

---

# Report Rules

Reports summarize Canonical Actual Spend.

Reports do not create business rules.

Reports do not reconstruct upstream data.

---

# Export Rules

Export reflects canonical datasets.

Export should never perform independent financial calculations.

---

# Search Rules

Searching must not modify financial behavior.

Filtering must not modify financial behavior.

Sorting must not modify financial behavior.

---

# Import Rules

Imports should preserve backward compatibility.

Imports should not silently modify business rules.

Legacy imports remain supported unless explicitly deprecated.

---

# Legacy Compatibility Rules

Older production records remain valid.

Missing optional fields remain valid.

Legacy records should load safely.

Never require production data repair.

---

# Financial Equality Rules

The following relationships should always hold.

Memo Total

=

Actual Spend Amount

Report Total

=

Actual Spend Total

Budget vs Actual

Actual

=

Actual Spend

Forecast

must reconcile with Actual Spend according to approved business rules.

---

# Architecture Rules

Business rules belong in one place.

Never duplicate:

Coverage logic

Year logic

Budget mapping

Override logic

Financial calculations

---

# Phase Rules

Every implementation phase owns one responsibility.

Never implement future phases.

Never reopen completed phases without explicit approval.

---

# AI Rules

If a business rule is unclear:

Stop.

Report.

Ask for clarification.

Never invent a business rule.

---

# Final Principle

Business rules are contracts.

Implementation may evolve.

Architecture may evolve.

UI may evolve.

Business rules should remain stable.

Everything else should conform to them.
