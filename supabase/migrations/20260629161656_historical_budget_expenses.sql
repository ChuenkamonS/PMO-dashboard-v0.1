create table if not exists public.budget_manual_expenses (
  id text primary key,
  entry_kind text not null default 'historical'
    check (entry_kind in ('historical', 'adjustment', 'other')),
  reference_no text,
  project text not null,
  budget_pool_id text
    references public.budget_pools(id) on delete set null,
  expense_type text not null
    check (expense_type in ('sl', 'hw', 'int', 'ent', 'dep', 'infra', 'other')),
  description text not null,
  frequency text not null default 'one_time'
    check (frequency in ('one_time', 'monthly')),
  expense_date date,
  start_month text,
  end_month text,
  quantity numeric not null default 1 check (quantity > 0),
  unit_cost numeric not null default 0 check (unit_cost >= 0),
  amount numeric not null check (amount > 0),
  notes text,
  created_by text,
  updated_by text,
  voided_at timestamp with time zone,
  voided_by text,
  void_reason text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint budget_manual_expenses_schedule_check check (
    (frequency = 'one_time' and expense_date is not null)
    or
    (frequency = 'monthly'
      and start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      and start_month <= end_month)
  )
);

create index if not exists budget_manual_expenses_project_date_idx
  on public.budget_manual_expenses(project, expense_date)
  where voided_at is null;

create index if not exists budget_manual_expenses_pool_idx
  on public.budget_manual_expenses(budget_pool_id)
  where voided_at is null;

create index if not exists budget_manual_expenses_reference_idx
  on public.budget_manual_expenses(reference_no)
  where reference_no is not null;

alter table public.budget_manual_expenses enable row level security;

revoke all on table public.budget_manual_expenses from anon, authenticated;
grant select, insert, update on table public.budget_manual_expenses to anon, authenticated;

create policy "budget_manual_expenses_select"
  on public.budget_manual_expenses for select
  to anon, authenticated
  using (true);

create policy "budget_manual_expenses_insert"
  on public.budget_manual_expenses for insert
  to anon, authenticated
  with check (true);

create policy "budget_manual_expenses_update"
  on public.budget_manual_expenses for update
  to anon, authenticated
  using (true)
  with check (true);
