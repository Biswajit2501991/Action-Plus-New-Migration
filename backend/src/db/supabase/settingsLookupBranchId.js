import { T } from '../tables.js';

let settingsLookupBranchColumnKnown = null;

/** Reset cached branch-column probe (tests only). */
export function resetSettingsLookupBranchColumnCache() {
  settingsLookupBranchColumnKnown = null;
}

/**
 * Whether settings_lookup_values has created_by_gym_code_id (Option 2).
 * Probes the live table — information_schema is not available via PostgREST.
 */
export async function settingsLookupHasBranchColumn(sb) {
  if (settingsLookupBranchColumnKnown != null) return settingsLookupBranchColumnKnown;
  const { error } = await sb
    .from(T.settings_lookup_values)
    .select('created_by_gym_code_id')
    .limit(1);
  if (error && /created_by_gym_code_id/i.test(String(error.message || ''))) {
    settingsLookupBranchColumnKnown = false;
    return false;
  }
  settingsLookupBranchColumnKnown = true;
  return true;
}

/** Owning branch UUID for a settings_lookup_values row (Option 2). */
export function lookupRowGymCodeId(row) {
  return String(row?.created_by_gym_code_id || row?.gym_code_id || row?.createdByGymCodeId || '').trim();
}

/** Filter lookup rows to a single branch. Empty branchId returns all rows. */
export function filterLookupRowsForGymCodeId(rows, gymCodeId) {
  const list = Array.isArray(rows) ? rows : [];
  const branch = String(gymCodeId || '').trim();
  if (!branch) return list;
  return list.filter((row) => lookupRowGymCodeId(row) === branch);
}
