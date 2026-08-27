-- Gym-wide display name overrides for Workout Plan exercises (stable exercise_key).
CREATE TABLE IF NOT EXISTS public.portal_workout_exercise_labels (
  gym_id uuid NOT NULL,
  exercise_key text NOT NULL,
  display_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, exercise_key)
);

COMMENT ON TABLE public.portal_workout_exercise_labels IS
  'Optional display-name overrides for Workout Plan exercise_key; syncs across all program days.';

ALTER TABLE public.portal_workout_exercise_labels ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_workout_exercise_labels TO service_role;
GRANT SELECT ON TABLE public.portal_workout_exercise_labels TO anon, authenticated;

DROP POLICY IF EXISTS portal_workout_exercise_labels_select ON public.portal_workout_exercise_labels;
CREATE POLICY portal_workout_exercise_labels_select
  ON public.portal_workout_exercise_labels
  FOR SELECT
  TO anon, authenticated
  USING (true);
