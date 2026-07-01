# Financial Model & Business Invariants

Version: 1.0

---

# Purpose

This document defines the financial model used throughout the PMO Dashboard.

It explains:

- what every financial object represents
- which values are authoritative
- which values are derived
- which values are informational only
- how totals must be preserved

If implementation conflicts with this document,
this document takes precedence.

Financial correctness is always more important than implementation convenience.

---

# Financial Philosophy

The PMO Dashboard is a financial system.

Every calculation must satisfy three goals:

1. Accuracy
2. Consistency
3. Traceability

No implementation should sacrifice one goal to improve another.

---

# Golden Rule

Financial totals must never change unless the requirement explicitly changes.

UI improvements

≠

Financial changes.

---

# Source Hierarchy

Financial information flows in one direction.

```
Memo
Manual Spend
Infra Cost

↓

Canonical Actual Spend

↓

Budget Pool Mapping

↓

Budget vs Actual

↓

Forecast

↓

Reports / Export
```

Never reverse this flow.

---

# Source of Truth

Current architecture:

Memo

Manual Spend

Infra

↓

Canonical Actual Spend

Current Canonical Actual Spend is a materialized projection.

It is NOT the master persistence layer.

Do not redesign this architecture unless explicitly instructed.

---

# Memo

Memo is the origin of approved spending.

Memo owns:

- approval
- requester
- original line items
- software details
- original total

Memo does NOT own:

Forecast

Budget Pool

Budget vs Actual

Reports

---

# Actual Spend

Actual Spend is the canonical financial dataset.

Every downstream financial feature should consume Actual Spend whenever possible.

Actual Spend must remain stable.

---

# One Memo Rule

Exactly one approved Memo produces exactly one Actual Spend record.

Never create:

```
Memo

↓

Actual Spend A

Actual Spend B
```

Instead:

```
Memo

↓

Actual Spend

↓

detailLines[]
```

---

# Amount

amount

is the authoritative financial value.

Everything else explains amount.

Nothing replaces amount.

---

# detailLines

detailLines exist only to explain the parent record.

Example

```
Memo

Amount

120,000

↓

detailLines

40,000

30,000

50,000
```

The parent amount remains authoritative.

---

# detailLines Rules

detailLines

may support

- UI
- drill-down
- reports
- Forecast display

detailLines

must never

- create transactions
- become Actual Spend records
- replace amount
- double count

---

# Coverage

Coverage determines time allocation.

Coverage does not determine ownership.

Coverage must never create duplicate financial values.

---

# Monthly Amount

Monthly Amount

is derived.

It is never the primary stored financial value.

If recomputed,

it must reconcile to the authoritative amount.

---

# Manual Actual Spend

Manual records own:

- persistence
- edit
- delete
- import

Manual Entries remains the CRUD owner.

Do not bypass Manual persistence.

---

# Infra

Infra behaves independently from Memo.

Infra behaves independently from Manual.

Do not merge ownership.

---

# Canonical Projection

Canonical Actual Spend exists so downstream modules share one financial dataset.

Consumers should never reconstruct the same financial information independently.

---

# Budget Pool

Budget Pool is metadata.

Budget Pool is NOT money.

Budget Pool represents allocation relationships.

Budget Pool never changes Actual Spend.

---

# Budget vs Actual

Budget vs Actual compares

Budget

vs

Actual Spend.

Budget vs Actual does not create spending.

Budget vs Actual does not own transactions.

---

# Forecast

Forecast projects spending.

Forecast never changes Actual Spend.

Forecast never modifies canonical records.

Forecast must consume canonical Actual Spend.

Forecast must never parse Memo directly.

---

# Reports

Reports summarize financial information.

Reports never redefine business rules.

Reports never perform hidden reconciliation.

---

# Export

Export reflects canonical datasets.

Export should not implement independent financial calculations.

---

# Financial Invariants

The following rules must always hold.

✓ One Memo = One Actual Spend

✓ amount is authoritative

✓ detailLines explain amount

✓ Manual Entries own Manual persistence

✓ Budget Pool owns mapping

✓ Forecast never owns transactions

✓ Reports never redefine totals

✓ Export never recalculates totals

✓ Reconciliation preserves financial equality

---

# Equality Rules

The following relationships should remain true.

```
Memo Total

=

Actual Spend Amount
```

```
Report Total

=

Actual Spend Total
```

```
Forecast Total

=

Actual Spend Total

(where business rules allow)
```

```
Budget vs Actual

Actual

=

Actual Spend
```

---

# Backward Compatibility

Existing production records must remain valid.

Never require manual repair.

Never require hidden migrations unless explicitly approved.

Legacy records without newer fields must continue loading safely.

---

# Future Financial Model

Future phases may introduce:

- canonical persistence
- richer Forecast
- Software detail Forecast
- advanced Budget Pool

However,

these improvements must preserve all existing financial invariants.

Financial correctness always takes priority over architectural elegance.
