-- Per-branch branding on gym_codes (logo + display name).
-- Run once in Supabase SQL Editor after supabase_gym_codes.sql.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gym_codes' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.gym_codes ADD COLUMN display_name text NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gym_codes' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE public.gym_codes ADD COLUMN logo_url text NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'gym_codes' AND column_name = 'branding_updated_at'
  ) THEN
    ALTER TABLE public.gym_codes ADD COLUMN branding_updated_at timestamptz NULL;
  END IF;
END $$;
