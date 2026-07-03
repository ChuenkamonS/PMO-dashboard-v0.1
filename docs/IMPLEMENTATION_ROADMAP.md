# IMPLEMENTATION_ROADMAP.md

Version: 1.0
Status: Active

## Objective

Implement the PMO Dashboard using the approved business requirements and Full System Gap Audit.

## Source Documents

- SYSTEM_OVERVIEW.md
- MEMO_LIFECYCLE.md
- SYSTEM_STATE_MACHINE.md
- FULL_SYSTEM_GAP_AUDIT_2026-07-03.md

---

# Milestone 1 — Core Lifecycle Foundation (Critical)

Goal:
- Complete memo lifecycle integrity.

Scope:
- Void lifecycle
- Soft delete
- Audit framework
- Shared lifecycle/status rules
- Approved memo immutability

Definition of Done:
- Lifecycle matches MEMO_LIFECYCLE.md
- All lifecycle tests pass

Status: TODO

---

# Milestone 2 — Financial Foundation

Scope:
- THB-only currency support (USD support shipped, then reverted 2026-07-03 — no confirmed use case; see docs/TECHNICAL_DEBT.md)
- Bangkok timezone
- Created/Updated metadata
- Memo number uniqueness
- Financial consistency

Definition of Done:
- Financial calculations remain correct
- Metadata stored consistently

Status: TODO

---

# Milestone 3 — License & Device Foundation

Scope:
- License review queue
- Software master approval
- Purchase Order improvements
- Partially Arrived
- Device Registry consistency

Definition of Done:
- License and Device downstream flow matches requirements

Status: TODO

---

# Milestone 4 — UX & Workflow Consistency

Scope:
- Approved PDF
- Override UX
- Validation
- Approval timeline
- Empty states
- Shared table behavior

Definition of Done:
- UX consistent across modules

Status: TODO

---

# Milestone 5 — QA & Hardening

Scope:
- Regression tests
- Documentation alignment
- Cleanup
- Final verification

Definition of Done:
- All required tests pass
- Documentation updated

Status: TODO

---

## Working Rule

Each milestone must:
1. Read all requirement documents.
2. Implement only the current milestone.
3. Run tests.
4. Update CHANGELOG.
5. Stop for review.
