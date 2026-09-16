-- Additive: Member Portal in-app inbox for gym owner broadcasts (mirror of Website migration).
-- Safe to run multiple times if already applied via Supabase MCP.

create table if not exists public.member_portal_notification_inbox (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_uuid uuid not null,
  kind text not null default 'owner_broadcast',
  title text not null,
  body text not null,
  url text not null default '/members?inbox=1',
  source_job_id uuid null,
  read_at timestamptz null,
  cleared_at timestamptz null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint member_portal_notification_inbox_title_len_chk check (
    char_length(trim(title)) >= 1 and char_length(title) <= 120
  ),
  constraint member_portal_notification_inbox_body_len_chk check (
    char_length(trim(body)) >= 1 and char_length(body) <= 500
  ),
  constraint member_portal_notification_inbox_kind_len_chk check (
    char_length(trim(kind)) >= 1 and char_length(kind) <= 40
  )
);

create index if not exists member_portal_notification_inbox_member_list_idx
  on public.member_portal_notification_inbox (gym_id, member_uuid, created_at desc)
  where cleared_at is null;

create index if not exists member_portal_notification_inbox_expires_idx
  on public.member_portal_notification_inbox (expires_at)
  where cleared_at is null;

comment on table public.member_portal_notification_inbox is
  'Member Portal in-app inbox for gym broadcasts. Auto-expire after 7 days. Not billing Alerts.';

alter table if exists public.member_portal_notification_inbox enable row level security;
