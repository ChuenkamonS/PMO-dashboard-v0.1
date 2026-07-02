# UI Consistency Contract

> Purpose: keep PMO Dashboard screens consistent as the system grows.
>
> This file defines user-facing UI rules, not business logic. Business/data contracts remain in `MASTER_SPEC.md`, `BvA_REQUIREMENT.md`, `PHASE_PLAN.md`, and phase scope trackers.

---

# 1. Core Principle

The application must feel like one system.

If two screens show the same kind of information, they should use the same:

- terminology
- year/date display
- project dropdown source
- table layout
- empty state
- loading state
- action behavior
- export behavior

Do not introduce a new UI pattern unless explicitly approved.

---

# 2. Date / Year Display Contract

## Decision

All user-facing year/month/date displays should use **Buddhist Era (BE)**.

Internal storage, calculation, matching, and comparison must continue using **Gregorian (CE)**.

## Examples

| Internal | User-facing Display |
|---|---|
| `2026` | `2569` |
| `2026-01` | `2569-01` or `ม.ค. 2569` |
| `2026-05-27` | `27/05/2569` or `27 พฤษภาคม 2569` |

## Rules

- Users should not see mixed BE/CE year displays in related screens.
- Year filters should display BE.
- Date/month fields shown in tables should display BE where practical.
- Export should follow the same user-facing display convention unless a technical export format explicitly requires CE.
- Internal logic must not store BE as the source date value.

## Known Current Inconsistency

Actual Spend currently displays year filter values in Gregorian while Budget vs Actual and Budget Settings display Buddhist Era.

Target future state:

- Actual Spend filter = BE display
- Budget vs Actual filter = BE display
- Budget Settings filter = BE display
- Assign Budget Pool modal = BE display
- Internal values remain CE

---

# 3. Budget Pool UI Contract

## Source of Truth

Budget Pool coverage is based on:

- `startMonth`
- `endMonth`

Budget Pool `year` is derived from normalized `startMonth`.

## UI Rules

- Budget Settings list, Edit modal, BvA, Export, and Assignment modal must agree on pool year.
- No Budget Pool UI should display corrupted years such as `3112`.
- Assignment selectors must use canonical Budget Pool records.
- Legacy corrupted records may be normalized at runtime for display, but should not be auto-migrated unless explicitly approved.

## Current 7A-9A Rule

Budget Year remains read-only and derives from Start Month.

## Future 7A-9B Rule

Budget Year should become selectable by the user, and Start/End Month should auto-populate from the selected Budget Year.

---

# 4. Date / Month Input Contract

## Current State

Some fields still allow typed `YYYY-MM` input.

## Target State

Date/month/year fields should not rely on free text as the primary input.

Preferred controls:

- Year selector
- Month picker
- Date picker
- controlled dropdowns

## Rules

- If free text remains supported, it must normalize both BE and CE input.
- `2569-01` and `2026-01` must resolve to the same internal month: `2026-01`.
- Invalid formats must be rejected clearly.
- End Month must not be earlier than Start Month.

---

# 5. Project Dropdown Contract

## Decision

Project dropdowns should eventually use one canonical project source.

## Current Issue

Some dropdowns use Settings project list.
Some dropdowns derive projects from existing data.
This causes inconsistent project options across screens.

## Target State

All Project dropdowns should either:

1. use the canonical Settings project list, or
2. explicitly document why they are data-derived.

## Budget Pool Rule

Budget Pool Add/Edit modal must use the canonical project list.

## Deferred

Full project dropdown migration across the app is deferred from 7A-9A.

---

# 6. Table Consistency Contract

Tables showing financial or record data should follow the same pattern.

## Rules

- Text columns: left-aligned
- Number/currency columns: right-aligned
- Percent columns: right-aligned
- Headers: consistent capitalization and spacing
- Row height: consistent within the same feature area
- Hover state: consistent for clickable rows
- Empty table state: clear reason, not blank
- Loading state: visible and consistent

