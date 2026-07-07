# UX Alignment Guideline — PMO Dashboard

> Purpose: align the existing PMO Dashboard UI across modules without redesigning the product, changing business logic, or adding new features.

This document should be used as the implementation guardrail for UX alignment work across:

- All Memos
- Pending Approval
- Budget & Spend
- License Management
- Device Management
- Related shared components, modals, tables, filters, actions, and detail views

---

## 1. Core Principle

The goal is **UX alignment**, not redesign.

Do not change the product direction, page purpose, workflow, permission logic, approval logic, export behavior, data model, or business rules unless explicitly requested in a separate requirement.

The work should make the application feel like one consistent system by aligning:

- Page structure
- Spacing and layout rhythm
- Filter and toolbar behavior
- Button placement and hierarchy
- Table density and column priority
- Modal/detail behavior
- Status badges and action patterns
- Empty/loading/error states
- Responsive desktop wrapping behavior

---

## 2. Non-Negotiable Guardrails

### 2.1 Do Not Redesign

Do not introduce a new visual style, new color system, new navigation model, new dashboard concept, or new interaction paradigm.

Keep the current look and feel. Only align inconsistent patterns.

### 2.2 Do Not Change Business Logic

Do not change:

- Memo creation logic
- Approval/rejection/cancel rules
- Role-based action visibility
- Budget mapping logic
- Actual Spend logic
- Forecast logic
- Device PO/status logic
- License tracking logic
- Export data logic
- Import/template behavior
- Existing persistence fields

### 2.3 Do Not Remove Functionality

If a field, action, filter, or data point is removed from a list/table, it must still be available in an existing or appropriate detail view.

Table simplification means **move secondary information**, not delete data.

### 2.4 Do Not Add New Features

Do not add new filters, new buttons, new workflow states, new reports, new modals, or new business functions unless explicitly requested.

### 2.5 Preserve Existing Tests

All existing tests must continue to pass. Add or update tests only where the UX alignment changes expected DOM structure, visible columns, or interaction behavior.

---

## 3. Preferred Page Rhythm

Use this as the preferred layout sequence where applicable. It is a rhythm, not a hard rule. Omit sections that do not apply to the page.

1. Module tabs
2. Optional sub-tabs
3. KPI cards
4. Context banner or helper message
5. Search and filters on the left
6. Export/secondary actions followed by primary action on the right
7. Result count or selected count
8. Primary table or primary content
9. Secondary summaries or supporting content

Important notes:

- Filters and actions may wrap, but they must remain visually distinct groups.
- Primary actions should never wrap into the middle of filter controls.
- Secondary summaries should not push the primary operational table too far down unless the page is explicitly report-first.

---

## 4. Toolbar Standard

Every list-heavy or table-heavy page should use a consistent toolbar pattern.

### 4.1 Left Side

Use for user inputs:

- Search
- Type filter
- Project filter
- Status filter
- Period/date filter
- Sort
- Other tab-specific filters

Search should appear first when available.

### 4.2 Right Side

Use for actions:

- Refresh
- Export CSV
- Download template
- Import
- Add/Create primary action

Action order should generally be:

1. Refresh, if present
2. Export
3. Template/download
4. Import
5. Primary add/create action

### 4.3 Avoid Split Rows Unless Needed

Avoid separating filters and actions into multiple rows if they can be cleanly grouped in one toolbar.

If wrapping is necessary, keep filters together and actions together.

---

## 5. Button and Action Hierarchy

### 5.1 Primary Actions

Use primary button styling only for the main action of the active page or tab, such as:

- Create Memo
- Add License
- Add Device
- Add Manual Actual Spend

### 5.2 Secondary Actions

Use secondary/outline/neutral treatment for:

- Export
- Refresh
- Template
- Import
- View
- Detail

### 5.3 Destructive or Decision Actions

Keep approval decision actions clear and consistent:

- Approve
- Reject
- Cancel
- Delete

Do not overcrowd inline row actions.

Where the row itself opens detail, avoid repeating a visible `View` button unless necessary for accessibility or clarity.

---

## 6. Table Density Standard

Tables should prioritize fields required for first-level scanning and decision making.

### 6.1 Keep Visible

Keep columns that help the user answer:

- What is this record?
- Which project/type/status does it belong to?
- How much or how many is involved?
- What is the latest state?
- What action can I take now?

### 6.2 Move to Detail

Move secondary or audit-style information into detail views when table density becomes too high:

- Created date, if Updated is the primary list date
- Reject reason
- Long notes
- Approver name, if not required for first-level decision
- Owner/department metadata
- Purchase date/source metadata
- Serial number, if Asset ID is sufficient for table-level identification

### 6.3 Do Not Hard-Code Column Decisions Blindly

Before removing a visible column from a table, verify that:

