# SYSTEM_STATE_MACHINE.md

Version: 1.0  
Last Updated: 2026-07-03  
Owner: PMO

---

## 1. Purpose

This document defines system state transitions for Memo and downstream modules.

It should be used by:

- PMO
- BA
- UX designer
- Developer
- QA
- Tech Team

This file prevents each tab from interpreting memo status differently.

---

## 2. Memo State Machine

```text
Draft
  │
  │ Submit
  ▼
Pending
  ├── Reject ─────────► Rejected
  ├── Cancel ─────────► Cancelled
  ├── PMO Override ───► Approved / Rejected
  │
  │ Sequential Approval Complete
  ▼
Approved
  │
  │ PMO Void, only if allowed
  ▼
Voided
```

---

## 3. State Transition Table

| From | To | Trigger | Actor | Notes |
|---|---|---|---|---|
| Draft | Pending | Submit memo | Requester | Starts approval flow |
| Draft | Deleted | Delete draft | Requester / PMO | Soft delete only |
| Pending | Approved | Approval completed | Approvers | Sequential approval required |
| Pending | Approved | Override final approval | PMO | Evidence required |
| Pending | Rejected | Reject | Approver / PMO override | Terminal |
| Pending | Cancelled | Cancel | Requester / PMO | Terminal |
| Approved | Voided | Void | PMO | Only before irreversible downstream impact |
| Rejected | Draft/New Memo | Duplicate | Requester / PMO | New memo number required |
| Cancelled | Draft/New Memo | Duplicate | Requester / PMO | New memo number required |
| Voided | Draft/New Memo | Duplicate | Requester / PMO | New memo number required |

---

## 4. Terminal States

Terminal states:

- Rejected
- Cancelled
- Voided

Terminal means the memo itself does not continue forward.

However, user may duplicate the memo to create a new memo request.

Duplicate creates a new memo record and must not reuse the original memo number.

---

## 5. Approval Step Machine

Each approval step should have its own status.

```text
Pending
  ├── Approved
  ├── Rejected
  ├── Bypassed
  └── Overridden
```

Approval flow is sequential:

```text
A1 / Reviewer
  ↓
A2
  ↓
A3, if provided
```

If requester is also A1 / Reviewer:

```text
A1 = Bypassed
  ↓
A2
```

PMO may override one approval step without completing the full memo approval.

Example:

```text
A1 = Approved in system
A2 = Overridden by PMO with email evidence
A3 = Pending in system
```

---

## 6. Memo Status and Downstream Impact

| Memo Status | Budget & Spend | License Management | Device Management |
|---|---|---|---|
| Draft | No impact | No impact | No impact |
| Pending | No impact | No impact | No impact |
| Approved | Count as Actual | Create / update license records if License memo | Create PO if Hardware memo |
| Rejected | No impact | No impact | No impact |
| Cancelled | No impact | No impact | No impact |
| Voided | Excluded from Actual | Inactivate / exclude related license records if applicable | Block or require manual downstream resolution |

---

## 7. License State Flow

Approved License memo may contain multiple software line items.

The system should display license records by software line item.

```text
Approved License Memo
  ↓
License Line Items
  ↓
License Index
  ↓
License Summary
  ↓
User License Mapping
```

If account list exists in approved memo:

```text
Approved License Memo Account List
  ↓
PMO Review Queue
  ├── Approve All
  │     ↓
  │   User License Mapping
  └── Reject All
        ↓
      Manual assignment later
```

PMO review queue should be shown in License Management > User, above the main user license table.

Other Subscription does not flow into Budget & Spend.

---

## 8. Hardware State Flow

Approved Hardware memo creates Purchase Order records.

Hardware memo may contain multiple item lines.

Each item line may request multiple units.

```text
Approved Hardware Memo
  ↓
Purchase Order
  ↓
Waiting Purchase / Purchased
  ↓
Partially Arrived
  ↓
Arrived
  ↓
Device Registry
```

When devices arrive, system should create device registry records per physical unit.

Example:

```text
Memo requests 5 laptops
3 laptops arrive
→ 3 device records created
→ PO status = Partially Arrived

Remaining 2 laptops arrive later
→ 2 more device records created
→ PO status = Arrived
```

Device records created from PO should retain reference to original memo.

Manual device add and bulk upload do not require memo reference.

---

## 9. Device Status

Confirmed minimum device statuses:

- Available
- In Use

Optional future statuses:

- Repair
- Retired
- Lost
- Disposed

Detailed device lifecycle should be finalized during Device Management redesign.

---

## 10. Budget & Spend State Rules

Budget & Spend consumes approved memo data only.

Rules:

- Approved memo = included in Actual Spend
- Draft = excluded
- Pending = excluded
- Rejected = excluded
- Cancelled = excluded
- Voided = excluded

Voided memo remains in database and All Memo but must be excluded from financial totals.

Budget tagging may happen from:

- All Memo approved detail
- Budget & Spend tagging workflow

---

## 11. Master Data State Rules

Project must come from master list.

Approver and Reviewer use the same person master list.

Person master record should include:

- Name
- Position
- Email

Software name should support hybrid entry:

1. Suggest from master list.
2. Allow free text if not found.
3. New free-text software does not automatically become master data.
4. PMO must approve before it becomes part of the software master list.

Device type should be managed as master data.

---

## 12. Deletion State

Deletion should be soft delete.

```text
Active Record
  ↓
Soft Deleted
```

Soft deleted record:

- Hidden from normal UI
- Retained in database
- Available for audit

---

## 13. Timestamp Rule

Business-facing timestamp should use Bangkok time.

Timezone:

```text
Asia/Bangkok
```

This applies to:

- Created Date
- Updated Date
- Submitted Date
- Approved Date
- Rejected Date
- Cancelled Date
- Override Date
- Void Date
- Deleted Date
- Device status update date
- License assignment date

---

## 14. Currency State Rule

The system supports THB only, for now.

Decision (2026-07-03): USD support (previously required here) was reverted — there is no
confirmed USD use case in current PMO workflow, and multi-currency created unnecessary
complexity across Budget & Spend, Actual Spend, PDF, Export, Forecast, and downstream modules.
Currency is still stored at record/line-item level (a dormant field, always THB) so financial
records remain clear and auditable, and so USD can be reintroduced later without a schema change
if a confirmed use case emerges.

Conversion logic remains out of scope.

---

## 15. Audit State Rule

Formal version history is not required.

Audit log is required.

Every important state transition should produce an audit entry.

Audit entry should include:

- Entity type
- Entity ID
- Action
- Actor
- Timestamp
- Previous state or value
- New state or value
- Reason, if applicable
- Evidence attachment, if applicable
