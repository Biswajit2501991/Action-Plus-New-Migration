-- RLS for leave_balance_adjustments — owner read/write; staff read global + own individual rows.
-- Safe to run multiple times.
-- Uses auth.jwt() ->> 'userId' directly (same as supabase_gym_codes.sql); no apg_jwt_user_id helper.

alter table if exists public.leave_balance_adjustments enable row level security;

drop policy if exists leave_balance_adjustments_select on public.leave_balance_adjustments;
create policy leave_balance_adjustments_select
  on public.leave_balance_adjustments
  for select
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or scope = 'global'
      or (
        scope = 'individual'
        and lower(staff_login_id) = lower(coalesce(auth.jwt() ->> 'userId', ''))
      )
    )
  );

drop policy if exists leave_balance_adjustments_insert_owner on public.leave_balance_adjustments;
create policy leave_balance_adjustments_insert_owner
  on public.leave_balance_adjustments
  for insert
  to authenticated
  with check (
    gym_id = public.apg_jwt_gym_id()
    and public.apg_jwt_is_owner()
  );
