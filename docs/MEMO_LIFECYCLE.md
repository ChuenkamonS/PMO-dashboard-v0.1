# MEMO_LIFECYCLE.md

Version: 1.0  
Last Updated: 2026-07-03  
Owner: PMO

---

## 1. Purpose

This document defines the lifecycle of a Memo in the PMO Dashboard.

It is the source of truth for:

- Memo statuses
- Allowed actions per status
- Approval logic
- Override rules
- PDF handling
- Void handling
- Downstream module impact
- Audit requirements

---

## 2. Memo Statuses

The system supports the following memo statuses:

1. Draft
2. Pending
3. Approved
4. Rejected
5. Cancelled
6. Voided

---

## 3. Status Meaning

### 3.1 Draft

Memo has been created but not submitted for approval.

Draft has no downstream impact.

---

### 3.2 Pending

Memo has been submitted and is waiting for approval.

Pending memo has no financial impact yet.

Pending memo may be downloaded as PDF for external approval.

---

### 3.3 Approved

Memo has completed the required approval flow.

Approved memo creates downstream business impact depending on memo type.

Approved memo cannot be edited.

---

### 3.4 Rejected

Memo was rejected by an approver or PMO override.

Rejected is terminal.

User may duplicate the memo to create a new memo request.

---

### 3.5 Cancelled

Memo was cancelled before approval completion.

Cancelled is terminal.

Requester and PMO may cancel a Pending memo.

Approver cannot cancel; approver can only approve or reject.

---

### 3.6 Voided

Memo was previously Approved but later invalidated by PMO.

Voided memo remains visible for audit but is excluded from financial calculations.

Requester should be able to see Voided memo so they know the original approved memo is no longer valid and may create a new request if needed.

---

## 4. Allowed Actions by Status

| Status | Requester | Approver | PMO / Admin |
|---|---|---|---|
| Draft | Edit, Delete, Submit | - | View, Edit if needed, Delete if needed |
| Pending | View, Download PDF, Cancel | View, Download PDF, Approve, Reject | View, Download PDF, Cancel, Override |
| Approved | View, Download PDF, Duplicate | View, Download PDF | View, Download PDF, Duplicate, Tag Budget, Void if allowed |
| Rejected | View, Duplicate | View | View, Duplicate, Audit |
| Cancelled | View, Duplicate | View | View, Duplicate, Audit |
| Voided | View, Duplicate | View | View, Duplicate, Audit |

Permission enforcement will be implemented later by the Tech Team, but these rules define the expected business behavior.

---

## 5. Memo Number Rules

Memo Number is manually entered because it may come from an external request process.

Rules:

- System does not generate Memo Number.
- Memo Number must be unique.
- Duplicate Memo Number is not allowed.
- Duplicate Memo action must not copy Memo Number.
- User must enter a new Memo Number when creating a duplicated memo.
- Original memo reference may be stored as `duplicatedFromMemoId` or similar backend reference.

---

## 6. Approval Logic

Approval must be sequential.

Approval path supports:

- Minimum 2 approvers
- Maximum 3 approvers

Approval sequence:

```text
Reviewer / A1
  ↓
A2
  ↓
A3, if provided
```

If requester is also Reviewer / A1, A1 is automatically bypassed and approval continues to A2.

Approved memo cannot be edited.

If an approved memo is wrong, PMO should Void it if allowed and the requester should create a new memo.

---

## 7. Approval Step Status

Each approval step should be tracked separately.

Suggested approval step statuses:

- Pending
- Approved
- Rejected
- Bypassed
- Overridden

This supports cases where PMO overrides only one approval step while later approvers continue approving in the system.

---

## 8. PMO Override

PMO may override approval when approval occurs outside the system, such as email approval or signed document approval.

Override can be used for:

1. Specific approval step
2. Final memo approval
3. Rejection, if supported by PMO operation

Override must not be silent.

Override must capture:

- Memo ID
- Approval step, if applicable
- Previous status
- New status
- Approver name
- PMO operator
- Reason
- Evidence attachment
- Timestamp

Evidence attachment may be:

- PDF
- Image
- Email screenshot
- Signed document

---

## 9. PDF Handling

### 9.1 Pending PDF

Pending memo PDF can be downloaded.

Reason:

- It may be used for external approval.
- Approver may approve through email or other external process.

Pending PDF should not use watermark if that would make external approval difficult.

---

### 9.2 Approved PDF

Approved memo PDF is the official approved version.

It should show:

- Memo details
- Approval status
- Approval log
- Approver name
- Approval timestamp
- Approval method

If digital signature is available, it may be shown.

If digital signature is not available, approval log and timestamp are the proof of approval.

---

### 9.3 External Signed Evidence

External signed documents should be stored as evidence attachments.

The system does not need to merge external signed documents into the generated memo PDF.

Audit trail should link the evidence attachment to the relevant approval step or override action.

---

## 10. Downstream Impact by Memo Type

| Memo Type | Downstream Impact |
|---|---|
| License | License Management + Budget & Spend |
| Hardware | Device Management + Budget & Spend |
| Internal team activity | Budget & Spend |
| Customer entertainment | Budget & Spend |
| Deployment expense | Budget & Spend |

Only Approved memo creates downstream impact.

Rejected, Cancelled, Draft, and Voided memos must not be counted as Actual Spend.

---

## 11. Void Rules

Only PMO may Void an Approved memo.

Voided memo:

- Remains in database
- Remains visible in All Memo
- Is visible to requester
- Is excluded from Actual Spend calculations
- Can be duplicated
- Keeps audit history

Void action must capture:

- Void reason
- Void by
- Void timestamp
- Evidence attachment, if any

---

## 12. Void Constraint

Void is allowed only when the memo has no irreversible downstream impact.

Example allowed:

```text
Approved Hardware Memo
  ↓
PO Created
  ↓
Waiting Purchase
```

Void may be allowed.

Example not allowed:

```text
Approved Hardware Memo
  ↓
PO Created
  ↓
Device Arrived
  ↓
Device Registry Created
```

Void should be blocked.

System should show a warning:

```text
This memo has already created downstream records. Please resolve downstream records before voiding.
```

---

## 13. Financial Handling

Approved memo counts as Actual Spend.

Voided memo does not count as Actual Spend.

The memo record remains in the database for audit, but Budget & Spend calculations must exclude it.

---

## 14. Currency

Memo and downstream spend records must support THB only, for now.

Decision (2026-07-03): USD support was reverted — there is no confirmed USD use case in current
PMO workflow. Currency is still stored explicitly at transaction/line-item level (a dormant
field, always THB), so USD can be reintroduced later without a schema change if a confirmed use
case emerges. No FX conversion is implemented or planned while currency remains THB-only.

---

## 15. Delete Policy

Only Draft memo can be deleted from the user perspective.

Delete should be implemented as soft delete.

Deleted draft should disappear from normal UI but remain in database for audit.

---

## 16. Time Zone

Business-facing date and time should use:

- Asia/Bangkok

All displayed approval, override, cancel, void, and audit timestamps should be shown in Bangkok time.

---

## 17. Audit Log

Formal version history is not required.

Audit log is required.

Audit log should capture:

- Action
- Actor
- Timestamp
- Previous value or status
- New value or status
- Reason, if applicable
- Evidence attachment, if applicable

Audit log must be used for:

- Submit
- Approve
- Reject
- Cancel
- Override
- Void
- Delete Draft
- Duplicate
- Download PDF, optional if needed
- Budget tag change
