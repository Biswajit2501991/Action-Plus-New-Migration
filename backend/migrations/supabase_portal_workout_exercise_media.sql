-- Additive Workout Plan exercise demo videos (MP4 in Storage, URL in this table).
CREATE TABLE IF NOT EXISTS public.portal_workout_exercise_media (
  gym_id uuid NOT NULL,
  exercise_key text NOT NULL,
  display_name text,
  mp4_url text,
  storage_path text,
  youtube_url text,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (gym_id, exercise_key)
);

COMMENT ON TABLE public.portal_workout_exercise_media IS
  'Gym-wide demo video per Workout Plan exercise_key.';

ALTER TABLE public.portal_workout_exercise_media ENABLE ROW LEVEL SECURITY;
