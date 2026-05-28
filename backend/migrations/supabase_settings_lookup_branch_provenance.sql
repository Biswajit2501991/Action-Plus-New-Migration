-- Branch provenance for settings lookup values.
-- Safe to run multiple times.

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

CREATE INDEX IF NOT EXISTS settings_lookup_values_gym_branch_owner_idx
  ON public.settings_lookup_values (gym_id, category, created_by_role, created_by_gym_code_id);
