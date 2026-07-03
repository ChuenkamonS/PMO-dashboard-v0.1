-- Milestone 2 — Financial Foundation.
-- Additive only, per TD-M1-01: no baseline `create table` migration exists in
-- version control for memos, devices, or purchase_orders, so every change
-- here is an `alter table ... add column if not exists`, consistent with
-- every prior migration in this repo.

-- Task 2.1 — THB/USD currency support. Explicit at the memo level; no FX
-- conversion column is added (none is implemented).
alter table public.memos
  add column if not exists currency text not null default 'THB';

-- Task 2.3 — Created By / Updated By metadata (docs/SYSTEM_OVERVIEW.md §5).
alter table public.memos
  add column if not exists created_by text,
  add column if not exists updated_by text;

alter table public.devices
  add column if not exists created_by text,
  add column if not exists updated_by text;

alter table public.purchase_orders
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists created_by text,
  add column if not exists updated_by text;

alter table public.budget_pools
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists created_by text,
  add column if not exists updated_by text;
