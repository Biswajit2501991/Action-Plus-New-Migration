-- Paid-for-month ledger: one row per member per service month (YYYY-MM) for Finance reporting (7+ years).
-- Prerequisite: run supabase_member_payment_paid_month.sql first (adds member_payment_history.paid_month).
-- Populated from member_payment_history + staff edits; Finance sums Active members by paid_for_month.

CREATE TABLE IF NOT EXISTS public.member_paid_for_month (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gym_id uuid NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  member_id bigint NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  member_code text NOT NULL,
  paid_for_month text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  member_status text NOT NULL DEFAULT 'Active',
  payment_external_id text,
  paid_at timestamptz,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_paid_for_month_month_format CHECK (
    paid_for_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
  ),
  CONSTRAINT member_paid_for_month_gym_member_month_key UNIQUE (gym_id, member_id, paid_for_month)
);

CREATE INDEX IF NOT EXISTS member_paid_for_month_gym_month_idx
  ON public.member_paid_for_month (gym_id, paid_for_month);

CREATE INDEX IF NOT EXISTS member_paid_for_month_gym_member_idx
  ON public.member_paid_for_month (gym_id, member_id);

COMMENT ON TABLE public.member_paid_for_month IS
  'Service revenue month per member (Paid for Month). One row per member per YYYY-MM.';

COMMENT ON COLUMN public.member_paid_for_month.paid_for_month IS
  'Revenue month YYYY-MM (staff-selected; not billing date).';

-- Backfill from payment history (idempotent upsert). Source column is paid_month on payments table.
INSERT INTO public.member_paid_for_month (
  gym_id,
  member_id,
  member_code,
  paid_for_month,
  amount,
  member_status,
  payment_external_id,
  paid_at,
  recorded_by,
  updated_at
)
SELECT
  src.gym_id,
  src.member_id,
  src.member_code,
  src.month_key,
  SUM(src.amount)::numeric,
  COALESCE(NULLIF(TRIM(src.member_status), ''), 'Active'),
  MAX(src.external_payment_id),
  MAX(src.paid_at),
  MAX(src.recorded_by),
  now()
FROM (
  SELECT
    p.gym_id,
    p.member_id,
    m.member_code,
    m.status AS member_status,
    p.external_payment_id,
    p.paid_at,
    p.recorded_by,
    p.amount,
    COALESCE(
      NULLIF(TRIM(p.paid_month), ''),
      NULLIF(TRIM(p.billing_month), ''),
      CASE
        WHEN p.billing_date IS NOT NULL AND p.billing_date::text ~ '^\d{4}-\d{2}'
          THEN LEFT(p.billing_date::text, 7)
        ELSE NULL
      END,
      TO_CHAR(p.paid_at AT TIME ZONE 'UTC', 'YYYY-MM')
    ) AS month_key
  FROM public.member_payment_history p
  JOIN public.members m ON m.id = p.member_id AND m.gym_id = p.gym_id
) AS src
WHERE src.month_key IS NOT NULL
  AND TRIM(src.month_key) <> ''
  AND src.month_key ~ '^\d{4}-(0[1-9]|1[0-2])$'
GROUP BY src.gym_id, src.member_id, src.member_code, src.month_key, src.member_status
ON CONFLICT (gym_id, member_id, paid_for_month) DO UPDATE SET
  amount = EXCLUDED.amount,
  member_status = EXCLUDED.member_status,
  payment_external_id = EXCLUDED.payment_external_id,
  paid_at = EXCLUDED.paid_at,
  recorded_by = EXCLUDED.recorded_by,
  updated_at = now();
