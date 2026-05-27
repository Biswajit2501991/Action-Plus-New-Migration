-- Branch Owner role: staff_role, multi-branch assignments, lookup provenance.
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS / guarded alters).

-- 1) staff_role on staff_users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'staff_users' AND column_name = 'staff_role'
  ) THEN
    ALTER TABLE public.staff_users
      ADD COLUMN staff_role text NOT NULL DEFAULT 'staff';
  END IF;
END $$;

ALTER TABLE public.staff_users DROP CONSTRAINT IF EXISTS staff_users_staff_role_check;
ALTER TABLE public.staff_users
  ADD CONSTRAINT staff_users_staff_role_check
  CHECK (staff_role IN ('staff', 'branch_owner', 'master_owner'));

-- Master login is always master_owner
UPDATE public.staff_users
SET staff_role = 'master_owner'
WHERE lower(staff_login_id) = 'owner';

-- 2) Multi-branch assignments (Option A)
CREATE TABLE IF NOT EXISTS public.staff_branch_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  gym_code_id uuid NOT NULL REFERENCES public.gym_codes(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text NULL,
  UNIQUE (staff_user_id, gym_code_id)
);

CREATE INDEX IF NOT EXISTS staff_branch_assignments_gym_staff_idx
  ON public.staff_branch_assignments (gym_id, staff_user_id);

CREATE INDEX IF NOT EXISTS staff_branch_assignments_gym_code_idx
  ON public.staff_branch_assignments (gym_id, gym_code_id);

-- Backfill: one assignment per staff from home gym_code_id
INSERT INTO public.staff_branch_assignments (gym_id, staff_user_id, gym_code_id, is_primary, granted_by)
SELECT su.gym_id, su.id, su.gym_code_id, true, 'migration'
FROM public.staff_users su
WHERE su.gym_code_id IS NOT NULL
ON CONFLICT (staff_user_id, gym_code_id) DO NOTHING;

-- 3) Settings lookup provenance (master-owned vs branch-added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'settings_lookup_values' AND column_name = 'created_by_role'
  ) THEN
    ALTER TABLE public.settings_lookup_values
      ADD COLUMN created_by_role text NULL,
      ADD COLUMN created_by_staff_login_id text NULL;
  END IF;
END $$;

-- Legacy rows: treat NULL as master-owned (branch owners cannot delete)
COMMENT ON COLUMN public.settings_lookup_values.created_by_role IS
  'master_owner | branch_owner | NULL (legacy = master-owned)';
