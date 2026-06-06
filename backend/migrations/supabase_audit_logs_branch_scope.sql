-- Branch-scoped audit log metadata (run once in Supabase SQL editor).
-- Enables reliable branch filtering without inferring entity membership.

alter table public.audit_logs
  add column if not exists branch_id text,
  add column if not exists branch_name text,
  add column if not exists actor_id text,
  add column if not exists actor_role text,
  add column if not exists summary text;

create index if not exists idx_audit_logs_gym_branch_logged
  on public.audit_logs (gym_id, branch_id, logged_at desc);
