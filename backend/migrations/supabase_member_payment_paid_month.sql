-- Paid Month Revenue Tracking: service/revenue month (YYYY-MM) distinct from collection date (paid_at).
-- Run once on Supabase; idempotent.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'member_payment_history'
      AND column_name = 'paid_month'
  ) THEN
    ALTER TABLE public.member_payment_history
      ADD COLUMN paid_month TEXT;
    RAISE NOTICE 'Added member_payment_history.paid_month';
  END IF;
END $$;

COMMENT ON COLUMN public.member_payment_history.paid_month IS
  'Service/revenue month YYYY-MM (billing cycle cleared). Collection date remains paid_at.';

-- Backfill only rows missing paid_month (never overwrite existing values).
UPDATE public.member_payment_history
SET paid_month = COALESCE(
  NULLIF(TRIM(paid_month), ''),
  CASE
    WHEN billing_date IS NOT NULL AND billing_date::text ~ '^\d{4}-\d{2}'
      THEN LEFT(billing_date::text, 7)
    ELSE NULL
  END,
  NULLIF(TRIM(billing_month), ''),
  TO_CHAR(paid_at AT TIME ZONE 'UTC', 'YYYY-MM')
)
WHERE paid_month IS NULL OR TRIM(paid_month) = '';

CREATE INDEX IF NOT EXISTS member_payment_history_gym_paid_month_idx
  ON public.member_payment_history (gym_id, paid_month)
  WHERE paid_month IS NOT NULL AND TRIM(paid_month) <> '';
