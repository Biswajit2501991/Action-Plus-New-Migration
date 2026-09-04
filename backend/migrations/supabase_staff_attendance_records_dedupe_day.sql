-- Safe dedupe of staff_attendance_records for the same gym + staff + day.
-- Root cause of logout toast: .maybeSingle() throws PGRST116 when duplicates exist.
--
-- Steps (no payment / member / auth changes):
-- 1) Merge first_login_at (earliest) + last_logout_at (latest) onto the keeper row
-- 2) Repoint attendance_notes + staff_attendance_punches FKs to the keeper
-- 3) Delete loser duplicate rows only
-- 4) Unique index so punch cannot create a second day row again
--
-- Run once in Supabase SQL Editor. Idempotent: unique index uses IF NOT EXISTS;
-- delete only affects rn > 1 groups.

-- Prefer keeper with a real Time In, then earliest login, then newest update.
with ranked as (
  select
    id,
    gym_id,
    staff_login_id,
    attendance_date,
    first_login_at,
    last_logout_at,
    row_number() over (
      partition by gym_id, staff_login_id, attendance_date
      order by
        case when first_login_at is not null then 0 else 1 end,
        first_login_at asc nulls last,
        updated_at desc nulls last,
        id asc
    ) as rn
  from public.staff_attendance_records
),
keepers as (
  select * from ranked where rn = 1
),
dup_groups as (
  select gym_id, staff_login_id, attendance_date
  from ranked
  group by gym_id, staff_login_id, attendance_date
  having count(*) > 1
),
merged as (
  select
    k.id as keeper_id,
    min(r.first_login_at) as first_login_at,
    max(r.last_logout_at) as last_logout_at
  from keepers k
  join ranked r
    on r.gym_id = k.gym_id
   and r.staff_login_id = k.staff_login_id
   and r.attendance_date = k.attendance_date
  join dup_groups d
    on d.gym_id = k.gym_id
   and d.staff_login_id = k.staff_login_id
   and d.attendance_date = k.attendance_date
  group by k.id
)
update public.staff_attendance_records s
set
  first_login_at = coalesce(m.first_login_at, s.first_login_at),
  last_logout_at = case
    when m.last_logout_at is null then s.last_logout_at
    when s.last_logout_at is null then m.last_logout_at
    when m.last_logout_at > s.last_logout_at then m.last_logout_at
    else s.last_logout_at
  end,
  updated_at = now()
from merged m
where s.id = m.keeper_id;

-- Repoint late-note FKs from loser rows → keeper (table may exist from prior migrations).
do $$
begin
  if to_regclass('public.attendance_notes') is null then
    return;
  end if;

  with ranked as (
    select
      id,
      gym_id,
      staff_login_id,
      attendance_date,
      row_number() over (
        partition by gym_id, staff_login_id, attendance_date
        order by
          case when first_login_at is not null then 0 else 1 end,
          first_login_at asc nulls last,
          updated_at desc nulls last,
          id asc
      ) as rn
    from public.staff_attendance_records
  ),
  keepers as (
    select id, gym_id, staff_login_id, attendance_date from ranked where rn = 1
  ),
  losers as (
    select id, gym_id, staff_login_id, attendance_date from ranked where rn > 1
  )
  update public.attendance_notes n
  set attendance_record_id = k.id
  from losers l
  join keepers k
    on k.gym_id = l.gym_id
   and k.staff_login_id = l.staff_login_id
   and k.attendance_date = l.attendance_date
  where n.attendance_record_id = l.id;
end $$;

-- Repoint punch-event FKs from loser rows → keeper.
do $$
begin
  if to_regclass('public.staff_attendance_punches') is null then
    return;
  end if;

  with ranked as (
    select
      id,
      gym_id,
      staff_login_id,
      attendance_date,
      row_number() over (
        partition by gym_id, staff_login_id, attendance_date
        order by
          case when first_login_at is not null then 0 else 1 end,
          first_login_at asc nulls last,
          updated_at desc nulls last,
          id asc
      ) as rn
    from public.staff_attendance_records
  ),
  keepers as (
    select id, gym_id, staff_login_id, attendance_date from ranked where rn = 1
  ),
  losers as (
    select id, gym_id, staff_login_id, attendance_date from ranked where rn > 1
  )
  update public.staff_attendance_punches p
  set attendance_record_id = k.id
  from losers l
  join keepers k
    on k.gym_id = l.gym_id
   and k.staff_login_id = l.staff_login_id
   and k.attendance_date = l.attendance_date
  where p.attendance_record_id = l.id;
end $$;

-- Delete only duplicate loser rows (keeper retained).
with ranked as (
  select
    id,
    row_number() over (
      partition by gym_id, staff_login_id, attendance_date
      order by
        case when first_login_at is not null then 0 else 1 end,
        first_login_at asc nulls last,
        updated_at desc nulls last,
        id asc
    ) as rn
  from public.staff_attendance_records
)
delete from public.staff_attendance_records s
using ranked r
where s.id = r.id
  and r.rn > 1;

-- Prevent new duplicate staff+day summary rows (ignore blank staff ids).
create unique index if not exists idx_staff_attendance_records_gym_staff_day_unique
  on public.staff_attendance_records (gym_id, staff_login_id, attendance_date)
  where staff_login_id is not null and length(btrim(staff_login_id)) > 0;

notify pgrst, 'reload schema';
