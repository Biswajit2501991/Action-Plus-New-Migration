-- Branch-scoped audit log metadata (run once in Supabase SQL editor).
-- Self-contained: adds gym_id when missing, then branch/actor columns and indexes.

alter table public.audit_logs
  add column if not exists gym_id uuid references public.gyms (id) on delete cascade;

alter table public.audit_logs
  add column if not exists branch_id text,
  add column if not exists branch_name text,
  add column if not exists actor_id text,
  add column if not exists actor_role text,
  add column if not exists summary text;

-- Replace YOUR_GYM_UUID with APG_GYM_ID from backend/.env (run once if rows lack gym_id).
-- update public.audit_logs set gym_id = 'YOUR_GYM_UUID'::uuid where gym_id is null;

create index if not exists idx_audit_logs_gym_logged
  on public.audit_logs (gym_id, logged_at desc);

create index if not exists idx_audit_logs_gym_branch_logged
  on public.audit_logs (gym_id, branch_id, logged_at desc);
