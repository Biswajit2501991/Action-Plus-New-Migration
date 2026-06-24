-- Daily cleanup: delete expired attendance notes only (never touches staff_attendance_records).
-- Requires pg_cron (Supabase: Database → Extensions → pg_cron).
-- Run once in Supabase SQL Editor.

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'attendance-notes-cleanup') then
    perform cron.unschedule('attendance-notes-cleanup');
  end if;
end $$;

select cron.schedule(
  'attendance-notes-cleanup',
  '0 3 * * *',
  $$delete from public.attendance_notes where expires_at < now()$$
);
