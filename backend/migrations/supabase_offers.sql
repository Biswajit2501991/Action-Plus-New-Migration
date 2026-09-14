-- Additive Offers (partner shops) — does NOT modify members amounts, payments, or Finance.
-- Safe to run multiple times.

alter table if exists public.staff_users
  add column if not exists offers_passcode_hash text null;

comment on column public.staff_users.offers_passcode_hash is
  'Optional shop Offers passcode (bcrypt). Gym sets staff login+password; shop may set passcode after login.';

create table if not exists public.offer_redemptions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  shop_staff_login_id text not null,
  shop_staff_name text not null default '',
  member_code text not null,
  member_name text not null default '',
  member_mobile text not null default '',
  member_status text not null default '',
  offer_percent numeric(6, 2) not null,
  total_cost_inr numeric(12, 2) not null,
  customer_pay_inr numeric(12, 2) not null,
  assigned_gym_code_id uuid null references public.gym_codes (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint offer_redemptions_percent_chk check (
    offer_percent >= 0 and offer_percent <= 100
  ),
  constraint offer_redemptions_cost_chk check (
    total_cost_inr >= 0 and customer_pay_inr >= 0
  )
);

create index if not exists offer_redemptions_gym_shop_created_idx
  on public.offer_redemptions (gym_id, shop_staff_login_id, created_at desc);

create index if not exists offer_redemptions_gym_created_idx
  on public.offer_redemptions (gym_id, created_at desc);

comment on table public.offer_redemptions is
  'Append-only shop offer redemptions. Display/analytics only — not Finance.';

alter table if exists public.offer_redemptions enable row level security;

drop policy if exists offer_redemptions_select_gym on public.offer_redemptions;
create policy offer_redemptions_select_gym
  on public.offer_redemptions
  for select
  to authenticated
  using (gym_id = public.apg_jwt_gym_id());

drop policy if exists offer_redemptions_insert_gym on public.offer_redemptions;
create policy offer_redemptions_insert_gym
  on public.offer_redemptions
  for insert
  to authenticated
  with check (gym_id = public.apg_jwt_gym_id());

notify pgrst, 'reload schema';
