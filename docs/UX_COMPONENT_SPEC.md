# UX Component Specification

## Purpose

This document defines the shared UI component standards for the PMO
Dashboard. It complements `UX_ALIGNMENT_GUIDELINE.md`.

## Principles

-   Do not redesign business workflows.
-   Reuse existing components whenever possible.
-   Keep behavior consistent across all modules.

## Standard Page Rhythm

1.  Module tabs (if applicable)
2.  Optional sub-tabs
3.  KPI cards (when relevant)
4.  Context banner (optional)
5.  Toolbar
6.  Result count
7.  Primary content/table
8.  Secondary summaries

## Toolbar

Left: - Search - Filters - Period selector

Right: - Export - Import / Template (secondary) - Primary action
(Add/Create)

## Buttons

-   Primary: one per page
-   Secondary: supporting actions
-   Danger: destructive actions only

## Tables

-   Row click opens detail.
-   Inline actions only for immediate operational tasks.
-   Audit/history fields belong in detail views where practical.

## Modals

-   Consistent header/body/footer.
-   Primary action bottom-right.
-   Cancel bottom-left.
