-- Prevent duplicate staff access/section rows (concurrent PUT /api/users/bulk race).
-- Run once in Supabase SQL Editor.

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
