import { resolveActiveBranchId } from '../../auth/tenant/scopedAuth.js';
import { filterLookupRowsForGymCodeId } from './settingsLookupBranchId.js';

/**
 * Option 2: strict branch-owned lookups.
 * When active branch is set, only rows whose created_by_gym_code_id matches.
 * Master without active branch sees all rows (admin mode).
 */
export function filterSettingsLookupRowsForAuth(lookups, auth) {
  const rows = Array.isArray(lookups) ? lookups : [];
  if (!auth) return rows;

  const activeBranch = String(resolveActiveBranchId(auth) || '').trim();
  if (!activeBranch) return rows;

  return filterLookupRowsForGymCodeId(rows, activeBranch);
}

/** Filter settings.staff directory entries to active branch staff logins. */
export function filterSettingsStaffForAuth(staffList, auth, staffBranchByLogin, loginAliasMap = null) {
  const list = Array.isArray(staffList) ? staffList : [];
  if (!auth) return list;

  const activeBranch = String(resolveActiveBranchId(auth) || '').trim();
  if (!activeBranch) return list;

  const alias = loginAliasMap && typeof loginAliasMap.get === 'function' ? loginAliasMap : null;
  const branchMap = staffBranchByLogin && typeof staffBranchByLogin.get === 'function'
    ? staffBranchByLogin
    : new Map();

  return list.filter((entry) => {
    const code = String(entry?.id || '').trim().toLowerCase();
    const name = String(entry?.name || '').trim().toLowerCase();
    const login = alias?.get(name) || alias?.get(code) || code || name;
    if (!login) return false;
    const branch = branchMap.get(login) || branchMap.get(code) || '';
    return branch === activeBranch;
  });
}
