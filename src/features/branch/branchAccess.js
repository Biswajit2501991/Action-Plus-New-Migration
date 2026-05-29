/**
 * Client-side branch helpers (defense in depth — server enforces via API).
 */

import {
  authIsMasterOwnerUser,
  authIsBranchOwnerUser,
  allowedBranchIdsForUser,
  memberInUserBranches,
} from '../tenant/branchOwnerAccess.js';

/** Master Owner — all branches (legacy name retained). */
export function authIsOwnerUser(user) {
  return authIsMasterOwnerUser(user);
}

export { authIsMasterOwnerUser, authIsBranchOwnerUser };

export function staffHasBranch(user) {
  if (!user || authIsMasterOwnerUser(user)) return true;
  const allowed = allowedBranchIdsForUser(user);
  if (allowed === null) return true;
  return allowed.length > 0;
}

export function memberInStaffBranch(user, member) {
  return memberInUserBranches(user, member);
}

export function filterMembersForUser(user, members) {
  const list = Array.isArray(members) ? members : [];
  if (!user) return [];
  if (!staffHasBranch(user) && !authIsMasterOwnerUser(user)) return [];
  return list.filter((m) => memberInUserBranches(user, m));
}

export function filterVisitorsForUser(user, visitors) {
  const list = Array.isArray(visitors) ? visitors : [];
  if (!user) return [];
  if (!staffHasBranch(user) && !authIsMasterOwnerUser(user)) return [];
  return list.filter((v) => memberInUserBranches(user, v));
}

/** Bulk PUT payload — never send cross-branch rows (avoids 403 on debounced sync). */
export function scopeMembersForBulkSync(user, members) {
  return filterMembersForUser(user, members);
}

export function scopeVisitorsForBulkSync(user, visitors) {
  return filterVisitorsForUser(user, visitors);
}
