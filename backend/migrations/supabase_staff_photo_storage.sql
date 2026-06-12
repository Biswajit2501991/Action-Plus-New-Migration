-- Staff profile photos: Supabase Storage metadata (run once in Supabase SQL Editor).
-- Binary files live in private bucket apg-media; DB holds path + version only.

alter table public.staff_users
  add column if not exists photo_path text,
  add column if not exists photo_uploaded_at timestamptz,
  add column if not exists photo_uploaded_by text,
  add column if not exists photo_version integer not null default 0;

create index if not exists idx_staff_users_photo_path
  on public.staff_users (gym_id, photo_path)
  where photo_path is not null;

comment on column public.staff_users.photo_path is 'Supabase Storage object key (private bucket apg-media)';
comment on column public.staff_users.photo_url is 'Legacy inline data URL — deprecated after storage migration';
