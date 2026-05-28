-- Phase D: RLS hardening for branch-scoped WhatsApp templates.
-- Safe to run multiple times.
--
-- Intent:
-- - Service role (used by backend) keeps working as-is (bypasses RLS).
-- - Direct authenticated access is constrained to:
--   - same gym_id, and
--   - owner/master_owner => any branch in that gym
--   - staff => only their gym_code_id branch

create or replace function public.apg_jwt_gym_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      auth.jwt() ->> 'gymId',
      auth.jwt() ->> 'gym_id'
    ),
    ''
  )::uuid;
$$;

create or replace function public.apg_jwt_branch_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      auth.jwt() ->> 'gymCodeId',
      auth.jwt() ->> 'gym_code_id'
    ),
    ''
  )::uuid;
$$;

create or replace function public.apg_jwt_is_owner()
returns boolean
language sql
stable
as $$
  select lower(
    coalesce(
      auth.jwt() ->> 'staffRole',
      auth.jwt() ->> 'staff_role',
      auth.jwt() ->> 'role',
      ''
    )
  ) in ('owner', 'master_owner');
$$;

alter table if exists public.settings_templates enable row level security;

drop policy if exists settings_templates_select_branch_scope on public.settings_templates;
create policy settings_templates_select_branch_scope
  on public.settings_templates
  for select
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists settings_templates_insert_branch_scope on public.settings_templates;
create policy settings_templates_insert_branch_scope
  on public.settings_templates
  for insert
  to authenticated
  with check (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists settings_templates_update_branch_scope on public.settings_templates;
create policy settings_templates_update_branch_scope
  on public.settings_templates
  for update
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  )
  with check (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists settings_templates_delete_branch_scope on public.settings_templates;
create policy settings_templates_delete_branch_scope
  on public.settings_templates
  for delete
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );
