-- Hotfix: Memo Detail Restore.
-- Hardware rows, the SL account table, INT participant names, and DEP line
-- items were previously only rendered into the read-only `sections` HTML
-- blob, so Save Draft -> Re-edit and Duplicate could not restore them into
-- the form. Additive only — no existing column is altered or removed.

alter table public.memos
  add column if not exists hw_items jsonb not null default '[]'::jsonb,
  add column if not exists hw_owner text,
  add column if not exists acct_cols jsonb not null default '[]'::jsonb,
  add column if not exists acct_rows jsonb not null default '[]'::jsonb,
  add column if not exists int_names jsonb not null default '[]'::jsonb,
  add column if not exists dep_items jsonb not null default '[]'::jsonb;
