-- Additive PT trainer expense pending (confirm before Finance expense).
-- Does NOT modify members amounts or payment history.
-- Safe to run multiple times.

create table if not exists public.pt_trainer_expense_pending (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_code text not null,
  member_name text not null default '',
  member_mobile text not null default '',
  assigned_gym_code_id uuid null references public.gym_codes (id) on delete set null,
  trainer_staff_login_id text not null,
  trainer_name text not null default '',
  service_month text not null,
  amount_inr numeric(12, 2) not null,
  status text not null default 'pending',
  payment_method text null,
  expense_external_tx_id text null,
  created_by_staff_login_id text not null default '',
  created_by_staff_name text not null default '',
  declined_at timestamptz null,
  confirmed_at timestamptz null,
  dismissed_at timestamptz null,
  dismissed_by_staff_login_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pt_trainer_expense_pending_month_chk check (service_month ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint pt_trainer_expense_pending_amount_chk check (amount_inr >= 0),
  constraint pt_trainer_expense_pending_status_chk check (
    status in ('pending', 'declined', 'confirmed', 'dismissed_by_owner')
  ),
  constraint pt_trainer_expense_pending_method_chk check (
    payment_method is null or payment_method in ('cash', 'online')
  ),
  constraint pt_trainer_expense_pending_member_month_uidx unique (gym_id, member_code, service_month)
);

create index if not exists pt_trainer_expense_pending_gym_status_idx
  on public.pt_trainer_expense_pending (gym_id, status, created_at desc);

create index if not exists pt_trainer_expense_pending_gym_trainer_idx
  on public.pt_trainer_expense_pending (gym_id, trainer_staff_login_id, status);

create index if not exists pt_trainer_expense_pending_gym_branch_idx
  on public.pt_trainer_expense_pending (gym_id, assigned_gym_code_id, status);

comment on table public.pt_trainer_expense_pending is
  'PT trainer payout confirmations. Expense created only after trainer Yes. Not member billing.';

alter table if exists public.pt_trainer_expense_pending enable row level security;

drop policy if exists pt_trainer_expense_pending_select_gym on public.pt_trainer_expense_pending;
create policy pt_trainer_expense_pending_select_gym
  on public.pt_trainer_expense_pending
  for select
  to authenticated
  using (gym_id = public.apg_jwt_gym_id());

drop policy if exists pt_trainer_expense_pending_write_gym on public.pt_trainer_expense_pending;
create policy pt_trainer_expense_pending_write_gym
  on public.pt_trainer_expense_pending
  for all
  to authenticated
  using (gym_id = public.apg_jwt_gym_id())
  with check (gym_id = public.apg_jwt_gym_id());

notify pgrst, 'reload schema';
