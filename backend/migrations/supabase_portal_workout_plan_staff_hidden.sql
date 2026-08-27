-- Additive: staff explicit hide for Workout Plan (overrides auto rollout by status).
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS portal_workout_plan_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.members.portal_workout_plan_hidden IS
  'Staff explicitly hid Workout Plan for this member. Overrides auto rollout; independent of portal_workout_plan_enabled default.';
