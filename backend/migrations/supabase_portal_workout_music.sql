-- Additive: gym-wide Workout Plan music track for Member Portal.
CREATE TABLE IF NOT EXISTS public.portal_workout_music (
  gym_id uuid PRIMARY KEY,
  title text NOT NULL DEFAULT 'Gym music',
  mp4_url text,
  storage_path text,
  file_size_bytes bigint,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.portal_workout_music IS
  'Single gym-wide music track for Member Portal Workout Plan player.';

ALTER TABLE public.portal_workout_music ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portal_workout_music TO service_role;
GRANT SELECT ON TABLE public.portal_workout_music TO anon, authenticated;

DROP POLICY IF EXISTS portal_workout_music_select_active ON public.portal_workout_music;
CREATE POLICY portal_workout_music_select_active
  ON public.portal_workout_music
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND mp4_url IS NOT NULL AND length(trim(mp4_url)) > 0);
