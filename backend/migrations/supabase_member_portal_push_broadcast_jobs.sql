-- Additive scheduled owner Web Push broadcasts (mirror of Website migration).
-- Safe to run multiple times if already applied via Supabase MCP.

create table if not exists public.member_portal_push_broadcast_jobs (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/members',
  scheduled_at timestamptz not null,
  status text not null default 'pending',
  created_by text null,
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null,
  recipients_at_send integer null,
  result_json jsonb null,
  error text null,
  constraint member_portal_push_broadcast_jobs_status_chk check (
    status in ('pending', 'running', 'sent', 'failed', 'cancelled')
  ),
  constraint member_portal_push_broadcast_jobs_title_len_chk check (
    char_length(trim(title)) >= 1 and char_length(title) <= 120
  ),
  constraint member_portal_push_broadcast_jobs_body_len_chk check (
    char_length(trim(body)) >= 1 and char_length(body) <= 500
  )
);

create index if not exists member_portal_push_broadcast_jobs_due_idx
  on public.member_portal_push_broadcast_jobs (gym_id, status, scheduled_at);

create index if not exists member_portal_push_broadcast_jobs_gym_created_idx
  on public.member_portal_push_broadcast_jobs (gym_id, created_at desc);

comment on table public.member_portal_push_broadcast_jobs is
  'Scheduled owner gym-wide Web Push broadcasts. Send via broadcast-due cron; does not touch billing cron.';

alter table if exists public.member_portal_push_broadcast_jobs enable row level security;

drop policy if exists member_portal_push_broadcast_jobs_select_gym on public.member_portal_push_broadcast_jobs;
create policy member_portal_push_broadcast_jobs_select_gym
  on public.member_portal_push_broadcast_jobs
  for select
  to authenticated
  using (gym_id = public.apg_jwt_gym_id());

notify pgrst, 'reload schema';
