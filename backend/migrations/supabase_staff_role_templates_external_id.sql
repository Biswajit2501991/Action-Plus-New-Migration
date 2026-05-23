-- Stable external ids for role templates (prevents duplicate rows on settings bulk sync).
-- Run once in Supabase SQL Editor.

alter table public.staff_role_templates
  add column if not exists external_template_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'staff_role_templates_gym_id_external_template_id_key'
  ) then
    alter table public.staff_role_templates
      add constraint staff_role_templates_gym_id_external_template_id_key
      unique (gym_id, external_template_id);
  end if;
exception when others then
  raise notice 'staff_role_templates unique: %', sqlerrm;
end $$;

-- Backfill external_template_id from title slug where missing (best-effort).
update public.staff_role_templates
set external_template_id = lower(regexp_replace(trim(title), '[^a-zA-Z0-9]+', '-', 'g'))
where external_template_id is null
  and title is not null
  and trim(title) <> '';
