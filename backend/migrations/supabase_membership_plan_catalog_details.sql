-- Additive: full plan write-up for staff sales talk (Member Portal does not use this).
-- Safe on existing DBs that already have membership_plan_catalog without details.

alter table if exists public.membership_plan_catalog
  add column if not exists details text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'membership_plan_catalog_details_len_chk'
  ) then
    alter table public.membership_plan_catalog
      add constraint membership_plan_catalog_details_len_chk
      check (char_length(details) <= 8000);
  end if;
end $$;

comment on column public.membership_plan_catalog.details is
  'Full plan write-up for staff sales talk. Not shown on Member Portal.';
