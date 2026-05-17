-- Enable Supabase Realtime (postgres_changes) for gym data tables.
-- Run in Supabase SQL Editor after rename-members migration.

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
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format(
        'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',
        t
      );
      RAISE NOTICE 'Added % to supabase_realtime', t;
    ELSE
      RAISE NOTICE 'Skip % (table not found)', t;
    END IF;
  END LOOP;
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'Some tables were already in supabase_realtime publication';
END $$;
