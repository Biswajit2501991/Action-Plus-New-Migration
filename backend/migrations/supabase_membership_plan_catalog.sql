-- Additive membership plan catalog (sales/showcase metadata).
-- Safe to run multiple times.
--
-- Does NOT modify members, member_payment_history, settings_lookup_values plans list,
-- or Finance. Catalog price is display-only; assignment still uses plan name strings.

create table if not exists public.membership_plan_catalog (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  gym_code_id uuid not null references public.gym_codes (id) on delete cascade,
  plan_name text not null,

  list_price_inr numeric(12, 2) null,
  tagline text not null default '',
  details text not null default '',
  inclusions jsonb not null default '[]'::jsonb,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,

  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint membership_plan_catalog_gym_branch_plan_uidx unique (gym_id, gym_code_id, plan_name),
  constraint membership_plan_catalog_plan_name_len_chk check (
    char_length(trim(plan_name)) >= 1
    and char_length(plan_name) <= 80
  ),
  constraint membership_plan_catalog_tagline_len_chk check (
    char_length(tagline) <= 200
  ),
  constraint membership_plan_catalog_details_len_chk check (
    char_length(details) <= 8000
  ),
  constraint membership_plan_catalog_price_chk check (
    list_price_inr is null or list_price_inr >= 0
  )
);

create index if not exists membership_plan_catalog_gym_branch_sort_idx
  on public.membership_plan_catalog (gym_id, gym_code_id, sort_order, plan_name);

comment on table public.membership_plan_catalog is
  'Staff-facing membership plan showcase metadata, per gym branch. Does not drive member amounts or Finance.';

comment on column public.membership_plan_catalog.gym_code_id is
  'Branch that owns this showcase row. Staff of other branches never see it.';

comment on column public.membership_plan_catalog.list_price_inr is
  'Display list price for sales talk only — not written to members.amount.';

comment on column public.membership_plan_catalog.details is
  'Full plan write-up for staff sales talk. Not shown on Member Portal.';

comment on column public.membership_plan_catalog.is_enabled is
  'When false, hide from showcase only; plan name remains assignable on members.';

alter table if exists public.membership_plan_catalog enable row level security;

drop policy if exists membership_plan_catalog_select_gym
  on public.membership_plan_catalog;
drop policy if exists membership_plan_catalog_select_branch_scope
  on public.membership_plan_catalog;
create policy membership_plan_catalog_select_branch_scope
  on public.membership_plan_catalog
  for select
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists membership_plan_catalog_write_owner
  on public.membership_plan_catalog;
drop policy if exists membership_plan_catalog_write_branch_scope
  on public.membership_plan_catalog;
create policy membership_plan_catalog_write_branch_scope
  on public.membership_plan_catalog
  for all
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
