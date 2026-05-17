-- Run once in Supabase SQL Editor after renaming to public.members.

-- 1) Unique key for fast bulk upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'members'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE '%member_code%'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_gym_id_member_code_key UNIQUE (gym_id, member_code);
    RAISE NOTICE 'Added UNIQUE (gym_id, member_code)';
  ELSE
    RAISE NOTICE 'Unique (gym_id, member_code) already exists';
  END IF;
END $$;

-- 2) Realtime publication (idempotent per table)
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'members',
    'staff_users',
    'staff_user_sections',
    'staff_user_access',
    'visitors',
    'finance_transactions',
    'audit_logs',
    'sms_status_events',
    'settings_lookup_values',
    'settings_templates',
    'settings_app_config',
    'settings_staff_directory',
    'staff_role_templates',
    'leave_requests',
    'staff_attendance_records',
    'member_payment_history',
    'member_message_history',
    'member_attachments',
    'member_injury_notes',
    'pt_client_profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE 'Skip % (table not found)', t;
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE 'Already in realtime: %', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    RAISE NOTICE 'Added to realtime: %', t;
  END LOOP;
END $$;
