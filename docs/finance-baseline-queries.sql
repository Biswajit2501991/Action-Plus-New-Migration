-- Phase 0 baseline: run one statement at a time in Supabase SQL editor.
-- Adjust column names after information_schema discovery if needed.

-- member_payment_history columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'member_payment_history'
ORDER BY ordinal_position;

SELECT COUNT(*) AS total_payments FROM public.member_payment_history;

SELECT date_trunc('month', paid_at::timestamptz)::date AS month,
       COUNT(*) AS cnt,
       COALESCE(SUM(amount), 0) AS total_amount
FROM public.member_payment_history
GROUP BY 1
ORDER BY 1 DESC
LIMIT 24;

-- finance_transactions (manual income/expense)
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'finance_transactions'
ORDER BY ordinal_position;

SELECT date_trunc('month', tx_date::date) AS month,
       tx_type,
       COUNT(*),
       SUM(amount)
FROM public.finance_transactions
GROUP BY 1, 2
ORDER BY 1 DESC;
