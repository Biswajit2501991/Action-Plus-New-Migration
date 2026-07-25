-- Member Portal UI config: Basic workout options + section visibility toggles.
-- Additive only — no existing columns/data changed or dropped.
-- Applied via Supabase MCP (member_portal_ui_config).

ALTER TABLE public.member_portal_settings
  ADD COLUMN IF NOT EXISTS basic_workout_options jsonb NOT NULL DEFAULT '[
    {"label":"Back","visible":true},
    {"label":"Chest","visible":true},
    {"label":"Leg","visible":true},
    {"label":"Shoulder","visible":true},
    {"label":"Full Body","visible":true},
    {"label":"Cardio","visible":true},
    {"label":"Biceps","visible":true},
    {"label":"Triceps","visible":true}
  ]'::jsonb,
  ADD COLUMN IF NOT EXISTS portal_sections jsonb NOT NULL DEFAULT '{
    "basicDailyWorkouts":true,
    "basicNotes":true,
    "measurements":true,
    "ptSchedule":true,
    "ptMemberNotes":true,
    "ptAssignment":true,
    "ptDiet":false,
    "ptWorkoutDetails":false
  }'::jsonb;

COMMENT ON COLUMN public.member_portal_settings.basic_workout_options IS
  'Basic-member portal workout chips: [{label, visible}]. Independent of PT exerciseTypes lookup.';
COMMENT ON COLUMN public.member_portal_settings.portal_sections IS
  'Member portal section visibility toggles for Basic and PT clients.';
