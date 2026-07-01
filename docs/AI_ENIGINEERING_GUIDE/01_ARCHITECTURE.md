# PMO Dashboard Architecture

## Purpose

This document defines the architecture of the PMO Dashboard.

It explains:

- why the architecture exists
- where every financial object lives
- how data flows through the application
- ownership of every dataset
- responsibilities of each module

This document takes precedence over implementation assumptions.

If implementation differs from this document, report the inconsistency before making architectural changes.

---

# Core Principles

The architecture follows five principles.

## 1. One responsibility per layer

Each layer owns exactly one responsibility.

Never duplicate responsibilities.

---

## 2. Read-only downstream

Downstream modules consume data.

They do not recreate data.

They do not reinterpret business rules.

They do not parse upstream structures.

---

## 3. Preserve backward compatibility

Financial correctness is more important than architectural elegance.

Existing production records must continue working.

---

## 4. Small localized changes

Architecture evolves incrementally.

Avoid system-wide refactors.

---

## 5. Canonical data first

Whenever possible, downstream modules consume canonical data rather than reconstructing source data.

---

# High Level Architecture

Memo
Manual Actual Spend
Infra Cost
Budget Pools

↓

Canonical Projection

↓

Budget Pool Mapping

↓

Budget vs Actual

↓

Forecast
Reports
Exports

---

# Source Systems

There are four source systems.

## Memo

Owns:

- approved memo
- memo sections
- software items
- original approval workflow

Never modified by downstream modules.

---

## Manual Actual Spend

Owns:

- manual persistence
- edit
- delete
- import

Manual Entries remains the CRUD owner.

---

## Infra Cost

Owns infrastructure cost records.

Independent from Memo.

Independent from Manual.

---

## Budget Pool

Owns budget allocation metadata.

Budget Pool is NOT Actual Spend.

Budget Pool is NOT Forecast.

Budget Pool is a mapping layer.

---

# Canonical Actual Spend

Canonical Actual Spend is the shared financial model.

Consumers:

- Report
- Report Detail
- Overview KPI
- Overview Charts
- Forecast
- Budget vs Actual
- Export

Current architecture:

Approved Memo
Manual
Infra

↓

reconcileActualSpendSources()

↓

Canonical Actual Spend

Important:

Canonical Actual Spend is currently a materialized projection.

It is NOT the primary persistence source.

Do NOT remove reconciliation unless the architecture explicitly changes.

---

# Actual Spend Rules

One approved memo

=

One Actual Spend record

Never create multiple Actual Spend records from one memo.

Software detail belongs inside

detailLines[]

Never replace

amount

with

detailLines.

detailLines explains amount.

amount remains authoritative.

---

# detailLines

detailLines is informational.

It exists to support:

- detail display
- drill-down
- future Forecast display

It must never change financial totals by itself.

---

# Budget Pool

Budget Pool exists between

Canonical Actual Spend

and

Budget vs Actual.

Budget Pool does not own financial transactions.

Budget Pool owns allocation relationships.

---

# Forecast

Forecast consumes Actual Spend.

Forecast must not reconstruct Memo.

Forecast must not parse memo.sections.

Forecast must not parse memo.slItems.

Forecast consumes canonical Actual Spend only.

---

# Reports

Reports consume canonical Actual Spend.

Reports never recreate financial data.

---

# Export

Export consumes canonical datasets.

Export should never independently calculate financial values.

---

# Reconciliation

Current reconciliation:

Memo

+

Manual

+

Infra

↓

Canonical Actual Spend

Reconciliation remains the current architecture.

Do not remove it without an approved architectural redesign.

---

# Ownership Matrix

Memo

Owner:
Memo module

Manual

Owner:
Manual Entries

Infra

Owner:
Infra module

Canonical Actual Spend

Owner:
Financial Engine

Budget Pool

Owner:
Budget Settings

Forecast

Owner:
Forecast module

Budget vs Actual

Owner:
BvA module

---

# Architecture Invariants

These rules must never be broken.

✓ One memo = one Actual Spend record.

✓ amount is authoritative.

✓ detailLines explain amount.

✓ No downstream module parses Memo.

✓ No downstream module duplicates business rules.

✓ Forecast totals equal Actual Spend totals where expected.

✓ Budget vs Actual consumes canonical Actual Spend.

✓ Manual Entries owns manual persistence.

✓ Budget Pool owns mapping, not transactions.

✓ Reconciliation remains until explicitly redesigned.

---

# Future Architecture

Future phases may replace reconciliation with direct persistence.

Until then,

Canonical Actual Spend remains a materialized projection.

All new features must respect this architecture.
