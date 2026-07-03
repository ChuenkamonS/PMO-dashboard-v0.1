# PMO Dashboard — Release Plan (Revised)

Last Updated: 2026-07-03

---

# Release Philosophy

Release order follows functionality rather than visual completeness.

The application should become operational first.

Visual refinement comes only after all business workflows are stable.

---

# Phase 1

Core Memo System

Status:

Completed

Includes:

- Memo lifecycle
- Approval
- Override
- Void
- Draft
- Audit

---

# Phase 2

Financial Module

Status:

Completed

Includes:

- Budget Pool
- Actual Spend
- Budget Tag
- Financial audit
- THB workflow

---

# Phase 3

Operational Modules

Current Development Phase

Includes:

License

- Review Queue
- User Assignment
- Approval Flow

Device

- Purchase Orders
- Delivery
- Registry

Resource

- Integration only

Excludes

- Settings UI
- UI redesign
- Master Data UI

---

# Phase 4

System Integration

Includes

- Resource merge
- Shared master data
- Settings module
- Cross-module validation

---

# Phase 5

Infrastructure

Owned by Tech Team

Includes

- Authentication
- Authorization
- Notification
- Production configuration

---

# Phase 6

UI Integration

Owned by UI developer.

Objectives

- Unified design language
- Common spacing
- Consistent tables
- Consistent cards
- Shared dialogs
- Icons
- Theme
- Responsive layout

No functional redesign.

---

# Release Gates

Before moving to the next phase:

✓ Functional testing passed

✓ Automated tests passed

✓ Business rules verified

✓ Audit logging verified

✓ End-to-end workflow verified

---

# Deployment Rule

Every functional milestone must be stable before UI work begins.

Business logic takes priority over visual improvements.

No UI optimization should modify or break validated workflows.
