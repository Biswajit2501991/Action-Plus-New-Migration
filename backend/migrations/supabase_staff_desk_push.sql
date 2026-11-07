-- Staff phone alerts. Service role only. Does not change visitors, chat, or payments.
create table if not exists public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null,
  staff_login_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (gym_id, endpoint)
);

create index if not exists staff_push_subscriptions_staff_idx
  on public.staff_push_subscriptions (gym_id, staff_login_id);

create table if not exists public.staff_push_send_log (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null,
  event_key text not null,
  created_at timestamptz not null default now(),
  unique (gym_id, event_key)
);

alter table public.staff_push_subscriptions enable row level security;
alter table public.staff_push_send_log enable row level security;

revoke all on public.staff_push_subscriptions from anon, authenticated;
revoke all on public.staff_push_send_log from anon, authenticated;
