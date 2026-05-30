-- Backfill visitors created before assigned_gym_code_id column existed.
-- Assign untagged rows to Rajabazar (R01) by default; adjust branch id for your gym if needed.

update public.visitors v
set assigned_gym_code_id = gc.id
from public.gym_codes gc
where v.assigned_gym_code_id is null
  and v.gym_id = gc.gym_id
  and gc.code = 'R01'
  and gc.name = 'Rajabazar';
