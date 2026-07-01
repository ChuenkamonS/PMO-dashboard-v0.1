# PMO Dashboard Development History

Version: 1.0

---

# Purpose

This document records WHY each implementation phase exists.

It is NOT a changelog.

It is a decision log.

Future AI should understand the reasoning behind each phase before proposing changes.

Never re-implement completed phases.

Never undo architecture decisions without explicit approval.

---

# Project Philosophy

The PMO Dashboard was intentionally developed in small, isolated phases.

Reason:

- Reduce regression risk
- Keep implementation reviewable
- Preserve financial correctness
- Allow architecture validation between phases

Every phase should produce a stable foundation for the next phase.

---

# Development Strategy

The project follows:

Data

↓

Canonical Model

↓

Business Rules

↓

Consumers

↓

UI

Never reverse this order.

---

# Phase 1

## Goal

Create a stable Manual Actual Spend persistence model.

## Delivered

- Manual persistence
- Shared validation
- Canonical projection
- Soft delete
- Import compatibility

## Important Decisions

Manual Spend becomes an independent source system.

Do not merge Manual persistence into Memo persistence.

---

# Phase 2

## Goal

Separate Manual Entries from Reports.

## Delivered

- Manual Entries tab
- Report integration

## Important Decisions

Editing belongs only to Manual Entries.

Reports remain read-only.

---

# Phase 3

## Goal

Complete Manual Entries management.

## Delivered

- Search
- Filter
- Edit
- Delete
- Detail
- QA improvements

## Important Decisions

Manual Entries becomes CRUD owner.

Future modules consume Manual data.

They do not edit it.

---

# Phase 4

## Goal

Align Manual Actual Spend with the intended financial model.

## Delivered

- Amount model
- Vendor / Program
- Notes
- Monthly Preview
- Frequency inference
- Canonical persistence improvements

## Important Decisions

Amount becomes authoritative.

Compatibility fields remain synchronized.

Legacy records remain supported.

---

# Phase 5

## Goal

Persist Software detailLines.

## Delivered

Software detailLines:

- Program
- Plan
- Quantity
- Unit Cost
- Monthly Cost
- Coverage
- Line Amount

## Important Decisions

One Memo

=

One Actual Spend

detailLines explain amount.

detailLines never replace amount.

---

# Phase 6

## Goal

Consume canonical detailLines.

## Delivered

Software Details available through canonical data.

No Forecast redesign.

No BvA redesign.

## Important Decisions

Downstream consumers must use canonical detailLines.

Never parse memo.sections.

Never parse memo.slItems.

---

# Architectural Lessons

The following lessons were learned during implementation.

---

## Lesson 1

Canonical models reduce duplicated logic.

Whenever possible,

consume canonical data.

Do not recreate it.

---

## Lesson 2

Financial totals are sacred.

Never modify totals for UI improvements.

---

## Lesson 3

Architecture evolves.

Do not redesign everything at once.

Prefer incremental improvement.

---

## Lesson 4

Backward compatibility is mandatory.

Never require production data repair.

---

## Lesson 5

Business rules belong in one place.

Duplicated business rules inevitably diverge.

---

## Lesson 6

Analysis before implementation.

Every major phase should begin with:

Analysis

↓

Business Decisions

↓

Implementation

---

# Future Roadmap

The intended implementation order is:

Phase 7A

Budget Pool Data Contract

↓

Phase 7B

Budget vs Actual Cleanup

↓

Phase 8

Forecast

↓

Phase 9

Budget Settings

↓

Phase 10

Architecture Hardening

Do not reorder these phases without explicit approval.

---

# Phase Boundaries

Every phase should satisfy:

One objective.

One responsibility.

One review.

One approval.

Then move on.

Avoid mixing multiple business domains in one implementation.

---

# Rules For Future AI

Do not reopen completed phases unless:

- a confirmed defect exists
- architecture changes require it
- explicit approval is given

Completed phases are considered stable.

Build on top of them.

Do not rebuild them.
