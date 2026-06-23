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
