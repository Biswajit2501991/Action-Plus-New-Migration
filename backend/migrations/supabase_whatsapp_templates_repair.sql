-- Repair branch-scoped WhatsApp templates after partial migration.
-- Run in Supabase SQL Editor if template save fails on gym_code_id.

-- 1) Ensure column exists
alter table public.settings_templates
  add column if not exists gym_code_id uuid references public.gym_codes (id) on delete restrict;

-- 2) Backfill null gym_code_id to HQ (or first branch)
update public.settings_templates st
set gym_code_id = gc.id
from public.gym_codes gc
where st.gym_id = gc.gym_id
  and upper(gc.code) = 'HQ'
  and st.gym_code_id is null;

update public.settings_templates st
set gym_code_id = sub.id
from (
  select distinct on (gc.gym_id) gc.gym_id, gc.id
  from public.gym_codes gc
  order by gc.gym_id, gc.code asc
) sub
where st.gym_id = sub.gym_id
  and st.gym_code_id is null;

-- 3) Drop legacy unique constraints (global per-gym templates)
alter table public.settings_templates drop constraint if exists settings_templates_gym_id_template_key_key;
alter table public.settings_templates drop constraint if exists settings_templates_gym_id_template_key_channel_key;

-- 4) Branch-scoped unique index
create unique index if not exists settings_templates_gym_branch_key_channel_uidx
  on public.settings_templates (gym_id, gym_code_id, template_key, channel);

-- 5) Require branch on every row
alter table public.settings_templates
  alter column gym_code_id set not null;
