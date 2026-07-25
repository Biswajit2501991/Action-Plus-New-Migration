-- Referral billing credits (1A + 2A).
-- Extends member_referral_events so Gym Manager can award referrer ₹50 pending
-- credits and track admission discounts without changing members.amount.

ALTER TABLE public.member_referral_events
  ADD COLUMN IF NOT EXISTS code_used text,
  ADD COLUMN IF NOT EXISTS referrer_credit_inr integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS admission_discount_inr integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS referrer_credit_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS applied_payment_id text,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

ALTER TABLE public.member_referral_events
  DROP CONSTRAINT IF EXISTS member_referral_events_credit_status_chk;

ALTER TABLE public.member_referral_events
  ADD CONSTRAINT member_referral_events_credit_status_chk
  CHECK (referrer_credit_status IN ('pending', 'applied', 'void'));

-- One non-void referral event per referred member (idempotent apply).
CREATE UNIQUE INDEX IF NOT EXISTS member_referral_events_gym_referred_active_uidx
  ON public.member_referral_events (gym_id, referred_uuid)
  WHERE referred_uuid IS NOT NULL
    AND referrer_credit_status IS DISTINCT FROM 'void';

CREATE INDEX IF NOT EXISTS member_referral_events_referrer_pending_idx
  ON public.member_referral_events (gym_id, referrer_uuid, referrer_credit_status);

COMMENT ON COLUMN public.member_referral_events.referrer_credit_inr IS
  'INR credit for referrer next billing (default 50). Applied once via billing reminder SMS or Payment Entry.';
COMMENT ON COLUMN public.member_referral_events.admission_discount_inr IS
  'Suggested one-time join collect discount for new member (default 100). Does not change plan amount.';
COMMENT ON COLUMN public.member_referral_events.referrer_credit_status IS
  'pending | applied | void — never delete rows; void soft-cancels.';
