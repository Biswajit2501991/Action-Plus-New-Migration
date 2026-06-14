-- RLS for branch_custom_templates — mirrors settings_templates branch isolation.
-- Safe to run multiple times.
--
-- No DELETE policy: archival uses UPDATE (is_active=false, status=archived) only.

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

alter table if exists public.branch_custom_templates enable row level security;

drop policy if exists branch_custom_templates_select_branch_scope on public.branch_custom_templates;
create policy branch_custom_templates_select_branch_scope
  on public.branch_custom_templates
  for select
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists branch_custom_templates_insert_branch_scope on public.branch_custom_templates;
create policy branch_custom_templates_insert_branch_scope
  on public.branch_custom_templates
  for insert
  to authenticated
  with check (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists branch_custom_templates_update_branch_scope on public.branch_custom_templates;
create policy branch_custom_templates_update_branch_scope
  on public.branch_custom_templates
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
