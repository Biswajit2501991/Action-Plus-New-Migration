-- Run once in Supabase SQL Editor if staff photos do not persist.

alter table public.staff_users
  add column if not exists photo_url text;
