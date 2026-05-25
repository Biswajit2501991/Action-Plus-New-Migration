-- Leave requests: unique external id per gym (enables safe upsert if used later).
-- Run once in Supabase SQL Editor. Safe to re-run.

delete from public.leave_requests a
using public.leave_requests b
where a.gym_id = b.gym_id
  and a.external_request_id = b.external_request_id
  and a.id < b.id;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'leave_requests'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) ilike '%external_request_id%'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_gym_id_external_request_id_key
      unique (gym_id, external_request_id);
    raise notice 'Added UNIQUE (gym_id, external_request_id) on leave_requests';
  else
    raise notice 'leave_requests (gym_id, external_request_id) unique already exists';
  end if;
end $$;
