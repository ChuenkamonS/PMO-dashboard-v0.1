# CLAUDE_IMPLEMENTATION_PROMPT.md

Read the following documents before making any code changes:

- docs/SYSTEM_OVERVIEW.md
- docs/MEMO_LIFECYCLE.md
- docs/SYSTEM_STATE_MACHINE.md
- docs/IMPLEMENTATION_ROADMAP.md
- docs/RELEASE_PLAN.md
- docs/audits/FULL_SYSTEM_GAP_AUDIT_2026-07-03.md

Goal:
Implement ONLY the current milestone selected from IMPLEMENTATION_ROADMAP.md.

Rules:
- Do not implement future milestones.
- Do not introduce new business rules.
- Preserve existing behavior unless it conflicts with the requirement documents.
- Keep changes minimal and localized.
- Reuse existing utilities where possible.
- Add or update tests for every behavior change.
- Update CHANGELOG.md.
- Stop after implementation and report:
  1. Files modified
  2. Summary
  3. Tests executed
  4. Remaining issues
