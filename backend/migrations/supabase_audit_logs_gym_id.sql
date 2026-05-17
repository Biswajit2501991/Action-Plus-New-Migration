-- Scope audit_logs per gym (run once in Supabase SQL editor).
-- Backfill existing rows with your gym UUID before enforcing NOT NULL.

alter table public.audit_logs
  add column if not exists gym_id uuid references public.gyms (id) on delete cascade;

-- Replace YOUR_GYM_UUID with APG_GYM_ID from backend/.env
-- update public.audit_logs set gym_id = 'YOUR_GYM_UUID'::uuid where gym_id is null;

create index if not exists idx_audit_logs_gym_logged
  on public.audit_logs (gym_id, logged_at desc);
