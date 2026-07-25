-- Per-status Member Portal login policy (gym-wide).
-- Independent of portal_sections (home tiles / training visibility).

ALTER TABLE public.member_portal_settings
  ADD COLUMN IF NOT EXISTS portal_access_by_status jsonb
  NOT NULL
  DEFAULT '{"Active":true,"Hold":true,"Deactivated":false,"Cancelled":false}'::jsonb;

COMMENT ON COLUMN public.member_portal_settings.portal_access_by_status IS
  'Which membership statuses may use Member Portal login. Separate from portal_sections tile toggles.';
