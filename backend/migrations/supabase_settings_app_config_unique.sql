-- Ensure one settings_app_config row per gym (maybeSingle() fails with duplicates).
-- Run in Supabase SQL Editor if GET /api/settings?scope=core returns 500.

DELETE FROM public.settings_app_config a
USING public.settings_app_config b
WHERE a.gym_id = b.gym_id
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS settings_app_config_gym_id_unique
  ON public.settings_app_config (gym_id);
