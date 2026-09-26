-- Staff login PIN, security answers, and owner-approved temporary PIN reset.
-- Additive only. Existing password_hash, offers passcode, and password-reset columns stay as they are.

alter table public.staff_users
  add column if not exists pin_hash text,
  add column if not exists pin_plain text,
  add column if not exists pin_set_at timestamptz,
  add column if not exists security_ready_at timestamptz,
  add column if not exists pin_recover_fails integer not null default 0,
  add column if not exists pin_recover_questions boolean not null default false,
  add column if not exists pin_recover_questions_failed boolean not null default false,
  add column if not exists pin_reset_requested_at timestamptz,
  add column if not exists pin_reset_temp_hash text,
  add column if not exists pin_reset_temp_expires_at timestamptz,
  add column if not exists pin_reset_approved_at timestamptz;

comment on column public.staff_users.pin_plain is
  'Latest staff login PIN for owner view after the owner re-enters their own password. Not returned by staff list APIs.';

create table if not exists public.staff_password_history (
  id uuid primary key default gen_random_uuid(),
  gym_id text not null,
  staff_login_id text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists staff_password_history_login_idx
  on public.staff_password_history (gym_id, staff_login_id, created_at desc);

create table if not exists public.staff_security_answers (
  id uuid primary key default gen_random_uuid(),
  gym_id text not null,
  staff_login_id text not null,
  question_key text not null,
  answer_hash text not null,
  updated_at timestamptz not null default now(),
  unique (gym_id, staff_login_id, question_key)
);

alter table public.staff_password_history enable row level security;
alter table public.staff_security_answers enable row level security;
