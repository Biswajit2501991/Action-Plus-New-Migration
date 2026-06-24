-- Per-branch shift start for attendance late detection.
-- Run once in Supabase SQL Editor after supabase_gym_codes.sql.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gym_codes' AND column_name = 'shift_start_time'
  ) THEN
    ALTER TABLE public.gym_codes ADD COLUMN shift_start_time time NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gym_codes' AND column_name = 'shift_timezone'
  ) THEN
    ALTER TABLE public.gym_codes ADD COLUMN shift_timezone text NULL DEFAULT 'IST';
  END IF;
END $$;

-- Sensible default for existing branches (09:00 local).
UPDATE public.gym_codes
SET shift_start_time = COALESCE(shift_start_time, time '09:00'),
    shift_timezone = COALESCE(NULLIF(trim(shift_timezone), ''), 'IST')
WHERE shift_start_time IS NULL OR shift_timezone IS NULL OR trim(shift_timezone) = '';
