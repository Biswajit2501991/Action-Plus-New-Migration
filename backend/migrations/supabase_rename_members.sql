-- Rename legacy members table to public.members (run once in Supabase SQL Editor).
-- Prerequisites: enable replication for live sync (see supabase_enable_realtime.sql).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'members (Phase 1 core)'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'members'
  ) THEN
    ALTER TABLE public."members (Phase 1 core)" RENAME TO members;
    RAISE NOTICE 'Renamed "members (Phase 1 core)" → members';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'members'
  ) THEN
    RAISE NOTICE 'public.members already exists — no rename needed';
  ELSE
    RAISE EXCEPTION 'Neither "members (Phase 1 core)" nor members exists in public schema';
  END IF;
END $$;

-- Required for bulk upsert (gym_id + member_code)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_gym_id_member_code_key'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_gym_id_member_code_key UNIQUE (gym_id, member_code);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;
