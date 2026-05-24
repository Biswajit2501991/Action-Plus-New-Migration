-- Dedupe duplicate member_code rows + enforce UNIQUE (gym_id, member_code).
-- Run as ONE query in Supabase SQL Editor (select all, Run once).
-- Do NOT paste the file path — paste this SQL only.

DO $$
DECLARE
  n integer;
BEGIN
  -- -------------------------------------------------------------------------
  -- 1. Repoint / dedupe child rows, then delete loser members (single pass)
  -- -------------------------------------------------------------------------
  CREATE TEMP TABLE _dedupe_losers ON COMMIT DROP AS
  SELECT
    keeper.id AS keep_id,
    loser.id AS lose_id,
    keeper.gym_id
  FROM (
    SELECT id, gym_id, member_code,
      ROW_NUMBER() OVER (
        PARTITION BY gym_id, member_code
        ORDER BY updated_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.members
  ) keeper
  JOIN (
    SELECT id, gym_id, member_code,
      ROW_NUMBER() OVER (
        PARTITION BY gym_id, member_code
        ORDER BY updated_at DESC NULLS LAST, id DESC
      ) AS rn
    FROM public.members
  ) loser
    ON loser.gym_id = keeper.gym_id
   AND loser.member_code = keeper.member_code
   AND loser.rn > 1
  WHERE keeper.rn = 1;

  IF NOT EXISTS (SELECT 1 FROM _dedupe_losers LIMIT 1) THEN
    RAISE NOTICE 'No duplicate member_code rows found.';
  ELSE
  -- member_payment_history
  DELETE FROM public.member_payment_history loser
  USING _dedupe_losers d
  WHERE loser.member_id = d.lose_id
    AND loser.external_payment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.member_payment_history k
      WHERE k.member_id = d.keep_id AND k.gym_id = loser.gym_id
        AND k.external_payment_id = loser.external_payment_id
    );
  UPDATE public.member_payment_history t
  SET member_id = d.keep_id FROM _dedupe_losers d WHERE t.member_id = d.lose_id;

  -- member_message_history
  DELETE FROM public.member_message_history loser
  USING _dedupe_losers d
  WHERE loser.member_id = d.lose_id
    AND loser.external_event_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.member_message_history k
      WHERE k.member_id = d.keep_id AND k.gym_id = loser.gym_id
        AND k.external_event_id = loser.external_event_id
    );
  UPDATE public.member_message_history t
  SET member_id = d.keep_id FROM _dedupe_losers d WHERE t.member_id = d.lose_id;

  -- member_injury_notes
  DELETE FROM public.member_injury_notes loser
  USING _dedupe_losers d
  WHERE loser.member_id = d.lose_id
    AND loser.external_note_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.member_injury_notes k
      WHERE k.member_id = d.keep_id AND k.gym_id = loser.gym_id
        AND k.external_note_id = loser.external_note_id
    );
  UPDATE public.member_injury_notes t
  SET member_id = d.keep_id FROM _dedupe_losers d WHERE t.member_id = d.lose_id;

  -- member_attachments
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'member_attachments'
  ) THEN
    UPDATE public.member_attachments t
    SET member_id = d.keep_id FROM _dedupe_losers d WHERE t.member_id = d.lose_id;
  END IF;

  -- pt_client_profiles
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pt_client_profiles'
  ) THEN
    DELETE FROM public.pt_client_profiles loser
    USING _dedupe_losers d
    WHERE loser.member_id = d.lose_id
      AND EXISTS (
        SELECT 1 FROM public.pt_client_profiles k
        WHERE k.member_id = d.keep_id AND k.gym_id = loser.gym_id
      );
    UPDATE public.pt_client_profiles t
    SET member_id = d.keep_id FROM _dedupe_losers d WHERE t.member_id = d.lose_id;
  END IF;

  DELETE FROM public.members m
  USING _dedupe_losers d
  WHERE m.id = d.lose_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate member rows.', n;
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. Unique constraint (blocks future duplicates; enables bulk upsert)
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'members_gym_id_member_code_key'
      AND conrelid = 'public.members'::regclass
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_gym_id_member_code_key UNIQUE (gym_id, member_code);
    RAISE NOTICE 'Added UNIQUE (gym_id, member_code).';
  ELSE
    RAISE NOTICE 'UNIQUE (gym_id, member_code) already exists.';
  END IF;
END $$;

-- Verify (expect 0 rows):
-- SELECT member_code, count(*) FROM public.members GROUP BY gym_id, member_code HAVING count(*) > 1;