## Budget & Spend Rule

Budget Pool, Assignment Workspace, Actual Spend detail, and drill-down tables should reuse shared table classes whenever possible.

---

# 7. Action Behavior Contract

Actions should behave consistently across the app.

## Edit

- Opens modal or detail view consistently within the same feature area.
- Existing values must match list/table values.

## Delete

- Destructive actions require confirmation.
- If deletion has downstream impact, the confirmation must explain the impact.

## Archive

- Archive should be used when the object should no longer be active but should remain historically visible.

## Export

- Export should match the visible filtered UI state unless explicitly labeled otherwise.

---

# 8. Empty / Loading / Error State Contract

## Empty State

Must explain why nothing is shown.

Examples:

- No data exists for this year.
- No records match the selected filters.
- No Budget Pool matches this Actual Spend.

## Loading State

Must be visible when data is being fetched or initialized.

## Error State

Must be actionable where possible.

Avoid generic messages such as:

- `Error`
- `Something went wrong`

Prefer messages that identify the affected feature.

---

# 9. Budget & Spend Screen Consistency

The following areas should use consistent display and filter behavior:

- Overview
- Actual Spend
- Forecast
- Budget vs Actual
- Budget Settings
- Assignment Workspace
- Assign Budget Pool modal
- Manual Override modal

## Required Consistency

- Same year display convention
- Same project naming
- Same spend type naming
- Same currency formatting
- Same empty state style
- Same table alignment rules
- Same export/filter relationship

---

# 10. Known UI Consistency Issues

## UI-01 — Actual Spend Year Display

Status: Open / Deferred

Actual Spend year filter currently displays Gregorian years while Budget vs Actual and Budget Settings display Buddhist Era.

Target: BE display everywhere.

---

## UI-02 — Budget Pool Month Input

Status: Open / Deferred

Budget Pool Start/End Month still allows typed `YYYY-MM` input.

Target: Month picker or controlled selector.

---

## UI-03 — Budget Year Field

Status: Open / Deferred

Budget Year is currently read-only.

Target: selectable Budget Year that auto-populates Start/End Month.

---

## UI-04 — Project Dropdown Fragmentation

Status: Open / Deferred

Project dropdowns are not fully centralized across the app.

Target: canonical project source or documented data-derived exception.

---

## UI-05 — Delete Behavior

Status: Open / Deferred

Budget Pool deletion behavior is not yet aligned with intended workflow.

Target: impact-aware confirmation and optional archive workflow.

---

# 11. Implementation Guardrails

When improving UI consistency:

Do not:

- change business logic unless explicitly required
- change persistence model unless explicitly required
- redesign unrelated screens
- introduce new terminology casually
- introduce new date/year conversion logic outside shared utilities
- use raw Budget Pool year values for user-facing Budget Pool logic

Do:

- reuse shared helpers
- reuse shared table classes
- reuse shared formatters
- add tests for behavior that could regress
- document deferred UI inconsistencies

---

# 12. Phase Mapping

## 7A-9A

Budget Pool foundation contract.

Includes:

- canonical Budget Pool model
- canonical read/write
- no corrupted years
- assignment selector uses canonical pool years

Does not include:

- date picker redesign
- full BE UI standardization
- delete/archive workflow

## 7A-9B

Budget Pool UX and workflow.

Expected scope:

- Month picker / Year picker
- full BE display in Budget & Spend
- duplicate/overlap warning UX
- delete confirmation
- archive flow

## 7A-9C

Bulk upload and management.

Expected scope:

- import preview
- validation report
- duplicate detection
- BE/CE normalization in template/import

## 7A-9D

Data quality and health check.

Expected scope:

- mismatched pool detection
- orphan assignment detection
- health summary
- report-only data quality tools

---

# 13. Acceptance Rule

A UI change is acceptable only if:

- it matches this file, or
- it updates this file with an approved new decision.

If a proposed change conflicts with this file, stop and ask for clarification before implementation.
