-- List all staff logins for your gym (run in Supabase SQL Editor).
-- Replace gym_id if your APG_GYM_ID in backend/.env is different.

select
  staff_login_id,
  full_name,
  email,
  is_blocked,
  last_login_at,
  created_at
from public.staff_users
where gym_id = '48815df4-6144-40dd-bbd6-91fd8522d1ff'
order by staff_login_id;