- The information remains available elsewhere
- The field is not needed for immediate decision making
- Export behavior remains unchanged unless explicitly requested
- Tests are updated if they assert visible columns

---

## 7. Detail View Standard

Detail views should contain information that is too dense, contextual, or audit-like for primary tables.

Use detail views for:

- Full memo metadata
- Approval/rejection context
- Created/updated timestamps
- Full requester/approver information
- Long text fields
- Import/source metadata
- Full device/license metadata
- Secondary references

Row click should open detail consistently where the current module already supports row-click detail behavior.

---

## 8. Modal Standard

Modals should follow one consistent structure:

1. Clear title
2. Short supporting description only if useful
3. Form/content body
4. Footer actions aligned consistently

Modal footer order:

- Cancel/Close on the left or first secondary position
- Destructive/decision secondary action where relevant
- Primary save/confirm action at the end

Avoid modal stacking. If a detail modal opens another contextual panel, close or replace the previous layer unless the current pattern explicitly supports nested modals safely.

---

## 9. Status and Badge Standard

Status badges should be visually and semantically consistent across memo, budget, license, and device screens.

Do not introduce new colors unless required. Prefer reusing existing status styles.

Status labels should remain business-readable and consistent across screens.

---

## 10. Empty, Loading, and Error States

Align empty/loading/error states across modules.

### 10.1 Empty State

Use a short message that explains why the table is empty, for example:

- No records found
- No pending approvals
- No licenses match the current filters

Avoid dramatic or overly designed empty states.

### 10.2 Loading State

Use the existing loading style consistently. Do not introduce a new loading framework.

### 10.3 Error State

Use clear, short messages. Do not expose technical errors to normal users unless already part of current behavior.

---

## 11. Module-Specific Alignment Notes

## 11.1 All Memos

Priority: P1

Current issue:

- Table is dense and horizontally heavy.
- Status tabs consume width before filters.
- Some metadata is better suited for detail view.

Keep:

- Status tabs
- Search-first filter order
- Type, Project, Period filters
- Export CSV
- Clickable rows
- Compact row actions

Align toward:

- Status tabs
- One toolbar with Search, Type, Project, Period, Sort on the left
- Export on the right
- Result count
- Primary memo table

Move secondary information such as reject reason and audit timestamps into detail where appropriate.

## 11.2 Pending Approval

Priority: P1

Current issue:

- KPI sizing is inconsistent when only two cards are shown.
- Inline row actions can become overcrowded.

Keep:

- Search
- Type filter
- Project filter
- Sort
- Refresh
- Export CSV
- Approval KPIs
- Role-aware actions

Align toward:

- Two evenly sized KPI cards when only two metrics exist
- Search/filter toolbar on the left
- Refresh and Export grouped on the right
- Row click opens detail
- Inline actions focus on eligible decision actions only

Requester-only Cancel should be moved into detail if inline action density is too high.

## 11.3 Budget & Spend

Priority: P1

Current issue:

- Five top-level tabs use different control patterns.
- Period controls, sub-tabs, filter toolbars, and settings actions do not share a consistent rhythm.

Keep:

- Five top-level tabs
- Actual Spend Report/Manual Entries split
- Tab-specific filters
- Exports
- Settings actions

Align toward:

- Top-level tabs
- Optional sub-tabs
- One tab-scoped toolbar
- Filters on the left
- Exports/actions on the right
- KPI/content/table below

Do not expose drill-down filters at the top level.

## 11.4 License Management

Priority: P1

Current issue:

- Memo Index separates filters and actions into two rows.
- Memo Index table is dense.
- Other tabs use different toolbar/action arrangements.

Keep:

- Four main tabs
- Tab-scoped exports
- KPI cards
- Search-first behavior
- Simplified Users table
- Summary/Reconciliation sub-tabs

Align toward:

- Main tabs
- Optional sub-tabs
- One toolbar per active tab
- Filters on the left
- Import, Template, Add License, and Export grouped on the right where applicable
- Reconciliation-only toggles stay inside Reconciliation

Move secondary inventory metadata into detail where appropriate.

## 11.5 Device Management

Priority: P2

Current issue:

- Registry summary content appears before the primary operational list.
- Registry toolbar can become crowded.

Keep:

- Registry/Purchase Orders tabs
- Tab-scoped exports
- Search-first ordering
- KPI cards
- Context banners
- Current device/PO table behavior

Align toward:

- Tabs
- KPI cards
- Context banner
- Search and core filters
- Right-aligned action group
- Primary table
- Secondary summaries below the primary table or in a collapsed/supporting section

If table width remains problematic, consider moving Serial No. to detail while retaining Asset ACC for identification.

---

## 12. Implementation Plan

## Phase 0 — Global UX Standards

Goal:

Establish shared UX rules before changing individual screens.

Scope:

