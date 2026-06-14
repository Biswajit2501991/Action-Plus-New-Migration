-- Phase 0: Row Level Security for gym isolation (defense in depth).
-- Run once in Supabase SQL Editor.
--
-- Notes:
-- - The Node API uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
-- - RLS blocks direct PostgREST access with anon/authenticated keys.
-- - For JWT-scoped policies to work with Supabase clients, configure the same
--   JWT_SECRET in Supabase Dashboard → Project Settings → API → JWT Secret,
--   and pass staff tokens as Authorization: Bearer <token> (claim: gymId).

-- Helper: gym id from Supabase Auth JWT (custom claim from our login token).
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

-- Tables with gym_id column: enable RLS (no permissive policies = deny anon/authenticated).
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'members',
    'staff_users',
    'staff_role_templates',
    'settings_lookup_values',
    'settings_templates',
    'branch_custom_templates',
    'settings_app_config',
    'settings_staff_directory',
    'leave_requests',
    'staff_attendance_records',
    'pt_client_profiles',
    'visitors',
    'finance_transactions',
    'audit_logs',
    'sms_status_events',
    'member_payment_history',
    'member_message_history',
    'member_attachments',
    'member_injury_notes'
  ]
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);
    end if;
  end loop;
end $$;

-- Optional: authenticated staff using Supabase client + our JWT (after JWT secret is aligned).
-- Uncomment when Supabase JWT secret matches backend JWT_SECRET.

/*
create policy gym_isolation_members on public.members
  for all to authenticated
  using (gym_id = public.apg_jwt_gym_id())
  with check (gym_id = public.apg_jwt_gym_id());

create policy gym_isolation_staff_users on public.staff_users
  for all to authenticated
  using (gym_id = public.apg_jwt_gym_id())
  with check (gym_id = public.apg_jwt_gym_id());
*/

-- Child tables without gym_id: scope via staff_users or members.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'staff_user_sections') then
    alter table public.staff_user_sections enable row level security;
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'staff_user_access') then
    alter table public.staff_user_access enable row level security;
  end if;
end $$;

/*
create policy gym_isolation_staff_sections on public.staff_user_sections
  for all to authenticated
  using (
    exists (
      select 1 from public.staff_users su
      where su.id = staff_user_sections.staff_user_id
        and su.gym_id = public.apg_jwt_gym_id()
    )
  );
*/
