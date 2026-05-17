-- Run once in Supabase SQL Editor if public.members is missing.

create table if not exists public.members (
  id bigint generated always as identity primary key,
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_code text not null,
  form_no integer,
  full_name text not null,
  email text not null,
  mobile text not null,
  dob date,
  gender text,
  address text,
  assigned_staff text,
  plan_name text,
  status text not null default 'Active',
  hold_duration text,
  amount numeric default 0,
  payment_method text,
  joining_date date,
  billing_date date,
  billing_date_updated_at timestamptz,
  next_payment_date date,
  payment_by date,
  pay_month text,
  remark text,
  photo_url text,
  medical_skipped boolean not null default false,
  medical_answers_json jsonb,
  ack_accepted boolean not null default false,
  ack_signature text,
  ack_date date,
  parent_guardian_name text,
  parent_guardian_dob date,
  parent_guardian_signature text,
  family_group_id uuid,
  family_primary_member_id text,
  last_sms_sent_json jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, member_code)
);

create index if not exists idx_members_gym_id on public.members (gym_id);
create index if not exists idx_members_status on public.members (gym_id, status);

alter table public.members enable row level security;
