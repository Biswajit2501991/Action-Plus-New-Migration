-- Attendance Notes overwrite semantics:
-- one logical note per gym + staff + attendance date.
-- Safe migration: dedupe first (keep latest), then enforce uniqueness.

with ranked as (
  select
    id,
    row_number() over (
      partition by gym_id, staff_login_id, attendance_date
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.attendance_notes
)
delete from public.attendance_notes n
using ranked r
where n.id = r.id
  and r.rn > 1;

create unique index if not exists idx_attendance_notes_staff_day_unique
  on public.attendance_notes (gym_id, staff_login_id, attendance_date);

notify pgrst, 'reload schema';
