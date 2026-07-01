alter table public.budget_manual_expenses
  add column if not exists vendor_program text;
