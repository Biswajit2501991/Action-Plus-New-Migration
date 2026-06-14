-- Branch-scoped custom WhatsApp / communication templates (additive only).
-- Safe to run multiple times.
--
-- Does NOT modify settings_templates, member_message_history, sms_status_events,
-- members, or any historical messaging data.
--
-- Run in Supabase SQL Editor after supabase_gym_codes.sql and
-- supabase_whatsapp_templates_branch.sql.

-- Case-insensitive guard for system template keys (e.g. monthReminder).
create or replace function public.apg_branch_custom_template_code_allowed(code text)
returns boolean
language sql
immutable
as $$
  select lower(trim(code)) not in (
    'reminder',
    'monthreminder',
    'success',
    'fine',
    'deactivate',
    'hold',
    'welcome'
  );
$$;

create table if not exists public.branch_custom_templates (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  gym_code_id uuid not null references public.gym_codes (id) on delete restrict,

  template_code text not null,
  template_name text not null,
  template_type text not null default 'promotional',
  message_body text not null,
  channel text not null default 'whatsapp',

  is_active boolean not null default true,
  status text not null default 'active',

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sort_order integer not null default 0,

  constraint branch_custom_templates_code_format_chk check (
    template_code ~ '^[a-z][a-z0-9_]{0,63}$'
    and public.apg_branch_custom_template_code_allowed(template_code)
  ),
  constraint branch_custom_templates_type_chk check (
    template_type in ('promotional', 'informational', 'retention', 'custom')
  ),
  constraint branch_custom_templates_channel_chk check (
    channel in ('whatsapp', 'sms', 'email', 'push')
  ),
  constraint branch_custom_templates_status_chk check (
    status in ('active', 'draft', 'archived')
  ),
  constraint branch_custom_templates_message_len_chk check (
    char_length(message_body) <= 8000
  ),
  constraint branch_custom_templates_name_len_chk check (
    char_length(template_name) <= 80
  )
);

create unique index if not exists branch_custom_templates_gym_branch_code_uidx
  on public.branch_custom_templates (gym_id, gym_code_id, template_code);

create index if not exists branch_custom_templates_gym_branch_active_idx
  on public.branch_custom_templates (gym_id, gym_code_id, is_active, sort_order);

create index if not exists branch_custom_templates_gym_branch_channel_idx
  on public.branch_custom_templates (gym_id, gym_code_id, channel);

comment on table public.branch_custom_templates is
  'Owner-created communication templates per gym branch. System templates remain in settings_templates.';

comment on column public.branch_custom_templates.template_code is
  'Stable slug (e.g. promotion). Sent history uses custom:{code} namespace.';
