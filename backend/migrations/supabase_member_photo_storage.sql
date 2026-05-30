-- Member profile photos: Supabase Storage metadata (run once in Supabase SQL Editor).
-- Binary files live in private bucket apg-media; DB holds path + version only.

alter table public.members
  add column if not exists photo_path text,
  add column if not exists photo_uploaded_at timestamptz,
  add column if not exists photo_uploaded_by text,
  add column if not exists photo_version integer not null default 0;

create index if not exists idx_members_photo_path
  on public.members (gym_id, photo_path)
  where photo_path is not null;

comment on column public.members.photo_path is 'Supabase Storage object key (private bucket apg-media)';
comment on column public.members.photo_url is 'Legacy inline data URL — deprecated after storage migration';

-- Create private storage bucket (idempotent via storage API in migrate script if this fails):
-- insert into storage.buckets (id, name, public) values ('apg-media', 'apg-media', false)
-- on conflict (id) do nothing;
