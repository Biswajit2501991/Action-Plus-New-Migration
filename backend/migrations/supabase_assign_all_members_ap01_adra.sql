-- One-time: assign ALL members to gym code AP01 / branch Adra.
-- Run in Supabase SQL Editor (paste this entire file — not a file path).
--
-- Optional: restrict to one gym — uncomment and set your gym UUID (from APG_GYM_ID):
-- \set target_gym_id '48815df4-6144-40dd-bbd6-91fd8522d1ff'

-- 1) Create AP01 / Adra for each gym (skip if code already exists for that gym)
insert into public.gym_codes (gym_id, code, name)
select g.id, 'AP01', 'Adra'
from public.gyms g
where not exists (
  select 1
  from public.gym_codes gc
  where gc.gym_id = g.id
    and upper(trim(gc.code)) = 'AP01'
);
-- If using single-gym filter, add: and g.id = :target_gym_id::uuid

-- 2) Point every member at AP01 for their gym
update public.members m
set assigned_gym_code_id = gc.id
from public.gym_codes gc
where gc.gym_id = m.gym_id
  and upper(trim(gc.code)) = 'AP01';
-- If using single-gym filter, add: and m.gym_id = :target_gym_id::uuid

-- 3) Diagnose one member (change member_code if needed)
select
  m.member_code,
  m.gym_id,
  m.assigned_gym_code_id,
  gc.id as ap01_row_id,
  gc.code,
  gc.name as branch
from public.members m
left join public.gym_codes gc
  on gc.gym_id = m.gym_id and upper(trim(gc.code)) = 'AP01'
where m.member_code = 'APG-999/26';

-- 4) Check result
select
  gc.code,
  gc.name AS branch,
  count(m.id) AS members_with_this_code,
  (select count(*) from public.members m2 where m2.gym_id = gc.gym_id) AS total_members_in_gym
from public.gym_codes gc
left join public.members m on m.assigned_gym_code_id = gc.id
where upper(trim(gc.code)) = 'AP01'
group by gc.id, gc.code, gc.name, gc.gym_id;
