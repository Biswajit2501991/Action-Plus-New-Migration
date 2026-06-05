-- Soft-delete + permanent delete audit for members (prevents bulk-sync resurrection).
-- Run once in Supabase SQL Editor.

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

CREATE INDEX IF NOT EXISTS members_gym_deleted_at_idx
  ON public.members (gym_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

COMMENT ON COLUMN public.members.deleted_at IS
  'Set on permanent delete; row retained for audit/recovery. Excluded from GET /members.';

CREATE TABLE IF NOT EXISTS public.member_delete_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gym_id uuid NOT NULL REFERENCES public.gyms (id) ON DELETE CASCADE,
  member_id bigint REFERENCES public.members (id) ON DELETE SET NULL,
  member_code text NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by text,
  CONSTRAINT member_delete_audit_gym_code_key UNIQUE (gym_id, member_code)
);

CREATE INDEX IF NOT EXISTS member_delete_audit_gym_deleted_idx
  ON public.member_delete_audit (gym_id, deleted_at DESC);

COMMENT ON TABLE public.member_delete_audit IS
  'Permanent delete audit; member_code blocked from bulk re-insert after delete.';
