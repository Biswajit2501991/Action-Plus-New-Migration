import { STAFF_ROLES, normalizeStaffRole } from './roles.js';
import {
  authHasGlobalBranchRead,
  authIsBranchOwner,
  authIsMasterOwner,
  resolveAllowedBranchIds,
  resolveReadBranchIds,
} from './scopedAuth.js';

const PROTECTED_STAFF_IDS = new Set(['bis', 'raja', 'owner']);

export function filterUsersForAuth(users, auth) {
  const list = Array.isArray(users) ? users : [];
  const readIds = resolveReadBranchIds(auth);
  if (readIds === null) return list;
  const allowed = new Set(readIds);
  if (!allowed.size) return [];
  const masterCanSeeProtected = authHasGlobalBranchRead(auth);
  return list.filter((u) => {
    const login = String(u?.id || '').trim().toLowerCase();
    if (PROTECTED_STAFF_IDS.has(login)) return masterCanSeeProtected;
    if (normalizeStaffRole(u?.staffRole, u?.id) === STAFF_ROLES.MASTER_OWNER) {
      return masterCanSeeProtected;
    }
    const branch = String(u?.gymCodeId || '').trim();
    return branch && allowed.has(branch);
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
