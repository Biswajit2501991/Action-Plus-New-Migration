-- Additive: optional date window for per-member Workout Plan tile visibility.
-- When both NULL, behavior is unchanged (boolean switches only).
-- Portal evaluates [enabled_from, enabled_until] inclusive in IST.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS portal_workout_plan_enabled_from date,
  ADD COLUMN IF NOT EXISTS portal_workout_plan_enabled_until date;

COMMENT ON COLUMN public.members.portal_workout_plan_enabled_from IS
  'Optional first calendar day (inclusive) the Workout Plan home tile is shown for this member. NULL = no start limit.';

COMMENT ON COLUMN public.members.portal_workout_plan_enabled_until IS
  'Optional last calendar day (inclusive) the Workout Plan home tile is shown for this member. NULL = no end limit. Auto-hides after this date.';
