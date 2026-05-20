-- Visitors: branch gym code (same model as members.assigned_gym_code_id)

alter table public.visitors
  add column if not exists assigned_gym_code_id uuid references public.gym_codes (id) on delete restrict;

create index if not exists idx_visitors_assigned_gym_code_id on public.visitors (assigned_gym_code_id);

-- Stamp from staff profile when missing (service role / trigger path)
create or replace function public.visitors_stamp_assigned_gym_code()
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

drop trigger if exists trg_visitors_stamp_assigned_gym_code on public.visitors;
create trigger trg_visitors_stamp_assigned_gym_code
  before insert or update on public.visitors
  for each row
  execute function public.visitors_stamp_assigned_gym_code();
