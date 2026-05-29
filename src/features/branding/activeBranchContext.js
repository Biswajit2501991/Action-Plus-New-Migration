import { allowedBranchIdsForUser } from '../tenant/branchOwnerAccess.js';

const PREF_KEY = 'apg.activeBranch.pref';

export function readActiveBranchPref(userId) {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return '';
    const map = JSON.parse(raw);
    return String(map[String(userId || '').trim()] || '').trim();
  } catch {
    return '';
  }
}

export function writeActiveBranchPref(userId, gymCodeId) {
  try {
    const id = String(userId || '').trim();
    const branch = String(gymCodeId || '').trim();
    if (!id || !branch) return;
    const raw = localStorage.getItem(PREF_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[id] = branch;
    localStorage.setItem(PREF_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function switchableBranchesForUser(user, gymCodes = []) {
  const list = Array.isArray(gymCodes) ? gymCodes : [];
  const allowed = allowedBranchIdsForUser(user);
  if (allowed === null) return list;
  if (!allowed.length) return [];
  const byId = new Map(list.map((c) => [String(c.id), c]));
  return allowed.map((id) => {
    const hit = byId.get(String(id));
    if (hit) return hit;
    return {
      id: String(id),
      code: String(id).slice(0, 8).toUpperCase(),
      name: 'Branch',
      branchName: 'Branch',
    };
  });
}

export function shouldShowBranchSwitcher(user) {
  const allowed = allowedBranchIdsForUser(user);
  if (allowed === null) return false;
  return allowed.length > 1;
}

export function effectiveActiveBranchId(user, gymCodes = []) {
  const allowed = allowedBranchIdsForUser(user);
  const fromUser = String(user?.activeBranchId || user?.gymCodeId || '').trim();
  if (allowed === null) {
    return fromUser || String(gymCodes?.[0]?.id || '').trim();
  }
  if (!allowed.length) return '';
  if (fromUser && allowed.includes(fromUser)) return fromUser;
  const pref = readActiveBranchPref(user?.id);
  if (pref && allowed.includes(pref)) return pref;
  return allowed[0];
}
