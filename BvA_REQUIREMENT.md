
# MASTER_SPEC.md
# PMO Dashboard - Master Specification

> This document defines the permanent business rules, data model, calculation rules and system-wide data flow.
> Feature requirements should reference this document instead of redefining business logic.

## 1. Purpose
This specification is the single source of truth for the Budget & Spend module. It defines:
- Business rules
- Data model
- Calculation rules
- Data flow
- Integration rules
- Acceptance rules

Feature-specific UI requirements belong in REQUIREMENT.md, not here.

---

# 2. System Scope

Budget & Spend contains only 5 tabs:

1. Overview
2. Actual Spend
3. Forecast
4. Budget vs Actual
5. Settings

The legacy "Others" tab is removed.

---

# 3. Single Source of Truth

## Memo
Source: Memo table

## Actual Spend
Source: Actual Spend table

## Budget
Source: Budget Pool table

## Forecast
Source: Actual Spend + Coverage Period

Every dashboard page, chart and export must use these same sources.

---

# 4. Memo Lifecycle

Draft
→ Pending
→ Approved / Completed
→ Actual Spend

Rejected and Cancelled never create Actual Spend.

Only Approved / Completed memo contributes to financial reporting.

---

# 5. Spend Type Master

Spend Types:

- Software
- Hardware
- Team Activity
- Client Expense
- Deployment
- Infra
- Others

Memo Type is only an input.

Memo Type mapping:

SL → Software
HW → Hardware
INT → Team Activity
ENT → Client Expense
DEP → Deployment

All modules must use the same Spend Type master.

---

# 6. Actual Spend Model

Actual Spend is the financial source of truth.

Allowed sources:

1. Approved Memo
2. Manual / Historical Expense
3. Infra Cost

No other source is allowed.

Recommended record:

- id
- source
- referenceNo
- memoId
- project
- spendType
- amount
- currency
- startDate
- endDate
- month
- year
- vendorProgram
- description
- autoBudgetPoolId
- manualBudgetPoolId
- finalBudgetPoolId
- budgetStatus
- createdBy
- createdAt
- updatedBy
- updatedAt

---

# 7. Budget Pool

Budget Pool stores budgets only.

It never stores Actual Spend.

Actual Spend references Budget Pool.

One Project
→ Many Budget Pools

One Budget Pool
→ Many Spend Types

---

# 8. Budget Mapping

Priority:

Manual Override
→ Auto Mapping
→ Unbudgeted

Auto Mapping Rules:

- Project matches
- Spend Type matches
- Date is within pool period

If multiple pools match:

Status = Needs PMO Review

If no pool matches:

Status = Unbudgeted

Creating a new Budget Pool must automatically re-evaluate previous Unbudgeted records.

---

# 9. Manual Override

PMO can override Budget Pool.

Manual Override always wins.

Auto Mapping must never overwrite a manual override.

---

# 10. Forecast Rules

Forecast only uses:

- Software
- Infra

Monthly Cost:

Amount ÷ Coverage Months

Forecast view:

- Rolling 6 months Actual
- Rolling 6 months Forecast

---

# 11. KPI Rules

All KPI calculations must come from Actual Spend.

Never calculate independently per page.

Overview, Forecast and Budget vs Actual must produce identical totals.

---

# 12. Calculation Engine

Business calculations must exist in shared reusable functions.

Examples:

- calculateActualSpend()
- calculateForecast()
- calculateBudgetUtilization()
- mapBudgetPool()

Never duplicate business logic in UI components.

---

# 13. Export Rules

Exports must use exactly the same data source and calculations as the UI.

Do not create separate export queries with different logic.

---

# 14. Integration Rules

Approved Memo

↓

Actual Spend

↓

Budget Mapping

↓

Overview

↓

Budget vs Actual

↓

Forecast (Software / Infra only)

↓

Export

All downstream modules consume Actual Spend.

---

# 15. Architectural Principles

- Reuse existing implementation whenever possible.
- Refactor only where required.
- Do not introduce duplicate data sources.
- Do not create a separate Infra module.
- Infra is a Spend Type within Actual Spend.
- UI should consume business services rather than implementing calculations.

---

# 16. Definition of Done

The implementation is complete only when:

- All financial pages use Actual Spend as source of truth.
- Budget Pool mapping is consistent.
- Manual Override is respected.
- Forecast uses Software + Infra only.
- Others tab is removed.
- Spend Type master is shared.
- Export matches UI.
- No duplicate calculation logic exists.
