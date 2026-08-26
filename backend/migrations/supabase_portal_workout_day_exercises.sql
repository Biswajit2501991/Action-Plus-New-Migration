-- Additive: staff-added exercises on existing Workout Plan days (Phase 1).
-- Does not modify base programs, payments, or member progress tables.
CREATE TABLE IF NOT EXISTS public.portal_workout_day_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL,
  level text NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  day_id text NOT NULL,
  exercise_key text NOT NULL,
  name text NOT NULL,
  muscle text NOT NULL DEFAULT '',
  sets_reps text NOT NULL DEFAULT '3×10–12',
  rest text NOT NULL DEFAULT '60–90s',
  display_order integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_workout_day_exercises_active_uniq
  ON public.portal_workout_day_exercises (gym_id, level, day_id, exercise_key)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS portal_workout_day_exercises_gym_level_idx
  ON public.portal_workout_day_exercises (gym_id, level)
  WHERE is_active = true;

COMMENT ON TABLE public.portal_workout_day_exercises IS
  'Staff-added exercises appended to built-in Beginner/Intermediate/Advanced days for Member Portal.';

ALTER TABLE public.portal_workout_day_exercises ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_workout_day_exercises TO service_role;
GRANT SELECT ON TABLE public.portal_workout_day_exercises TO anon, authenticated;

DROP POLICY IF EXISTS portal_workout_day_exercises_select_active ON public.portal_workout_day_exercises;
CREATE POLICY portal_workout_day_exercises_select_active
  ON public.portal_workout_day_exercises
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
