# AGENTS.md

# PMO Dashboard AI Engineering Guide

This document defines how AI coding agents (Codex, Claude Code, ChatGPT, etc.) should work on this repository.

---

# Mission

Build a reliable enterprise PMO Dashboard.

Primary goals (in order):

1. Stability
2. Maintainability
3. Readability
4. Small incremental improvements
5. Performance optimization

Never sacrifice stability for cleaner-looking code.

---

# Project Overview

This application is an internal PMO platform.

Current modules include:

- Dashboard
- Memo Management
- Approval Workflow
- History
- Budget Monitor
- License Registry

Future modules include:

- Authentication
- Role-based permission
- Notification
- E-signature
- User Management
- Analytics

Treat this as an enterprise application rather than a demo project.

---

# Engineering Philosophy

Prefer improving existing code over replacing it.

Never rewrite a working feature simply because another implementation is cleaner.

Small pull requests are preferred.

Every task should minimize risk.

---

# Before Writing Code

Always follow this order.

Step 1

Read the existing implementation.

Understand how the feature currently works.

Never assume.

Step 2

Identify only the files related to the task.

Avoid touching unrelated files.

Step 3

Create a short implementation plan.

If requirements are ambiguous, ask before coding.

Step 4

Implement the smallest possible change.

---

# Scope Control

Unless explicitly requested, DO NOT:

- rename files
- move folders
- reorganize the project
- change routing
- replace libraries
- redesign UI
- reformat the whole project
- rewrite components
- optimize working code

Only modify files required for the requested feature.

---

# Code Style

Use TypeScript.

Prefer explicit types.

Avoid "any".

Keep components easy to understand.

Reuse existing components.

Reuse utilities.

Avoid duplicated logic.

Keep functions focused.

Avoid unnecessary abstraction.

If the same logic is only used once,
do not create a shared helper.

---

# Architecture

Prefer consistency over cleverness.

When multiple solutions exist:

Choose the one that:

- changes fewer files
- introduces less risk
- matches the existing architecture
- is easier for future developers

---

# UI Guidelines

Maintain existing visual style.

Do not redesign components unless requested.

Follow existing spacing.

Reuse colors.

Reuse typography.

Reuse layout patterns.

---

# Database

Prefer extending existing schema.

Never delete columns without instruction.

Never modify production data logic unless requested.

Create safe migrations.

Avoid destructive migrations.

---

# Authentication

Authentication must be isolated.

Do not break existing public pages.

Keep authentication logic separate from business logic.

---

# Approval Workflow

Approval is business critical.

Avoid changing approval logic unless specifically requested.

Future roadmap:

- Multi-level approval
- Digital signature
- Audit trail

Do not make assumptions about business rules.

---

# Budget Module

Financial calculations must remain accurate.

Do not change calculations unless instructed.

If changing calculation logic:

Explain exactly why.

---

# History Module

History should never lose records.

Avoid changing persistence logic unless required.

Filtering should remain backwards compatible.

---

# Error Handling

Fail safely.

Do not swallow errors.

Return meaningful messages.

Keep logs useful.

---

# Performance

Optimize only when needed.

Avoid premature optimization.

Readability is more important.

---

# Dependencies

Avoid installing new packages.

Reuse existing libraries whenever possible.

If a new dependency is required:

Explain why.

---

# Testing

Before completing a task:

- TypeScript compiles
- Lint passes (if configured)
- Existing features still work
- No obvious runtime errors

---

# Response Format

After every implementation provide:

## Summary

What changed

## Files Modified

List all modified files

## Testing

Explain how to verify

## Risks

Mention any known limitation

Keep explanations concise.

---

# Workflow

Every task follows:

Inspect

↓

Plan

↓

Implement

↓

Self Review

↓

Validation

↓

Summary

Never skip inspection.

---

# Working With the User

The repository owner prefers:

- Small incremental improvements
- Minimal code changes
- No unnecessary refactoring
- Stable implementations
- Clear summaries
- Practical solutions over perfect solutions

When uncertain,

ask first.

Do not guess.

---

# Definition of Done

A task is complete only if:

✓ Requested feature works

✓ Existing functionality remains intact

✓ No unrelated files modified

✓ No unnecessary refactoring performed

✓ Summary provided

If these conditions are not met,

the task is not finished.
