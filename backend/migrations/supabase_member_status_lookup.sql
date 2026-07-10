-- Fast member status lookup by mobile (kept in sync with public.members).
-- Run once in Supabase SQL Editor, or apply via Supabase CLI / MCP migration.

-- Normalize mobiles to digits-only for consistent search (e.g. +91 98765-43210 → 919876543210).
create or replace function public.apg_normalize_mobile(raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(trim(raw), ''), '[^0-9]', '', 'g');
$$;

create table if not exists public.member_status_lookup (
  member_id bigint primary key references public.members (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete cascade,
  member_code text not null,
  full_name text not null,
  mobile text not null,
  mobile_normalized text not null,
  status text not null,
  is_active boolean not null generated always as (lower(trim(status)) = 'active') stored,
  updated_at timestamptz not null default now()
);

comment on table public.member_status_lookup is
  'Denormalized member name/mobile/status for fast external lookups. Auto-synced from members.';

create index if not exists member_status_lookup_gym_mobile_norm_idx
  on public.member_status_lookup (gym_id, mobile_normalized);

create index if not exists member_status_lookup_mobile_norm_idx
  on public.member_status_lookup (mobile_normalized);

create index if not exists member_status_lookup_gym_active_idx
  on public.member_status_lookup (gym_id, is_active)
  where is_active = true;

-- Backfill / refresh from current members (excludes soft-deleted rows).
insert into public.member_status_lookup (
  member_id,
  gym_id,
  member_code,
  full_name,
  mobile,
  mobile_normalized,
  status,
  updated_at
)
select
  m.id,
  m.gym_id,
  coalesce(m.member_code, ''),
  m.full_name,
  m.mobile,
  public.apg_normalize_mobile(m.mobile),
  m.status,
  coalesce(m.updated_at, now())
from public.members m
where m.deleted_at is null
on conflict (member_id) do update set
  gym_id = excluded.gym_id,
  member_code = excluded.member_code,
  full_name = excluded.full_name,
  mobile = excluded.mobile,
  mobile_normalized = excluded.mobile_normalized,
  status = excluded.status,
  updated_at = excluded.updated_at;

-- Keep lookup in sync whenever members change.
create or replace function public.sync_member_status_lookup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.member_status_lookup where member_id = old.id;
    return old;
  end if;

  if new.deleted_at is not null then
    delete from public.member_status_lookup where member_id = new.id;
    return new;
  end if;

  insert into public.member_status_lookup (
    member_id,
    gym_id,
    member_code,
    full_name,
    mobile,
    mobile_normalized,
    status,
    updated_at
  ) values (
    new.id,
    new.gym_id,
    coalesce(new.member_code, ''),
    new.full_name,
    new.mobile,
    public.apg_normalize_mobile(new.mobile),
    new.status,
    coalesce(new.updated_at, now())
  )
  on conflict (member_id) do update set
    gym_id = excluded.gym_id,
    member_code = excluded.member_code,
    full_name = excluded.full_name,
    mobile = excluded.mobile,
    mobile_normalized = excluded.mobile_normalized,
    status = excluded.status,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists trg_sync_member_status_lookup on public.members;
create trigger trg_sync_member_status_lookup
  after insert or update of full_name, mobile, status, deleted_at, updated_at
  or delete
  on public.members
  for each row
  execute function public.sync_member_status_lookup();

-- Realtime: external apps can subscribe to status changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'member_status_lookup'
  ) then
    alter publication supabase_realtime add table public.member_status_lookup;
  end if;
exception
  when duplicate_object then null;
end $$;

alter table public.member_status_lookup enable row level security;

-- RPC: full status rows for a mobile (may return multiple if mobile is shared).
create or replace function public.get_member_status_by_mobile(
  p_mobile text,
  p_gym_id uuid default null
)
returns table (
  member_id bigint,
  member_code text,
  full_name text,
  mobile text,
  status text,
  is_active boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.member_id,
    l.member_code,
    l.full_name,
    l.mobile,
    l.status,
    l.is_active,
    l.updated_at
  from public.member_status_lookup l
  where l.mobile_normalized = public.apg_normalize_mobile(p_mobile)
    and (p_gym_id is null or l.gym_id = p_gym_id)
  order by l.is_active desc, l.updated_at desc;
$$;

-- RPC: quick yes/no — true when any non-deleted member with that mobile is Active.
create or replace function public.is_member_active_by_mobile(
  p_mobile text,
  p_gym_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.member_status_lookup l
    where l.mobile_normalized = public.apg_normalize_mobile(p_mobile)
      and l.is_active = true
      and (p_gym_id is null or l.gym_id = p_gym_id)
  );
$$;

grant execute on function public.get_member_status_by_mobile(text, uuid) to anon, authenticated, service_role;
grant execute on function public.is_member_active_by_mobile(text, uuid) to anon, authenticated, service_role;

-- Trigger helper is not a public RPC.
revoke execute on function public.sync_member_status_lookup() from public, anon, authenticated;
