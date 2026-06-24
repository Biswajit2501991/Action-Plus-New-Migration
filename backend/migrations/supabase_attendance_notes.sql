-- Attendance Notes (additive — does not alter staff_attendance_records).
-- Run once in Supabase SQL Editor after staff_attendance_records exists.
-- FK targets staff_attendance_records.id (bigint internal PK), not external_record_id (uuid).

create table if not exists public.attendance_notes (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  attendance_record_id bigint not null references public.staff_attendance_records (id) on delete cascade,
  staff_login_id text not null,
  gym_code_id uuid not null references public.gym_codes (id) on delete restrict,
  branch_code text not null,
  attendance_date date not null,
  note_category text not null,
  note text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint attendance_notes_category_check check (
    note_category in ('traffic', 'rain', 'medical', 'family', 'personal', 'other', 'optional')
  ),
  constraint attendance_notes_note_length check (char_length(note) <= 250)
);

create index if not exists idx_attendance_notes_gym_date_branch
  on public.attendance_notes (gym_id, attendance_date, gym_code_id);

create index if not exists idx_attendance_notes_attendance_record
  on public.attendance_notes (attendance_record_id);

create index if not exists idx_attendance_notes_staff_date
  on public.attendance_notes (gym_id, staff_login_id, attendance_date);

create index if not exists idx_attendance_notes_expires
  on public.attendance_notes (expires_at);

alter table public.attendance_notes enable row level security;

-- PostgREST must reload schema or inserts fail with "not in schema cache"
notify pgrst, 'reload schema';
