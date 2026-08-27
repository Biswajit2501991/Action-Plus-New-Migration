-- Additive Workout Plan gates + per-member progress.
-- Does not change payments, portal auth, WhatsApp, or audit logs.

ALTER TABLE public.member_portal_settings
  ADD COLUMN IF NOT EXISTS workout_plan_by_status jsonb
  NOT NULL
  DEFAULT '{"Active":true,"Hold":false,"Deactivated":false,"Cancelled":false}'::jsonb;

ALTER TABLE public.member_portal_settings
  ADD COLUMN IF NOT EXISTS workout_plan_tester_names jsonb
  DEFAULT '["Bis Test"]'::jsonb;

COMMENT ON COLUMN public.member_portal_settings.workout_plan_by_status IS
  'Which membership statuses may see Member Portal Workout Plan (separate from portal login).';

COMMENT ON COLUMN public.member_portal_settings.workout_plan_tester_names IS
  'Non-empty JSON array of member names/codes allowed to see Workout Plan. Empty array = all eligible members. NULL = default testers.';

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS portal_workout_plan_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.members.portal_workout_plan_enabled IS
  'Per-member Workout Plan tile switch. Default OFF. Testers may still see via workout_plan_tester_names.';

CREATE TABLE IF NOT EXISTS public.member_workout_program_progress (
  gym_id uuid NOT NULL,
  member_uuid uuid NOT NULL,
  level text,
  program_version text,
  started_at timestamptz,
  current_week integer DEFAULT 1,
  completions jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, member_uuid)
);

ALTER TABLE public.member_workout_program_progress ENABLE ROW LEVEL SECURITY;
