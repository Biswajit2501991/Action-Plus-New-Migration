-- Owner leave balance adjustments (additive ledger — no changes to leave_requests).
-- Safe to run multiple times.

create table if not exists public.leave_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,

  calendar_year integer not null,
  adjustment_days integer not null,
  scope text not null default 'global',
  staff_login_id text,

  reason text,
  balance_snapshot_json jsonb,
  created_by text,
  created_at timestamptz not null default now(),

  constraint leave_balance_adjustments_year_chk check (calendar_year >= 2000 and calendar_year <= 2100),
  constraint leave_balance_adjustments_scope_chk check (scope in ('global', 'individual')),
  constraint leave_balance_adjustments_individual_staff_chk check (
    scope = 'global' or (scope = 'individual' and staff_login_id is not null and char_length(staff_login_id) > 0)
  )
);

create index if not exists leave_balance_adjustments_gym_year_idx
  on public.leave_balance_adjustments (gym_id, calendar_year desc);

create index if not exists leave_balance_adjustments_gym_staff_year_idx
  on public.leave_balance_adjustments (gym_id, staff_login_id, calendar_year)
  where staff_login_id is not null;

comment on table public.leave_balance_adjustments is
  'Immutable owner adjustments to annual leave balance (+/- days). Balance is computed: base + adjustments - approved leave.';
