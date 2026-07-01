# PMO Dashboard Project Glossary

Version: 1.0

---

# Purpose

This glossary defines the official terminology used throughout the PMO Dashboard.

All AI assistants must use these definitions consistently.

Do not invent alternative meanings.

Do not redefine existing terms.

---

# General Rule

One term

=

One meaning

Always.

---

# Memo

Definition

A business document submitted for approval.

Purpose

Represents a request to spend money.

Ownership

Memo Module

Contains

- Requester
- Project
- Memo Type
- Approval Status
- Original Business Data
- Software Line Items (if Software Memo)

Does NOT represent Actual Spend.

---

# Approved Memo

Definition

A Memo whose approval workflow has completed successfully.

Behavior

Approved Memo becomes eligible to generate Actual Spend.

---

# Software Memo

Definition

A Memo with type = Software License.

Contains

Structured software items.

One Software Memo may contain many software lines.

Still produces one Actual Spend record.

---

# Software Line

Definition

One software item inside a Software Memo.

Examples

Microsoft 365

Adobe CC

GitHub Enterprise

Each Software Line becomes one detailLine.

---

# detailLines

Definition

Child objects explaining a parent Actual Spend record.

Purpose

Provide detail.

Support drill-down.

Support future Forecast display.

Not transactions.

Never authoritative.

---

# Parent Amount

Definition

The authoritative amount stored on the parent Actual Spend record.

Rules

Always authoritative.

Never replaced by detailLines.

---

# Line Amount

Definition

Financial amount represented by one detailLine.

Purpose

Explain parent amount.

Informational only.

---

# Canonical Actual Spend

Definition

Shared financial model consumed by downstream modules.

Consumers

Report

Forecast

Budget vs Actual

Export

Overview

Report Detail

Current Implementation

Materialized projection.

---

# Materialized Projection

Definition

A generated dataset produced from multiple source systems.

Current Sources

Memo

Manual Actual Spend

Infra Cost

Not the master persistence layer.

---

# Reconciliation

Definition

Process that regenerates Canonical Actual Spend.

Purpose

Combine multiple source systems.

Maintain compatibility.

---

# Manual Actual Spend

Definition

Actual Spend entered manually by users.

Owner

Manual Entries module.

---

# Manual Entries

Definition

The CRUD interface for Manual Actual Spend.

Responsibilities

Create

Edit

Delete

Import

Owns Manual persistence.

---

# Infra Cost

Definition

Infrastructure spending.

Independent source system.

Not derived from Memo.

---

# Actual Spend

Definition

Canonical representation of financial spending.

Every downstream financial feature should consume Actual Spend whenever possible.

---

# Budget Pool

Definition

Mapping metadata between Budget and Actual Spend.

Budget Pool does NOT own transactions.

Budget Pool does NOT own Actual Spend.

Budget Pool owns allocation relationships.

---

# Budget Mapping

Definition

Relationship between Actual Spend and Budget Pool.

Purpose

Budget vs Actual.

Not persistence.

---

# Manual Override

Definition

User-selected Budget Pool mapping overriding automatic matching.

Higher priority than automatic mapping.

---

# Orphan Override

Definition

Manual Override pointing to a missing or invalid Budget Pool.

Should never silently disappear.

Must be handled explicitly.

---

# Forecast

Definition

Projected financial view.

Consumes Actual Spend.

Never owns transactions.

Never edits Actual Spend.

---

# Budget vs Actual (BvA)

Definition

Comparison between Budget and Actual Spend.

Consumes:

Budget Pool

Canonical Actual Spend

Never owns transactions.

---

# Report

Definition

Summary view of Actual Spend.

Read-only.

---

# Report Detail

Definition

Detailed view of one Actual Spend record.

Displays canonical information.

Never reconstructs Memo.

---

# Export

Definition

Projection of canonical datasets into downloadable format.

Should not perform independent financial calculations.

---

# Coverage

Definition

Time period over which spending is allocated.

Coverage affects distribution.

Coverage does NOT create new financial value.

---

# Coverage Months

Definition

Number of months included in Coverage.

Used for allocation.

---

# Monthly Cost

Definition

Recurring cost per month.

Usually:

Unit Cost × Quantity

Not authoritative.

Derived.

---

# Unit Cost

Definition

Cost per unit.

Example

License cost.

---

# Quantity

Definition

Number of purchased units.

---

# Vendor Program

Definition

Display field representing vendor/program information.

Not a financial key.

Not a unique identifier.

---

# Canonical Consumer

Definition

Any module that reads Canonical Actual Spend instead of reconstructing source data.

Examples

Report

Forecast

Export

Overview

---

# Source System

Definition

A module that owns original business data.

Current Source Systems

Memo

Manual Actual Spend

Infra Cost

Budget Pool

---

# Business Rule

Definition

Rule governing financial behavior.

Must exist in one place only.

Never duplicate.

---

# Financial Invariant

Definition

Rule that must never change unless explicitly approved.

Examples

One Memo = One Actual Spend

Parent Amount is authoritative

No double counting

---

# Backward Compatibility

Definition

Ability for older production data to continue working without manual repair.

Mandatory.

---

# Phase

Definition

A controlled implementation milestone.

Each phase owns one objective.

Do not mix phases.

---

# Out of Scope

Definition

Anything explicitly excluded from the current implementation.

Must not be modified.

Should be reported instead.

---

# Canonical Rule

Whenever a term is ambiguous,

this glossary is authoritative.

AI assistants should use these definitions consistently throughout implementation, testing, analysis, reviews, and documentation.
