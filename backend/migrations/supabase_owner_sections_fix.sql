-- Repair owner sidebar: ensure all module sections exist (run once in Supabase SQL Editor).
-- Replace gym_id if your APG_GYM_ID differs.

delete from public.staff_user_sections
where staff_user_id in (
  select id from public.staff_users
  where gym_id = '48815df4-6144-40dd-bbd6-91fd8522d1ff'
    and lower(staff_login_id) = 'owner'
);

insert into public.staff_user_sections (staff_user_id, section_name)
select su.id, s.section_name
from public.staff_users su
cross join (
  values
    ('Dashboard'), ('Members'), ('PT Clients'), ('WhatsApp SMS'),
    ('Finance'), ('Staff'), ('Attendance'), ('Leave Tracker'),
    ('Settings'), ('Logs'), ('Support'), ('Backend')
) as s(section_name)
where su.gym_id = '48815df4-6144-40dd-bbd6-91fd8522d1ff'
  and lower(su.staff_login_id) = 'owner';
