-- Per-branch Member Portal soft gates (additive only).
-- Safe to run multiple times.
--
-- Does NOT modify members.portal_enabled / portal_status, member_portal_settings
-- (gym-wide), payments, WhatsApp, or audit tables.
--
-- Missing row = fully allowed (same behavior as today).
-- portal_sections NULL = inherit gym-wide member_portal_settings.portal_sections.

create table if not exists public.member_portal_branch_settings (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  gym_code_id uuid not null references public.gym_codes (id) on delete cascade,

  -- Soft kill switch for Member Portal login for this branch's members.
  portal_enabled boolean not null default true,

  -- Sparse/full section map; NULL means inherit gym-wide portal_sections.
  portal_sections jsonb null,

  updated_by text,
  updated_at timestamptz not null default now(),

  constraint member_portal_branch_settings_gym_branch_uidx unique (gym_id, gym_code_id)
);

create index if not exists member_portal_branch_settings_gym_idx
  on public.member_portal_branch_settings (gym_id);

comment on table public.member_portal_branch_settings is
  'Owner per-branch Member Portal soft gates. Missing row = portal allowed + inherit gym-wide tiles.';

comment on column public.member_portal_branch_settings.portal_enabled is
  'When false, Member Portal login/session is blocked for members of this branch without rewriting members.portal_enabled.';

comment on column public.member_portal_branch_settings.portal_sections is
  'Optional override of home tiles / portal sections. NULL inherits gym-wide member_portal_settings.portal_sections.';

alter table if exists public.member_portal_branch_settings enable row level security;

drop policy if exists member_portal_branch_settings_select_branch_scope
  on public.member_portal_branch_settings;
create policy member_portal_branch_settings_select_branch_scope
  on public.member_portal_branch_settings
  for select
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists member_portal_branch_settings_insert_owner
  on public.member_portal_branch_settings;
create policy member_portal_branch_settings_insert_owner
  on public.member_portal_branch_settings
  for insert
  to authenticated
  with check (
    gym_id = public.apg_jwt_gym_id()
    and public.apg_jwt_is_owner()
  );

drop policy if exists member_portal_branch_settings_update_owner
  on public.member_portal_branch_settings;
create policy member_portal_branch_settings_update_owner
  on public.member_portal_branch_settings
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

drop policy if exists member_portal_branch_settings_delete_owner
  on public.member_portal_branch_settings;
create policy member_portal_branch_settings_delete_owner
  on public.member_portal_branch_settings
  for delete
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and public.apg_jwt_is_owner()
  );
