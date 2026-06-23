-- Option 2: branch-owned configuration lookups (plans, statuses, etc.)
-- Safe to run multiple times. Does NOT delete data.
--
-- Uses existing created_by_gym_code_id as the owning branch (gym_codes.id).
-- Run in Supabase SQL Editor after supabase_settings_lookup_branch_provenance.sql.

-- 1) Ensure branch column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'settings_lookup_values'
      AND column_name = 'created_by_gym_code_id'
  ) THEN
    ALTER TABLE public.settings_lookup_values
      ADD COLUMN created_by_gym_code_id uuid NULL REFERENCES public.gym_codes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2) Backfill NULL branch → HQ gym_code per gym (legacy globals become HQ-owned)
UPDATE public.settings_lookup_values slv
SET created_by_gym_code_id = gc.id
FROM public.gym_codes gc
WHERE slv.gym_id = gc.gym_id
  AND gc.code = 'HQ'
  AND slv.created_by_gym_code_id IS NULL;

-- Fallback: first gym_code for the gym when HQ row missing
UPDATE public.settings_lookup_values slv
SET created_by_gym_code_id = sub.id
FROM (
  SELECT DISTINCT ON (gym_id) gym_id, id
  FROM public.gym_codes
  ORDER BY gym_id, code
) sub
WHERE slv.gym_id = sub.gym_id
  AND slv.created_by_gym_code_id IS NULL;

-- 3) Per-branch unique active values (same label allowed on different branches)
CREATE UNIQUE INDEX IF NOT EXISTS settings_lookup_values_gym_branch_category_value_uidx
  ON public.settings_lookup_values (gym_id, created_by_gym_code_id, category, value)
  WHERE is_active IS TRUE AND created_by_gym_code_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS settings_lookup_values_gym_branch_category_idx
  ON public.settings_lookup_values (gym_id, created_by_gym_code_id, category)
  WHERE is_active IS TRUE;

COMMENT ON COLUMN public.settings_lookup_values.created_by_gym_code_id IS
  'Owning gym branch (gym_codes.id). Option 2: required for branch-scoped config lists.';
