-- Additive T-shirt size for Member Portal. Does not change payments, portal auth, or status.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS tshirt_size text,
  ADD COLUMN IF NOT EXISTS tshirt_size_updates integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.members.tshirt_size IS
  'Member-chosen T-shirt size (S, M, L, XL, XXL). Null until they save it in the portal.';

COMMENT ON COLUMN public.members.tshirt_size_updates IS
  'How many times the member saved a T-shirt size. The portal locks at 2. Owner unlock sets this back to 0.';
