# MASTER_SPEC.md

# PMO Dashboard Master Specification

## Purpose
This document defines permanent business rules shared by the whole PMO Dashboard. UI requirements belong in `REQUIREMENT.md`.

## System Modules
- All Memo
- Budget & Spend
- License
- Dashboard

Budget & Spend tabs:
1. Overview
2. Actual Spend
3. Forecast
4. Budget vs Actual
5. Settings

## Single Source of Truth
- Memo = Memo table
- Actual Spend = Actual Spend table
- Budget = Budget Pool table
- Forecast = Actual Spend + Coverage Period

All dashboards, exports and calculations must use the same source.

## Memo Lifecycle
Draft → Pending → Approved/Completed → Actual Spend

Rejected / Cancelled never create Actual Spend.

## Spend Type Master
Software
Hardware
Team Activity
Client Expense
Deployment
Infra
Others

Memo Types map into Spend Types.

## Actual Spend Rules
Allowed sources:
- Approved Memo
- Historical / Manual Expense
- Infra Cost

No other source is valid.

## Budget Pool Rules
- One project → many budget pools
- One pool → many spend types
- Budget Pool stores budget only.
- Actual Spend references Budget Pool.

## Budget Mapping Priority
1. Manual Override
2. Auto Mapping
3. Unbudgeted

## Forecast Rules
- Only Software + Infra
- Monthly Cost = Amount / Coverage Months
- Rolling 6 months actual + 6 months forecast

## Calculation Rules
Shared calculation functions only.
No duplicated business logic in UI.

## Export Rules
Exports must use identical logic and source as UI.

## Architecture Rules
- Reuse existing implementation.
- Refactor only necessary modules.
- Do not create duplicate data sources.
- Infra is a Spend Type, not a separate module.

## Definition of Done
- Shared Spend Type master
- Shared Actual Spend source
- Shared Budget Pool mapping
- Manual Override respected
- Others tab removed
- Exports match UI
