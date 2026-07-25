-- Public Visitor QR intake: notes, interest plan, goal, intake_source.
ALTER TABLE public.visitors
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS interest_plan text,
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS intake_source text;
