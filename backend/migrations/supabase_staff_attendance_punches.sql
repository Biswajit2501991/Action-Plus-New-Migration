-- Additive punch event log for staff attendance (does not alter staff_attendance_records columns).
-- One daily summary row remains; each login/logout appends here.
-- Run once in Supabase SQL Editor (or apply_migration) after staff_attendance_records exists.

create table if not exists public.staff_attendance_punches (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  attendance_record_id bigint references public.staff_attendance_records (id) on delete cascade,
  staff_login_id text not null,
  attendance_date date not null,
  punch_type text not null,
  punched_at timestamptz not null,
  timezone_at_mark text,
  marked_by text,
  created_at timestamptz not null default now(),
  constraint staff_attendance_punches_type_check check (
    punch_type in ('login', 'logout')
  )
);

create index if not exists idx_staff_attendance_punches_gym_date_staff
  on public.staff_attendance_punches (gym_id, attendance_date, staff_login_id);

create index if not exists idx_staff_attendance_punches_record
  on public.staff_attendance_punches (attendance_record_id);

create index if not exists idx_staff_attendance_punches_gym_punched
  on public.staff_attendance_punches (gym_id, punched_at desc);

alter table public.staff_attendance_punches enable row level security;

-- PostgREST must reload schema or inserts fail with "not in schema cache"
notify pgrst, 'reload schema';
