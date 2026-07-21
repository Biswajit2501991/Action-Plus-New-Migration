import { STAFF_ROLES, normalizeStaffRole } from './roles.js';
import {
  authHasGlobalBranchRead,
  authIsBranchOwner,
  authIsMasterOwner,
  resolveAllowedBranchIds,
  resolveReadBranchIds,
} from './scopedAuth.js';

const PROTECTED_STAFF_IDS = new Set(['bis', 'raja', 'owner']);

/** Primary gymCodeId plus assignedBranchIds — any match counts for list scope. */
function userMatchesReadBranches(user, allowed) {
  const ids = new Set();
  const primary = String(user?.gymCodeId || '').trim();
  if (primary) ids.add(primary);
  for (const id of Array.isArray(user?.assignedBranchIds) ? user.assignedBranchIds : []) {
    const s = String(id || '').trim();
    if (s) ids.add(s);
  }
  for (const id of ids) {
    if (allowed.has(id)) return true;
  }
  return false;
}

/**
 * Staff list scope for the active branch.
 * Seed logins (bis/raja/owner) stay Master-only so Branch Owners cannot manage them,
 * but Masters only see them when assigned to the selected branch.
 */
export function filterUsersForAuth(users, auth) {
  const list = Array.isArray(users) ? users : [];
  const readIds = resolveReadBranchIds(auth);
  if (readIds === null) return list;
  const allowed = new Set(readIds);
  if (!allowed.size) return [];
  const isMasterViewer = authHasGlobalBranchRead(auth);
  return list.filter((u) => {
    const login = String(u?.id || '').trim().toLowerCase();
    if (PROTECTED_STAFF_IDS.has(login) && !isMasterViewer) return false;
    return userMatchesReadBranches(u, allowed);
  });
}

/**
 * Branch Owner bulk staff save guard — master-only promotions and cross-branch assignment.
 * @returns {object[]} sanitized users
 */
export function sanitizeUsersBulkForAuth(users, auth) {
  const list = Array.isArray(users) ? users : [];
  if (authHasGlobalBranchRead(auth)) return list;
  if (!authIsBranchOwner(auth)) return list;
  const readIds = resolveReadBranchIds(auth);
  const allowed = new Set(readIds === null ? [] : readIds);
  return list
    .filter((u) => {
      const login = String(u?.id || '').trim().toLowerCase();
      if (!login || PROTECTED_STAFF_IDS.has(login)) return false;
      if (normalizeStaffRole(u?.staffRole, u?.id) !== STAFF_ROLES.STAFF) return false;
      return true;
    })
    .map((u) => {
      const branch = String(u?.gymCodeId || '').trim();
      const gymCodeId = allowed.has(branch) ? branch : [...allowed][0];
      const assignedBranchIds = (Array.isArray(u.assignedBranchIds) ? u.assignedBranchIds : [gymCodeId])
        .map((id) => String(id || '').trim())
        .filter((id) => allowed.has(id));
      const finalBranches = assignedBranchIds.length ? assignedBranchIds : (gymCodeId ? [gymCodeId] : []);
      return {
        ...u,
        staffRole: STAFF_ROLES.STAFF,
        gymCodeId: finalBranches[0] || gymCodeId,
        assignedBranchIds: finalBranches,
      };
    });
}

export function assertBranchAdminManagesUser(auth, targetUser) {
  if (authIsMasterOwner(auth)) return;
  const allowed = new Set(resolveAllowedBranchIds(auth) || []);
  const branch = String(targetUser?.gymCodeId || '').trim();
  if (!branch || !allowed.has(branch)) {
    const err = new Error('cross-branch-staff-forbidden');
    err.status = 403;
    throw err;
  }
}
