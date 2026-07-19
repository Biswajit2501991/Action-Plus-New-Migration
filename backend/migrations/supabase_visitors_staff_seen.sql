-- Shared ack for "new visitor" staff notifications.
-- When any staff sets staff_seen_at, the alert clears for everyone.
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS staff_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS staff_seen_by text;

COMMENT ON COLUMN public.visitors.staff_seen_at IS
  'When any staff/owner acknowledged the new-visitor alert; clears inbox for all staff.';
COMMENT ON COLUMN public.visitors.staff_seen_by IS
  'Staff login/name who acknowledged the new-visitor alert.';
