-- Branch Owner role: staff_role, multi-branch assignments, lookup provenance.
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS / guarded alters).
--
-- If a previous run failed with FK type mismatch (uuid vs bigint on staff_users.id),
-- drop any broken empty table first, then re-run:
--   DROP TABLE IF EXISTS public.staff_branch_assignments;

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
-- staff_users.id may be bigint (legacy) or uuid — match the existing PK type.
DO $$
DECLARE
  staff_pk_type text;
  staff_pk_udt text;
  ddl text;
BEGIN
  SELECT c.data_type, c.udt_name
    INTO staff_pk_type, staff_pk_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'staff_users'
    AND c.column_name = 'id';

  IF staff_pk_type IS NULL THEN
    RAISE EXCEPTION 'staff_users.id column not found';
  END IF;

  -- Normalize to a SQL type name for staff_user_id FK column
  IF staff_pk_udt = 'uuid' OR staff_pk_type = 'uuid' THEN
    staff_pk_type := 'uuid';
  ELSIF staff_pk_udt IN ('int8', 'int4') OR staff_pk_type IN ('bigint', 'integer') THEN
    staff_pk_type := CASE WHEN staff_pk_udt = 'int4' OR staff_pk_type = 'integer' THEN 'integer' ELSE 'bigint' END;
  ELSE
    RAISE EXCEPTION 'Unsupported staff_users.id type: % (udt %)', staff_pk_type, staff_pk_udt;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'staff_branch_assignments'
  ) THEN
    ddl := format(
      'CREATE TABLE public.staff_branch_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        gym_id uuid NOT NULL REFERENCES public.gyms(id) ON DELETE CASCADE,
        staff_user_id %s NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
        gym_code_id uuid NOT NULL REFERENCES public.gym_codes(id) ON DELETE CASCADE,
        is_primary boolean NOT NULL DEFAULT false,
        granted_at timestamptz NOT NULL DEFAULT now(),
        granted_by text NULL,
        UNIQUE (staff_user_id, gym_code_id)
      )',
      staff_pk_type
    );
    EXECUTE ddl;
  END IF;
END $$;

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
