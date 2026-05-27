import { authIsOwner, filterRowsByBranch } from './branchFilter.js';

/**
 * Read-scope descriptor for SQL / in-memory collection filtering.
 * - Owner: no branch filter (sees all members in gym).
 * - Staff with gymCodeId: strict branch match only.
 * - Staff without gymCodeId: empty result set (no cross-branch leak).
 */
export function resolveReadBranchScope(auth) {
  if (!auth) return null;
  if (authIsOwner(auth)) {
    return { isOwner: true, gymCodeId: null, staffNoBranch: false };
  }
  const gymCodeId = auth.gymCodeId ? String(auth.gymCodeId).trim() : '';
  if (!gymCodeId) {
    return { isOwner: false, gymCodeId: null, staffNoBranch: true };
  }
  return { isOwner: false, gymCodeId, staffNoBranch: false };
}

/** @param {ReturnType<typeof resolveReadBranchScope>|null} branchScope */
export function staffBranchBlocksAllRows(branchScope) {
  return Boolean(branchScope && !branchScope.isOwner && branchScope.staffNoBranch);
}

/** @param {ReturnType<typeof resolveReadBranchScope>|null} branchScope */
export function branchScopeAllowsMember(branchScope, assignedGymCodeId) {
  if (!branchScope || branchScope.isOwner) return true;
  if (branchScope.staffNoBranch) return false;
  const rowCode = String(assignedGymCodeId || '').trim();
  if (!rowCode) return false;
  return rowCode === String(branchScope.gymCodeId);
}

/**
 * In-memory filter (SSE payloads, tests, defensive client parity).
 */
export function filterMembersForBranchScope(rows, branchScope) {
  if (!Array.isArray(rows)) return [];
  if (!branchScope || branchScope.isOwner) return rows;
  if (branchScope.staffNoBranch) return [];
  const code = String(branchScope.gymCodeId);
  return rows.filter((r) => String(r?.assignedGymCodeId || '').trim() === code);
}

/**
 * Server-side write filter: staff may only upsert rows in their branch.
 * Untagged rows are dropped (prevents stamping another branch's legacy rows via bulk PUT).
 */
export function filterRowsForStaffWrite(rows, auth) {
  return filterRowsByBranch(rows, auth);
}

/** @throws {Error & { status?: number }} */
export function assertStaffHasBranchForWrite(auth) {
  if (!auth || authIsOwner(auth)) return;
  if (!String(auth.gymCodeId || '').trim()) {
    const err = new Error('branch-scope-missing');
    err.status = 403;
    throw err;
  }
}
