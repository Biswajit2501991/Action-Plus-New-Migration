-- Gym branch codes (per gym tenant): A01, ARV01, etc.
-- Run once in Supabase SQL Editor after public.gyms exists.

-- ---------------------------------------------------------------------------
-- 1. gym_codes
-- ---------------------------------------------------------------------------
create table if not exists public.gym_codes (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint gym_codes_gym_id_code_key unique (gym_id, code)
);

create index if not exists idx_gym_codes_gym_id on public.gym_codes (gym_id);

-- ---------------------------------------------------------------------------
-- 2. Foreign keys on staff_users + members
-- ---------------------------------------------------------------------------
alter table public.staff_users
  add column if not exists gym_code_id uuid references public.gym_codes (id) on delete restrict;

alter table public.members
  add column if not exists assigned_gym_code_id uuid references public.gym_codes (id) on delete restrict;

create index if not exists idx_staff_users_gym_code_id on public.staff_users (gym_code_id);
create index if not exists idx_members_assigned_gym_code_id on public.members (assigned_gym_code_id);

-- ---------------------------------------------------------------------------
-- 3. Default "Headquarters" code per gym + backfill existing rows
-- ---------------------------------------------------------------------------
insert into public.gym_codes (gym_id, code, name)
select g.id, 'HQ', 'Headquarters'
from public.gyms g
where not exists (
  select 1 from public.gym_codes gc where gc.gym_id = g.id and gc.code = 'HQ'
);

update public.staff_users su
set gym_code_id = gc.id
from public.gym_codes gc
where su.gym_code_id is null
  and gc.gym_id = su.gym_id
  and gc.code = 'HQ';

update public.members m
set assigned_gym_code_id = gc.id
from public.gym_codes gc
where m.assigned_gym_code_id is null
  and gc.gym_id = m.gym_id
  and gc.code = 'HQ';

-- Owner accounts always see all codes; still assign HQ for NOT NULL constraint.
alter table public.staff_users
  alter column gym_code_id set not null;

-- Members may exist before assignment in edge cases; leave nullable until app stamps inserts.

-- ---------------------------------------------------------------------------
-- 4. JWT helpers for RLS (Supabase Auth / aligned JWT secret)
-- ---------------------------------------------------------------------------
create or replace function public.apg_jwt_gym_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'gym_id', '')::uuid,
    nullif(auth.jwt() ->> 'gymId', '')::uuid
  );
$$;

create or replace function public.apg_jwt_gym_code_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'gym_code_id', '')::uuid,
    nullif(auth.jwt() ->> 'gymCodeId', '')::uuid
  );
$$;

create or replace function public.apg_jwt_is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'userId', '') = 'owner'
    or coalesce(auth.jwt() ->> 'role', '') = 'owner'
    or exists (
      select 1
      from jsonb_array_elements_text(coalesce(auth.jwt() -> 'roles', '[]'::jsonb)) r
      where r = 'owner'
    );
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS on gym_codes + member branch isolation
-- ---------------------------------------------------------------------------
alter table public.gym_codes enable row level security;

drop policy if exists gym_codes_select on public.gym_codes;
create policy gym_codes_select on public.gym_codes
  for select
  to authenticated
  using (gym_id = public.apg_jwt_gym_id());

drop policy if exists gym_codes_owner_write on public.gym_codes;
create policy gym_codes_owner_write on public.gym_codes
  for all
  to authenticated
  using (gym_id = public.apg_jwt_gym_id() and public.apg_jwt_is_owner())
  with check (gym_id = public.apg_jwt_gym_id() and public.apg_jwt_is_owner());

drop policy if exists members_gym_code_select on public.members;
create policy members_gym_code_select on public.members
  for select
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or assigned_gym_code_id = public.apg_jwt_gym_code_id()
      or assigned_gym_code_id is null
    )
  );

drop policy if exists members_gym_code_write on public.members;
create policy members_gym_code_write on public.members
  for all
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or assigned_gym_code_id = public.apg_jwt_gym_code_id()
    )
  )
  with check (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or assigned_gym_code_id = public.apg_jwt_gym_code_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Trigger: stamp member branch from inserter's staff profile (authenticated API)
-- ---------------------------------------------------------------------------
create or replace function public.members_stamp_assigned_gym_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_code uuid;
  v_jwt_code uuid;
begin
  if new.assigned_gym_code_id is not null then
    return new;
  end if;

  v_jwt_code := public.apg_jwt_gym_code_id();
  if v_jwt_code is not null then
    new.assigned_gym_code_id := v_jwt_code;
    return new;
  end if;

  select su.gym_code_id into v_staff_code
  from public.staff_users su
  where su.gym_id = new.gym_id
    and lower(su.staff_login_id) = lower(coalesce(auth.jwt() ->> 'userId', ''))
  limit 1;

  if v_staff_code is not null then
    new.assigned_gym_code_id := v_staff_code;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_members_stamp_assigned_gym_code on public.members;
create trigger trg_members_stamp_assigned_gym_code
  before insert on public.members
  for each row
  execute function public.members_stamp_assigned_gym_code();
