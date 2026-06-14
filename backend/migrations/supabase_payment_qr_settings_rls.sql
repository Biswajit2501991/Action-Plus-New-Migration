-- RLS for payment_qr_settings — mirrors branch_custom_templates branch isolation.
-- Safe to run multiple times.

alter table if exists public.payment_qr_settings enable row level security;

drop policy if exists payment_qr_settings_select_branch_scope on public.payment_qr_settings;
create policy payment_qr_settings_select_branch_scope
  on public.payment_qr_settings
  for select
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists payment_qr_settings_insert_branch_scope on public.payment_qr_settings;
create policy payment_qr_settings_insert_branch_scope
  on public.payment_qr_settings
  for insert
  to authenticated
  with check (
    gym_id = public.apg_jwt_gym_id()
    and public.apg_jwt_is_owner()
  );

drop policy if exists payment_qr_settings_update_branch_scope on public.payment_qr_settings;
create policy payment_qr_settings_update_branch_scope
  on public.payment_qr_settings
  for update
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and public.apg_jwt_is_owner()
  )
  with check (
    gym_id = public.apg_jwt_gym_id()
    and public.apg_jwt_is_owner()
  );
