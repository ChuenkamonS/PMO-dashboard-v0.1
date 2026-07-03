# PMO Dashboard — Implementation Roadmap (Revised)

Last Updated: 2026-07-03

---

# Development Strategy

The project follows a **Function First, UI Last** strategy.

Priority order:

1. Business Logic
2. Data Integrity
3. End-to-End Workflow
4. Auditability
5. Testing
6. UI Integration

The objective is to complete all functional requirements before spending effort on UI consistency or visual redesign.

---

# Core Principles

## 1. Functional Completion First

Every module should become fully functional before any UI polishing begins.

Focus on:

- Business rules
- Workflow correctness
- Data consistency
- Module integration
- Audit trail
- Testing

Do NOT spend development time on:

- visual redesign
- spacing
- typography
- colors
- icons
- animations
- responsive refinements

unless they are required for a functional feature.

---

## 2. UI Freeze

Until the UI Integration phase:

- Existing layouts remain unchanged.
- Existing component styles remain unchanged.
- Existing navigation remains unchanged unless required for functionality.

New UI should only expose required functionality.

---

## 3. Settings Module Deferred

The Settings module will **not** be implemented during functional milestones.

Reason:

Another developer owns Resource Management and shared master data.

Implementing Settings now would create unnecessary merge conflicts.

Current implementation should:

- use existing data
- use helper functions
- avoid hard dependency on Settings UI

Example:

getSoftwareOptions()

getDeviceTypeOptions()

getProjectOptions()

These helpers can later be redirected to the Settings module without changing business logic.

---

# Functional Milestones

## Milestone 1

Memo Lifecycle

✓ Complete

---

## Milestone 2

Financial Foundation

✓ Complete

---

## Milestone 3A

License Logic

Includes:

- License Review Queue
- License User Mapping
- License Approval Flow
- License Audit
- License end-to-end workflow

Excludes:

- Software Master UI
- Settings UI

---

## Milestone 3B

Device Logic

Includes:

- Purchase Order
- Delivery Flow
- Device Registry
- Hardware Workflow
- Audit

Excludes:

- Device Type Settings
- UI redesign

---

## Milestone 3C

Resource Integration

Focus:

- Resource linkage
- Shared project data
- Integration with teammate's Resource module

No UI redesign.

---

## Milestone 3D

Reporting

Focus:

- Export
- Reports
- Cross-module validation
- Final workflow verification

---

## Milestone 4

Authentication / Authorization

Implemented by Tech Team.

Includes:

- Login
- Roles
- Permissions
- Notifications

---

## Milestone 5

UI Integration

Final phase.

Includes:

- Theme consistency
- Shared components
- Layout refinement
- Responsive improvements
- Iconography
- UX polishing

No business logic changes should occur during this phase.

---

# Golden Rule

Business Logic must never be delayed because of UI work.

UI improvements should never introduce functional regressions.
