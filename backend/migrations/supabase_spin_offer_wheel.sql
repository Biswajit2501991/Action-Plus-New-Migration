-- Spin & Win. Service role only. Does not change payments or member amounts.

create table if not exists public.spin_campaigns (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null unique,
  enabled boolean not null default false,
  show_website boolean not null default false,
  show_member_portal boolean not null default false,
  show_gym_manager boolean not null default false,
  title text not null default 'Spin & Win',
  subtitle text not null default 'Spin for a membership discount',
  button_label text not null default 'SPIN',
  min_discount int not null default 5,
  max_discount int not null default 10,
  segments jsonb not null default '[]'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  audience text not null default 'all',
  eligible_plans jsonb not null default '[]'::jsonb,
  popup_delay_sec int not null default 2,
  close_overlay boolean not null default true,
  cooldown_hours int not null default 24,
  spins_per_person int not null default 1,
  coupon_expiry_days int not null default 14,
  allow_stack boolean not null default false,
  branch_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.spin_plays (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null,
  campaign_id uuid not null references public.spin_campaigns(id),
  surface text not null,
  participant_key text not null,
  attempt_no int not null,
  member_uuid text,
  member_code text,
  branch_id text,
  discount int not null,
  segment_index int not null,
  created_at timestamptz not null default now(),
  unique (gym_id, campaign_id, participant_key, attempt_no)
);

create index if not exists spin_plays_campaign_idx
  on public.spin_plays (gym_id, campaign_id, created_at desc);

create table if not exists public.spin_coupons (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null,
  campaign_id uuid not null,
  play_id uuid not null unique,
  code text not null,
  discount int not null,
  participant_key text not null,
  member_uuid text,
  branch_id text,
  plan_name text,
  status text not null default 'issued',
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by text,
  created_at timestamptz not null default now(),
  unique (gym_id, code)
);

alter table public.spin_campaigns enable row level security;
alter table public.spin_plays enable row level security;
alter table public.spin_coupons enable row level security;
revoke all on public.spin_campaigns from anon, authenticated;
revoke all on public.spin_plays from anon, authenticated;
revoke all on public.spin_coupons from anon, authenticated;
