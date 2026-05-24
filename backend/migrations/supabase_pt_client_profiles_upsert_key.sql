-- Ensure PT profiles upsert on (gym_id, member_id) for shared multi-staff sync.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE UNIQUE INDEX IF NOT EXISTS pt_client_profiles_gym_member_uidx
  ON public.pt_client_profiles (gym_id, member_id);
