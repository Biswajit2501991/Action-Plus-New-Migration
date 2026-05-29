-- Password reset rejection tracking (run once in Supabase SQL editor).
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS password_reset_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_reset_rejected_by text;

COMMENT ON COLUMN public.staff_users.password_reset_rejected_at IS
  'When an owner/branch owner rejected the latest password reset request.';
COMMENT ON COLUMN public.staff_users.password_reset_rejected_by IS
  'staff_login_id of the actor who rejected the reset request.';
