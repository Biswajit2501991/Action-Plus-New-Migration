-- REQUIRED for production staff save (PUT /api/users/bulk).
-- Without these UNIQUE indexes, upsert on staff_user_access / staff_user_sections fails with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- The app uses delete+insert when possible; these indexes still prevent duplicate rows under concurrent saves.
-- Run once in Supabase SQL Editor (safe to re-run).

-- Keep newest access row per staff user.
delete from public.staff_user_access a
using public.staff_user_access b
where a.staff_user_id = b.staff_user_id
  and a.id < b.id;

create unique index if not exists staff_user_access_staff_uidx
  on public.staff_user_access (staff_user_id);

-- Keep one section row per (staff, section).
delete from public.staff_user_sections a
using public.staff_user_sections b
where a.staff_user_id = b.staff_user_id
  and a.section_name = b.section_name
  and a.ctid < b.ctid;

create unique index if not exists staff_user_sections_staff_section_uidx
  on public.staff_user_sections (staff_user_id, section_name);
