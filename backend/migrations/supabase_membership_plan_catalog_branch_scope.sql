-- Branch-scope membership plan catalog (additive).
-- Safe to run multiple times.
--
-- Does NOT modify members, payments, settings_lookup_values plans names,
-- Member Portal, or Finance. Catalog remains staff showcase only.
--
-- Existing gym-wide catalog rows (no gym_code_id) are copied to every branch
-- of that gym so no showcase text is lost; each branch can then edit independently.

alter table if exists public.membership_plan_catalog
  add column if not exists gym_code_id uuid null references public.gym_codes (id) on delete cascade;

-- Drop gym-only unique BEFORE copying (same plan_name must exist per branch).
alter table if exists public.membership_plan_catalog
  drop constraint if exists membership_plan_catalog_gym_plan_uidx;

insert into public.membership_plan_catalog (
  gym_id,
  gym_code_id,
  plan_name,
  list_price_inr,
  tagline,
  details,
  inclusions,
  is_enabled,
  sort_order,
  updated_by,
  updated_at,
  created_at
)
select
  c.gym_id,
  gc.id as gym_code_id,
  c.plan_name,
  c.list_price_inr,
  c.tagline,
  coalesce(c.details, ''),
  coalesce(c.inclusions, '[]'::jsonb),
  coalesce(c.is_enabled, true),
  coalesce(c.sort_order, 0),
  c.updated_by,
  now(),
  coalesce(c.created_at, now())
from public.membership_plan_catalog c
join public.gym_codes gc
  on gc.gym_id = c.gym_id
where c.gym_code_id is null
  and not exists (
    select 1
    from public.membership_plan_catalog x
    where x.gym_id = c.gym_id
      and x.gym_code_id = gc.id
      and lower(x.plan_name) = lower(c.plan_name)
  );

delete from public.membership_plan_catalog
where gym_code_id is null
  and (
    exists (
      select 1
      from public.membership_plan_catalog x
      where x.gym_id = membership_plan_catalog.gym_id
        and x.gym_code_id is not null
        and lower(x.plan_name) = lower(membership_plan_catalog.plan_name)
    )
    or not exists (
      select 1 from public.gym_codes gc
      where gc.gym_id = membership_plan_catalog.gym_id
    )
  );

do $$
begin
  if exists (
    select 1
    from public.membership_plan_catalog
    where gym_code_id is null
  ) then
    raise exception
      'membership_plan_catalog still has unscoped rows; assign gym_code_id before NOT NULL';
  end if;
end $$;

alter table if exists public.membership_plan_catalog
  alter column gym_code_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'membership_plan_catalog_gym_branch_plan_uidx'
  ) then
    alter table public.membership_plan_catalog
      add constraint membership_plan_catalog_gym_branch_plan_uidx
      unique (gym_id, gym_code_id, plan_name);
  end if;
end $$;

create index if not exists membership_plan_catalog_gym_branch_sort_idx
  on public.membership_plan_catalog (gym_id, gym_code_id, sort_order, plan_name);

comment on column public.membership_plan_catalog.gym_code_id is
  'Branch that owns this showcase row. Staff of other branches never see it.';

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
