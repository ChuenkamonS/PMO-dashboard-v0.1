-- Manual Entry audit timeline follow-up (2026-07-03).
-- Additive only, same pattern as every prior migration in this repo: an
-- `alter table ... add column if not exists`, no drops, no data rewrite.
--
-- budget_manual_expenses gets a jsonb audit_log column, mirroring how memos
-- already store their own auditLog (memos.audit_log). saveManualExpenseAsync()
-- and voidManualExpenseAsync() (views/budget.js) append {action, actor,
-- timestamp, comment} entries here going forward. Existing rows saved before
-- this column existed simply have an empty/null audit_log — the UI
-- (manualExpenseAuditTimeline(), views/budget.js) synthesizes a minimal
-- timeline for those from their existing created/updated/voided columns
-- instead of requiring a backfill.
alter table public.budget_manual_expenses
  add column if not exists audit_log jsonb not null default '[]'::jsonb;
