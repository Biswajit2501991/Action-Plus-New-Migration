-- Add branch_custom_templates to Supabase Realtime publication (idempotent).
-- Safe to run multiple times.

do $$
begin
  if not exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'branch_custom_templates'
  ) then
    raise notice 'Skip branch_custom_templates realtime (table not found)';
    return;
  end if;

  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'branch_custom_templates'
  ) then
    raise notice 'branch_custom_templates already in supabase_realtime';
    return;
  end if;

  alter publication supabase_realtime add table public.branch_custom_templates;
  raise notice 'Added branch_custom_templates to supabase_realtime';
exception
  when duplicate_object then
    raise notice 'branch_custom_templates already in supabase_realtime publication';
end $$;
