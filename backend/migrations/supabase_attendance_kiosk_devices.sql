-- Optional: attendance kiosk device tokens in Postgres (file-backed store is used by default).
-- Safe to run multiple times. Does not modify attendance history.

create table if not exists public.attendance_kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  gym_code_id uuid not null references public.gym_codes (id) on delete cascade,
  label text not null default 'Kiosk',
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  constraint attendance_kiosk_devices_label_len_chk check (char_length(label) <= 80)
);

create unique index if not exists attendance_kiosk_devices_token_hash_uidx
  on public.attendance_kiosk_devices (token_hash);

create index if not exists attendance_kiosk_devices_branch_idx
  on public.attendance_kiosk_devices (gym_id, gym_code_id)
  where revoked_at is null;

comment on table public.attendance_kiosk_devices is
  'Optional DB mirror for attendance QR kiosk device tokens (app currently uses file-backed store).';

alter table public.attendance_kiosk_devices enable row level security;