- Define reusable page rhythm
- Define standard toolbar structure
- Define button/action hierarchy
- Define table density rule
- Define detail/modal behavior
- Define empty/loading/error state behavior

Output:

- Shared standards are documented in code comments or component conventions where useful.
- No business logic changes.

## Phase 1 — Structural Alignment

Goal:

Align layout structure and action placement across the five requested modules.

Scope:

- Consolidate split filter/action rows
- Align toolbar groups
- Align KPI placement
- Align tab/sub-tab rhythm
- Move Device secondary summaries below the primary registry table
- Simplify inline actions where row-click detail already exists

Guardrail:

- Preserve every existing action and filter behavior.
- Do not remove data.
- Do not change exports.

## Phase 2 — Table Density Alignment

Goal:

Reduce table density while keeping all information available.

Scope:

- Move secondary metadata from dense tables into detail views
- Keep operational decision fields visible
- Preserve export data unless explicitly requested otherwise
- Update tests if visible columns change

Guardrail:

- Do not delete information.
- Do not change persistence fields.
- Do not change import/export contracts unless explicitly requested.

## Phase 3 — Component Consistency

Goal:

Make shared UI elements feel consistent across screens.

Scope:

- Buttons
- Search inputs
- Select filters
- Date/period filters
- Tables
- Badges/status chips
- Modals
- Pagination
- Empty/loading/error states
- Toast or confirmation behavior where already used

Guardrail:

- Reuse existing styles and patterns.
- Do not introduce a new design system package.

## Phase 4 — Final UAT Polish

Goal:

Verify the aligned UX behaves correctly at normal UAT desktop widths.

Scope:

- Toolbar wrapping
- Table scrolling
- Row-click behavior
- Role-based action visibility
- Export buttons
- Import/template buttons
- KPI alignment
- Modal footer alignment
- Empty/loading/error consistency

Output:

- All tests passing
- Manual UAT notes updated if applicable
- No known P0/P1 visual inconsistencies remaining in the five requested modules

---

## 13. Suggested Codex Prompt

Use this prompt when asking Codex to implement the UX alignment work.

```text
Read the current PMO Dashboard codebase and the UX_ALIGNMENT_GUIDELINE.md file.

Implement UX alignment only. Do not redesign the product. Do not change business logic, approval logic, budget logic, forecast logic, import/export contracts, persistence fields, or role-based permissions.

Focus on the five requested modules:

- All Memos
- Pending Approval
- Budget & Spend
- License Management
- Device Management

Follow the guideline phases:

1. Global UX standards
2. Structural alignment
3. Table density alignment
4. Component consistency
5. Final UAT polish

Prioritize P1 issues first:

- All Memos
- Pending Approval
- Budget & Spend
- License Management

Then address the P2 Device Management alignment.

Important rules:

- Search should appear before filters.
- Filters should stay grouped on the left.
- Refresh/export/template/import/add actions should stay grouped on the right.
- Primary actions should not wrap into the middle of filters.
- Row click should open detail where the module already supports row-click detail.
- Avoid duplicate inline View actions where row-click detail is already clear.
- Do not remove data; move secondary metadata into detail views instead.
- Preserve exports unless explicitly requested otherwise.
- Preserve all current tests and add/update tests only where visible layout behavior changes.

After implementation, provide:

- Files changed
- Summary of UX alignment completed
- Any visible columns moved to detail
- Tests run and results
- Manual UAT checklist
```

---

## 14. Manual UAT Checklist

Use this checklist after implementation.

### All Memos

- Status tabs still work
- Search works
- Type/Project/Period filters work
- Sort works if present
- Export CSV works
- Row click opens memo detail
- Removed table metadata is visible in detail
- Table does not feel overcrowded at normal desktop width

### Pending Approval

- KPI cards align evenly
- Search/filter toolbar aligns with other pages
- Refresh works
- Export works
- Approve/Reject visibility follows role rules
- Cancel remains available where appropriate, preferably in detail if removed inline
- Row click opens detail

### Budget & Spend

- Top-level tabs still work
- Actual Spend sub-tabs still work
- Tab-specific filters remain scoped correctly
- Export buttons work
- Settings actions remain available
- No budget/actual/forecast logic changed

### License Management

- Main tabs still work
- Summary/Reconciliation sub-tabs still work
- Search-first behavior remains
- Import/template/add/export actions are correctly grouped
- Removed table metadata is visible in detail
- Exports remain correct

### Device Management

- Registry/Purchase Orders tabs still work
- KPI cards still show correctly
- Context banners remain visible
- Search and filters work
- Actions are grouped on the right
- Primary registry table appears before secondary summaries
- PO table behavior remains unchanged

### Global

- Toolbar wrapping is acceptable
- Primary actions do not wrap into filters
- Buttons use consistent sizing/hierarchy
- Tables align visually
- Modals have consistent footer layout
- Empty/loading/error states are consistent
- All tests pass
```
