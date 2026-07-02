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

## 7A-9A Rule (superseded — see below)

Budget Year remains read-only and derives from Start Month.

## 7A-9B Rule (implemented)

Budget Year is selectable by the user, and Start/End Month auto-populate from the selected Budget
Year. `year` is still always derived (never independently persisted) — selecting a year sets
Start/End Month, and `createBudgetPoolRecord()` derives `year` from that, same as before.

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

Status: Resolved (7A-9B, in-app scope) / Export still open

The Actual Spend year filter (`as-year`) now labels its options in Buddhist Era (`ปี 2569`) via
`gregorianYearToBuddhistEra()`, matching Budget vs Actual and Budget Settings. The underlying
`<option value>` intentionally stays Gregorian since `actualSpendRecordInYear()` compares it against
`record.startDate`'s Gregorian year — value/label are deliberately different, label only.

Still open: Export formats (CSV columns) were explicitly left in their current/Gregorian format this
phase per approved decision — export terminology/date format review is a separate later phase.

---

## UI-02 — Budget Pool Month Input

Status: Resolved (7A-9B)

Budget Pool Start/End Month are now `<select>` controls (Thai month names, values 1-12) sharing one
Budget Year select, instead of free-text `type="month"` inputs. A cross-year range is now
structurally impossible to construct through this UI (previously only caught at save-time
validation).

---

## UI-03 — Budget Year Field

Status: Resolved (7A-9B)

Budget Year is now a user-selectable `<select>` (`populateBudgetYearSelect()`, extended with an
optional `extraYear` so an existing pool's own year is always representable). Selecting a year
auto-populates Start Month to January and End Month to December; the data contract is unaffected —
`createBudgetPoolRecord()` still derives `year` from whatever Start Month this produces.

---

## UI-04 — Project Dropdown Fragmentation

Status: Open / Deferred

Project dropdowns are not fully centralized across the app.

Target: canonical project source or documented data-derived exception.

---

## UI-05 — Delete Behavior

Status: Partially resolved (7A-9B messaging) / cascade behavior still deferred

`deleteBudgetPool()`'s block message now names the pool and breaks down reference counts by source
(canonical Actual Spend / Manual Expense / Memo); the no-blocker confirm now also names the pool.

Deletion remains a hard block whenever any reference exists — allowing delete-with-cascade-to-
Unbudgeted was explicitly deferred to a separate, later reviewed phase (approved decision), pending
closing the known gap where `budgetPoolDeletionBlockers()` doesn't check a memo's own legacy
`budgetPoolId` field. Archive workflow remains deferred to 7A-9C.

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

## 7A-9B (completed, scope as approved)

Budget Pool UX and workflow.

Delivered:

- Month picker / Year picker (Start/End Month selects + selectable Budget Year, auto-populate)
- BE display in-app for Budget Pool dates/months (Budget Settings, BvA, Assign Budget Pool modal)
  and the Actual Spend year filter label — Export explicitly excluded, reviewed separately
- Duplicate/overlap warning UX improvement (existing validation only, no new engine)
- Delete messaging improvement (named pool + per-source reference breakdown) — behavior still
  hard-blocked; cascade-to-Unbudgeted explicitly deferred to a separate later phase

Explicitly deferred out of 7A-9B (approved decisions):

- Archive/Active/Inactive → 7A-9C
- Delete-to-Unbudgeted cascade behavior → separate reviewed phase, after closing the memo-level
  `budgetPoolId` reference gap
- Export format/terminology → reviewed later

## 7A-9C (completed, scope as approved)

Budget Pool Bulk Upload validation redesign and TD-7A-02 closure.

Delivered:

- Import preview (New/Update tagged) shown only when the entire batch validates.
- Validation report (error report modal, per-row reasons) shown when any row fails.
- Duplicate detection — within the same file (including two rows both matching the same existing
  pool) and against existing pools, using the canonical derived year rather than the raw imported
  year cell.
- Overlap/shared-Spend-Type conflict detection, escalated to a hard failure for import (stricter
  than the manual single-save confirm-through warning).
- Negative-budget sign-stripping bug fixed (rejected via shared validation, not coerced positive).
- Batch remap runs once per import, not once per pool.
- TD-7A-02 closed: Tag Budget reads the canonical Actual Spend assignment result instead of running
  its own separate matching implementation.

Explicitly deferred out of 7A-9C (approved decisions, see the Phase 7A-9C design review):

- Budget Pool Lifecycle (Active/Archived) and Archive-as-delete-alternative — found to require a
  Supabase `status` column to persist reliably across users/devices (Supabase is live;
  `loadBudgetPoolsAsync()` overwrites the local pool cache from Supabase on every refresh with no
  status field), and no Supabase migration was approved this phase. Moves to a future phase gated on
  TD-7A-06 (baseline migration + schema audit).
- Inactive status (not part of the approved 2-state Active/Archived design either, when it ships).
- Delete-to-Unbudgeted cascade — remains explicitly out of scope; hard block is unchanged.
- The `budget_manual_expenses` FK `on delete set null` vs. app hard-block mismatch — documented as
  TD-7A-08, not fixed.
- Health Dashboard, orphan-assignment detection → 7A-9D.
- Full Project Dropdown migration (TD-7A-07), Overview legacy budget cleanup (TD-7A-03) — unrelated
  subsystems, untouched.
- BE/CE normalization in the template/import: already covered — `validateBudgetPoolImportBatch()`
  derives identity from the canonical (Gregorian-normalized) year via `createBudgetPoolRecord()`
  regardless of the raw imported year cell's era, so a mismatched cell cannot bypass duplicate
  detection.

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
