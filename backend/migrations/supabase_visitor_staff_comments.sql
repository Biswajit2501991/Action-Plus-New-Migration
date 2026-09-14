-- Additive visitor staff comments (append-only).
-- Does NOT modify visitors.notes, convert flow, members, payments, or audit logs.
-- Safe to run multiple times.

create table if not exists public.visitor_staff_comments (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  external_visitor_id text not null,
  assigned_gym_code_id uuid null references public.gym_codes (id) on delete set null,
  body text not null,
  created_by text not null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  constraint visitor_staff_comments_body_len_chk check (
    char_length(trim(body)) >= 1
    and char_length(body) <= 2000
  ),
  constraint visitor_staff_comments_visitor_id_len_chk check (
    char_length(trim(external_visitor_id)) >= 1
    and char_length(external_visitor_id) <= 120
  )
);

create index if not exists visitor_staff_comments_gym_visitor_idx
  on public.visitor_staff_comments (gym_id, external_visitor_id, created_at desc);

create index if not exists visitor_staff_comments_gym_branch_idx
  on public.visitor_staff_comments (gym_id, assigned_gym_code_id, created_at desc);

comment on table public.visitor_staff_comments is
  'Append-only staff comments on visitors. Does not replace visitors.notes (intake).';

comment on column public.visitor_staff_comments.body is
  'Staff comment text. Immutable after insert (no edit/delete API in v1).';

alter table if exists public.visitor_staff_comments enable row level security;

drop policy if exists visitor_staff_comments_select_branch_scope
  on public.visitor_staff_comments;
create policy visitor_staff_comments_select_branch_scope
  on public.visitor_staff_comments
  for select
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or assigned_gym_code_id is null
      or assigned_gym_code_id = public.apg_jwt_branch_id()
    )
  );

drop policy if exists visitor_staff_comments_insert_branch_scope
  on public.visitor_staff_comments;
create policy visitor_staff_comments_insert_branch_scope
  on public.visitor_staff_comments
  for insert
  to authenticated
  with check (
    gym_id = public.apg_jwt_gym_id()
    and (
      public.apg_jwt_is_owner()
      or assigned_gym_code_id is null
      or assigned_gym_code_id = public.apg_jwt_branch_id()
    )
  );

notify pgrst, 'reload schema';
