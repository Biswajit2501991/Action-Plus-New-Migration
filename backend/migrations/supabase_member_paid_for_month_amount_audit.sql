-- Audit trail for paid-for-month amount overrides (7+ year retention).
CREATE TABLE IF NOT EXISTS public.member_paid_for_month_amount_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gym_id uuid NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  member_id bigint NOT NULL REFERENCES public.members (id) ON DELETE CASCADE,
  member_code text NOT NULL,
  paid_for_month text NOT NULL,
  old_amount numeric NOT NULL,
  new_amount numeric NOT NULL,
  changed_by text,
  override_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_paid_for_month_amount_audit_month_format CHECK (
    paid_for_month ~ '^\d{4}-(0[1-9]|1[0-2])$'
  )
);

CREATE INDEX IF NOT EXISTS member_paid_for_month_amount_audit_gym_month_idx
  ON public.member_paid_for_month_amount_audit (gym_id, paid_for_month, created_at DESC);

COMMENT ON TABLE public.member_paid_for_month_amount_audit IS
  'Immutable log when staff overrides a paid-for-month ledger amount.';
