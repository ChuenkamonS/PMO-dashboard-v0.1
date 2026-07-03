-- Milestone 3B — Device Logic.
-- Additive only, same pattern as every prior migration in this repo: an
-- `alter table ... add column if not exists`, no drops, no data rewrite.
--
-- devices: soft delete (deleted/deleted_at/deleted_by), mirroring memos'
-- Milestone 1B soft-delete columns (20260703140000_memo_void_and_soft_delete.sql)
-- so deleteDeviceAsync() (views/device.js) can mark a row deleted instead of
-- issuing a hard DELETE with zero trace.
--
-- devices + purchase_orders: jsonb audit_log column, mirroring
-- budget_manual_expenses.audit_log (20260703170000_manual_expense_audit_log.sql).
-- saveDeviceAsync()/deleteDeviceAsync()/markArrived()/advancePOStatus()/
-- createPurchaseOrdersFromMemo() (views/device.js) append {action, actor,
-- timestamp, comment, statusBefore, statusAfter} entries here going forward.
-- Both write paths retry once without audit_log on the same PGRST204
-- missing-column schema-cache error (isMissingDeviceAuditColumnError()) until
-- this migration is applied, so Create/Edit/Delete/Arrival/Status-change keep
-- persisting their other fields even before this column exists.
alter table public.devices
  add column if not exists deleted boolean not null default false,
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by text,
  add column if not exists audit_log jsonb not null default '[]'::jsonb;

alter table public.purchase_orders
  add column if not exists audit_log jsonb not null default '[]'::jsonb;
