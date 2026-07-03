-- Milestone 1B: Memo-side Void lifecycle + Draft soft delete.
-- Additive only — no existing column is altered or removed. Per TD-M1-01,
-- no baseline migration exists yet for public.memos; this is scoped to the
-- new Milestone 1B columns only.

alter table public.memos
  add column if not exists voided_at timestamp with time zone,
  add column if not exists voided_by text,
  add column if not exists void_reason text,
  add column if not exists void_evidence_url text,
  add column if not exists deleted boolean not null default false,
  add column if not exists deleted_at timestamp with time zone,
  add column if not exists deleted_by text,
  add column if not exists delete_reason text;
