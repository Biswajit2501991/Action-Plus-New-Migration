-- Branch-scoped WhatsApp templates (settings_templates.gym_code_id).
-- Run once in Supabase SQL Editor after supabase_gym_codes.sql.

alter table public.settings_templates
  add column if not exists gym_code_id uuid references public.gym_codes (id) on delete restrict;

-- Tag legacy rows to HQ (or first branch per gym).
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

-- Seed every branch with HQ template bodies (duplicate-to-all-branches backfill).
insert into public.settings_templates (gym_id, gym_code_id, template_key, channel, body, updated_at)
select hq.gym_id, gc.id, hq.template_key, hq.channel, hq.body, coalesce(hq.updated_at, now())
from public.settings_templates hq
inner join public.gym_codes hq_gc on hq_gc.id = hq.gym_code_id
inner join public.gym_codes gc on gc.gym_id = hq.gym_id
where hq.channel = 'whatsapp'
  and upper(hq_gc.code) = 'HQ'
  and not exists (
    select 1
    from public.settings_templates x
    where x.gym_id = hq.gym_id
      and x.gym_code_id = gc.id
      and x.template_key = hq.template_key
      and x.channel = hq.channel
  );

alter table public.settings_templates drop constraint if exists settings_templates_gym_id_template_key_key;
alter table public.settings_templates drop constraint if exists settings_templates_gym_id_template_key_channel_key;

create unique index if not exists settings_templates_gym_branch_key_channel_uidx
  on public.settings_templates (gym_id, gym_code_id, template_key, channel);

create index if not exists idx_settings_templates_gym_branch
  on public.settings_templates (gym_id, gym_code_id);

alter table public.settings_templates
  alter column gym_code_id set not null;
