import { SETTINGS_LOOKUP_KEYS } from './settingsLookupKeys.js';
import { activeBranchIdsForDataScope, authIsMasterOwnerUser } from '../tenant/branchOwnerAccess.js';
import { filterLookupRowsForGymCodeId } from './settingsLookupBranchId.js';

export { SETTINGS_LOOKUP_KEYS };

/** Client-side mirror of backend Option 2 strict branch lookup filter. */
export function filterSettingsLookupRowsForActiveBranch(lookups, activeBranchId) {
  return filterLookupRowsForGymCodeId(lookups, activeBranchId);
}

/** Scope settings for active branch (backend filters lookups; pass-through for string arrays). */
export function scopeSettingsForActiveBranch(settings, activeBranchId) {
  void activeBranchId;
  return settings && typeof settings === 'object' ? settings : {};
}

export function filterUsersForActiveBranchDisplay(user, users, activeBranchId = '') {
  const list = Array.isArray(users) ? users : [];
  const scopedUser = user && activeBranchId
    ? { ...user, activeBranchId, gymCodeId: activeBranchId }
    : user;
  if (!scopedUser) return [];
  const scope = activeBranchIdsForDataScope(scopedUser);
  if (scope === null) return list.filter((u) => !u?.blocked);
  if (!scope.length) return [];
  return list.filter((u) => {
    if (u?.blocked) return false;
    const branch = String(u?.gymCodeId || '').trim();
    return branch && scope.includes(branch);
  });
}

/**
 * Replace lookup arrays from a settings pull (branch switch) instead of merging unions.
 */
export function mergeSettingsLookupsForBranchReplace(prev, remote) {
  const merged = { ...(prev && typeof prev === 'object' ? prev : {}), ...(remote && typeof remote === 'object' ? remote : {}) };
  for (const key of SETTINGS_LOOKUP_KEYS) {
    merged[key] = Array.isArray(remote?.[key]) ? remote[key] : [];
  }
  return merged;
}

/** Clear lookup arrays while preserving other settings keys during branch switch. */
export function clearSettingsLookups(settings) {
  const out = { ...(settings && typeof settings === 'object' ? settings : {}) };
  for (const key of SETTINGS_LOOKUP_KEYS) {
    out[key] = [];
  }
  return out;
}

/**
 * Merge remote lookup pull with local state. Union prevents poll from dropping a plan
 * that was just added before the branch-scoped read includes it.
 */
export function mergeSettingsLookupList(prevList, remoteList, lookupGuardActive) {
  const prev = Array.isArray(prevList) ? prevList : [];
  const remote = Array.isArray(remoteList) ? remoteList : null;
  if (lookupGuardActive && prev.length) return prev;
  if (remote === null && prev.length) return prev;
  if (remote && remote.length === 0 && prev.length > 0) return prev;
  if (remote !== null) {
    const seen = new Set();
    const out = [];
    for (const v of remote) {
      const s = String(v || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    for (const v of prev) {
      const s = String(v || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }
  return prev;
}

/** Staff names for filter dropdown — active branch only. */
export function staffFilterOptionsForActiveBranch({
  users = [],
  members = [],
  settingsStaff = [],
  user = null,
  activeBranchId = '',
}) {
  const names = new Set();
  const scopedUser = user && activeBranchId
    ? { ...user, activeBranchId, gymCodeId: activeBranchId }
    : user;
  const scope = scopedUser ? activeBranchIdsForDataScope(scopedUser) : null;

  const userInScope = (u) => {
    if (!u || u.blocked) return false;
    const branch = String(u?.gymCodeId || '').trim();
    if (scope === null) return true;
    if (!scope.length) return false;
    return branch && scope.includes(branch);
  };

  (Array.isArray(users) ? users : []).filter(userInScope).forEach((u) => {
    const n = String(u?.name || u?.id || '').trim();
    if (n) names.add(n);
  });

  (Array.isArray(members) ? members : []).forEach((m) => {
    const n = String(m?.staff || '').trim();
    if (n) names.add(n);
  });

  if (scope === null && authIsMasterOwnerUser(scopedUser) && !activeBranchId) {
    (Array.isArray(settingsStaff) ? settingsStaff : []).forEach((st) => {
      const n = String(st?.name || st?.id || '').trim();
      if (n) names.add(n);
    });
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
