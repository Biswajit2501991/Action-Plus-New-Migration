-- Additive flag for a single-date half-day leave request.
-- Existing rows stay false, so they keep counting as full days.
alter table public.leave_requests
  add column if not exists is_half_day boolean not null default false;

comment on column public.leave_requests.is_half_day is
  'True only for a single-date half-day request. Existing rows stay false (full day).';
