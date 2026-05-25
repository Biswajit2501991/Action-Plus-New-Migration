-- Staff login id is unique per gym (auth uses gym_id + staff_login_id, not per branch).
-- Run once in Supabase SQL Editor after supabase_staff_access_unique.sql.

-- Remove duplicate staff rows (keep newest updated_at per gym + login).
delete from public.staff_users a
using public.staff_users b
where a.gym_id = b.gym_id
  and lower(a.staff_login_id) = lower(b.staff_login_id)
  and a.id < b.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'staff_users'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%staff_login_id%'
  ) then
    alter table public.staff_users
      add constraint staff_users_gym_id_staff_login_id_key
      unique (gym_id, staff_login_id);
    raise notice 'Added UNIQUE (gym_id, staff_login_id)';
  else
    raise notice 'staff_users (gym_id, staff_login_id) unique already exists';
  end if;
end $$;
