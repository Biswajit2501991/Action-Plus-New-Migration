-- Branch-scoped payment QR settings (additive only).
-- Safe to run multiple times.
--
-- Does NOT modify members, billing, payments, templates, message_history,
-- attendance, finance_transactions, or any historical data.

create table if not exists public.payment_qr_settings (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  gym_code_id uuid not null references public.gym_codes (id) on delete restrict,

  qr_name text not null,
  qr_image_path text,
  image_version integer not null default 0,
  display_order integer not null default 0,
  is_active boolean not null default true,

  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint payment_qr_settings_name_len_chk check (char_length(qr_name) <= 80),
  constraint payment_qr_settings_display_order_chk check (display_order >= 0)
);

create index if not exists payment_qr_settings_gym_branch_active_idx
  on public.payment_qr_settings (gym_id, gym_code_id, is_active, display_order);

create index if not exists payment_qr_settings_gym_branch_idx
  on public.payment_qr_settings (gym_id, gym_code_id);

comment on table public.payment_qr_settings is
  'Branch-scoped gym payment QR codes for in-app viewer and optional SMS links.';
