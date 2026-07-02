# Phase 7A-9 Scope Tracker

> Working scope tracker for Phase 7A-9.
>
> Purpose:
>
> - Prevent implementation scope creep.
> - Record newly discovered requirements.
> - Track bugs found during implementation.
> - Track deferred work.
> - Ensure every requirement is completed before Phase 7A-10.

---

# Current Phase

**Current Phase**

7A-9A — Budget Pool Foundation

Status

🟡 In Progress

---

# Primary Goal

Budget Pool must have one canonical data contract before any further feature work.

This phase focuses on correctness and consistency.

This is **NOT** a UX redesign phase.

---

# Original Requirements

## R1 — Canonical Budget Pool Contract

Status

🟡

Requirements

- startMonth/endMonth are Source of Truth
- Internal format = Gregorian
- UI display = Buddhist Era
- year is derived
- createBudgetPoolRecord() is the canonical model

---

## R2 — Canonical Read

Status

🟡

Requirements

Every Budget Pool screen must read canonical Budget Pool records.

Includes

- Budget Settings
- Budget vs Actual
- Export
- Assignment
- Edit Modal

---

## R3 — Canonical Write

Status

🟡

Requirements

Every save/update must persist canonical Budget Pool records.

---

## R4 — Budget Pool Year Contract

Status

🟡

Requirements

Budget Settings

↓

Edit Modal

↓

BvA

↓

Export

must always display the same year.

---

## R5 — Canonical Project Source

Status

🟡

Requirements

Budget Pool modal uses canonical project list.

---

## R6 — Foundation Validation

Status

🟡

Requirements

- normalized month
- end >= start
- derived year consistency

---

# New Requirements Discovered During Development

## NR-01

Priority

High

Title

Assignment Budget Pool must use canonical Budget Pool records.

Reason

Assign Budget Pool still exposed corrupted legacy year (3112).

Expected

Assignment selector must never expose non-canonical Budget Pools.

---

## NR-02

Priority

High

Title

User-facing Year must eventually be Buddhist Era everywhere.

Reason

Current UI mixes

- BE
- Gregorian

between pages.

Future Requirement

Every visible year/month shown to users should use Buddhist Era.

Internal storage remains Gregorian.

Deferred to

7A-9B

---

## NR-03

Priority

Medium

Title

Budget Pool Date UX redesign.

Reason

Current Start Month / End Month relies on typed YYYY-MM values.

Future

Replace with proper Month Picker.

Deferred to

7A-9B

---

## NR-04

Priority

Medium

Title

Budget Year selection UX.

Reason

Budget Year is currently readonly.

Future

User selects Budget Year.

Start/End months auto-populate.

Deferred to

7A-9B

---

# Bugs Found During Testing

---

## BUG-01

Title

3112 Year Bug

Status

✅ Fixed

Description

Typing

2569-01

generated

3112.

Cause

BE treated as Gregorian.

---

## BUG-02

Title

Budget Settings filter disagreed with Edit Modal.

Status

🟡

Description

Pool appeared under

2569

while Edit Modal showed

2568.

Root Cause

Raw year vs canonical year.

---

## BUG-03

Title

Assignment Budget Pool displayed year 3112.

Status

🟡

Description

Assignment selector still used raw pool year.

Expected

Canonical year only.

---

## BUG-04

Title

Legacy corrupted pool still assignable.

Status

🟡

Description

Legacy pools with corrupted years can still be selected.

Expected

Assignment should only expose canonical pools.

---

## BUG-05

Title

Actual Spend year filter inconsistent.

Status

🟡 Deferred

Description

Actual Spend displays Gregorian.

Budget Settings displays BE.

Future

Standardize all user-facing years to Buddhist Era.

---

# Explicitly Out of Scope

Do NOT implement in 7A-9A

- Date Picker
- CRUD redesign
- Archive
- Delete workflow
- Delete confirmation
- Delete to Unbudgeted
- Duplicate warning redesign
- Overlap redesign
- Bulk Upload redesign
- Health Check
- Usage Summary
- Supabase migration
- Startup migration
- Normalize button

---

# Deferred to 7A-9B

- Month Picker
- Year Picker
- Full Buddhist Era UI
- Assignment UX
- Duplicate warning
- Overlap warning
- Delete UX
- Archive

---

# Completion Checklist

## Foundation

- [ ] Canonical model complete
- [ ] Canonical read complete
- [ ] Canonical write complete
- [ ] Budget Settings uses canonical year
- [ ] Edit Modal uses canonical year
- [ ] Assignment uses canonical year
- [ ] Export uses canonical year

## Validation

- [ ] Month normalization
- [ ] Derived year validation
- [ ] Save validation

## Regression

- [ ] Automated tests passing
- [ ] Manual smoke tests passing

---

# Exit Criteria

Phase 7A-9A is complete only when:

- All Budget Pool screens use the same canonical model.
- No screen displays inconsistent years.
- No screen exposes year 3112.
- No new corrupted Budget Pool can be created.
- Existing legacy pools behave correctly through canonical reads.
- All regression tests pass.
- Remaining work is documented and deferred.

- # Design Decisions

These decisions are intentional and must not be changed unless explicitly approved.

## DD-01

Budget Pool Source of Truth

Source of Truth

- startMonth
- endMonth

Derived

- year

Internal

- Gregorian

Display

- Buddhist Era

---

## DD-02

Budget Pool Assignment

Assignment is based on Pool ID.

Displayed year is for filtering only.

---

## DD-03

Canonical Read

All Budget Pool reads must pass through createBudgetPoolRecord().

Raw Budget Pool objects must not be used for year-sensitive logic.

---

## DD-04

No Automatic Data Repair

Legacy data may be normalized at runtime.

No automatic migration or rewrite is allowed in this phase.
