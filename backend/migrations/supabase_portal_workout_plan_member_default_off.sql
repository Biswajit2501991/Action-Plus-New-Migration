-- Workout Plan per-member switch: default OFF for everyone.
-- Bis Test (and matching member_code) stays ON. Does not touch payments/auth.

ALTER TABLE public.members
  ALTER COLUMN portal_workout_plan_enabled SET DEFAULT false;

COMMENT ON COLUMN public.members.portal_workout_plan_enabled IS
  'Per-member Workout Plan tile switch. Default OFF. Testers (e.g. Bis Test) may still see the tile via workout_plan_tester_names.';

-- Turn off for all non-tester members; keep Bis Test on.
UPDATE public.members
SET portal_workout_plan_enabled = false
WHERE portal_workout_plan_enabled IS DISTINCT FROM false
  AND lower(trim(coalesce(full_name, ''))) <> 'bis test'
  AND lower(trim(coalesce(member_code, ''))) <> 'bis test';

UPDATE public.members
SET portal_workout_plan_enabled = true
WHERE deleted_at IS NULL
  AND (
    lower(trim(coalesce(full_name, ''))) = 'bis test'
    OR lower(trim(coalesce(member_code, ''))) = 'bis test'
  );

-- Keep tester allowlist default as Bis Test when null.
UPDATE public.member_portal_settings
SET workout_plan_tester_names = '["Bis Test"]'::jsonb
WHERE workout_plan_tester_names IS NULL;
