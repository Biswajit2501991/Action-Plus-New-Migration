-- Branch-scope finance expenses (and optional income stamp).
-- Safe to run multiple times.

ALTER TABLE public.finance_transactions
  ADD COLUMN IF NOT EXISTS gym_code_id uuid REFERENCES public.gym_codes(id);

CREATE INDEX IF NOT EXISTS finance_transactions_gym_branch_type_date_idx
  ON public.finance_transactions (gym_id, gym_code_id, tx_type, tx_date);

-- Legacy expenses → HQ for that gym (so Branch Owners no longer see Owner HQ costs).
UPDATE public.finance_transactions ft
SET gym_code_id = hq.id
FROM (
  SELECT DISTINCT ON (gc.gym_id) gc.gym_id, gc.id
  FROM public.gym_codes gc
  WHERE upper(gc.code) = 'HQ'
  ORDER BY gc.gym_id, gc.id
) hq
WHERE ft.gym_id = hq.gym_id
  AND ft.tx_type = 'expense'
  AND ft.gym_code_id IS NULL;

-- Gyms without an HQ code: assign remaining unscoped expenses to first branch by code.
UPDATE public.finance_transactions ft
SET gym_code_id = g.id
FROM (
  SELECT DISTINCT ON (gc.gym_id) gc.gym_id, gc.id
  FROM public.gym_codes gc
  ORDER BY gc.gym_id, gc.code ASC
) g
WHERE ft.gym_id = g.gym_id
  AND ft.tx_type = 'expense'
  AND ft.gym_code_id IS NULL;
