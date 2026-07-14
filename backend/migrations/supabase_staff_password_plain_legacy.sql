-- Owner-readable staff password mirror (login still uses password_hash).
-- Safe to re-run: only fills empty display passwords from legacy plaintext hashes.
ALTER TABLE public.staff_users
  ADD COLUMN IF NOT EXISTS password_plain_legacy text;

COMMENT ON COLUMN public.staff_users.password_plain_legacy IS
  'Owner-viewable staff password copy. Login continues to use password_hash.';

UPDATE public.staff_users
SET password_plain_legacy = password_hash
WHERE coalesce(trim(password_plain_legacy), '') = ''
  AND coalesce(trim(password_hash), '') <> ''
  AND password_hash !~ '^\$2[aby]\$';
