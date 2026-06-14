-- Hard DELETE policy for branch_custom_templates — master owner only.
-- Safe to run multiple times.
--
-- Historical member_message_history / audit_logs are NOT cascaded (no FK).
-- Run after supabase_branch_custom_templates_rls.sql.

drop policy if exists branch_custom_templates_delete_owner_only on public.branch_custom_templates;
create policy branch_custom_templates_delete_owner_only
  on public.branch_custom_templates
  for delete
  to authenticated
  using (
    gym_id = public.apg_jwt_gym_id()
    and public.apg_jwt_is_owner()
  );
