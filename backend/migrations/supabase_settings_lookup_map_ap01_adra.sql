-- Map legacy gym-wide settings lookups to AP01 / Adra (primary operational branch).
-- Safe to run multiple times. Does NOT delete rows — only reassigns owning branch.
--
-- Why: Option 2 backfill (supabase_settings_lookup_option2_branch_owner.sql) tagged
-- NULL rows as HQ. When staff switch to Action Plus Adra, strict branch filter hides
-- HQ-owned rows → Settings shows 0 for Plans, Statuses, etc.
--
-- This moves HQ-owned lookups to AP01 for each gym where AP01 exists.
-- Branch-specific rows (e.g. Baniyasul / ARV01) are untouched.

-- Preview (optional)
select
  gc.code,
  gc.name,
  slv.category,
  count(*) as row_count
from public.settings_lookup_values slv
join public.gym_codes gc on gc.id = slv.created_by_gym_code_id
where slv.is_active is true
group by gc.code, gc.name, slv.category
order by gc.code, slv.category;

-- Reassign HQ-owned lookups → AP01 / Adra
update public.settings_lookup_values slv
set created_by_gym_code_id = gc_ap01.id
from public.gym_codes gc_ap01
where slv.gym_id = gc_ap01.gym_id
  and upper(trim(gc_ap01.code)) = 'AP01'
  and slv.created_by_gym_code_id in (
    select gc_hq.id
    from public.gym_codes gc_hq
    where gc_hq.gym_id = slv.gym_id
      and gc_hq.code = 'HQ'
  );

-- Also catch any remaining NULL branch rows (pre–Option 2 migration)
update public.settings_lookup_values slv
set created_by_gym_code_id = gc_ap01.id
from public.gym_codes gc_ap01
where slv.gym_id = gc_ap01.gym_id
  and upper(trim(gc_ap01.code)) = 'AP01'
  and slv.created_by_gym_code_id is null;

-- Verify AP01 counts after migration
select
  slv.category,
  count(*) as ap01_count
from public.settings_lookup_values slv
join public.gym_codes gc on gc.id = slv.created_by_gym_code_id
where upper(trim(gc.code)) = 'AP01'
  and slv.is_active is true
group by slv.category
order by slv.category;
