import { authHasGlobalBranchRead, filterRowsByBranch } from './branchFilter.js';
import { resolveAllowedBranchIds, resolveActiveBranchId } from './tenant/scopedAuth.js';

/**
 * Read-scope descriptor for SQL / in-memory collection filtering.
 * - Master Owner: no branch filter (sees all members in gym).
 * - Branch Owner: allowedBranchIds (multi-branch IN filter).
 * - Staff: single gymCodeId match.
 */
export function resolveReadBranchScope(auth) {
  if (!auth) return null;
  if (authHasGlobalBranchRead(auth)) {
    return { isOwner: true, gymCodeId: null, allowedBranchIds: null, staffNoBranch: false };
  }
  const allowed = resolveAllowedBranchIds(auth);
  if (!allowed?.length) {
    return { isOwner: false, gymCodeId: null, allowedBranchIds: [], staffNoBranch: true };
  }
  const gymCodeId = resolveActiveBranchId(auth) || allowed[0];
  return {
    isOwner: false,
    gymCodeId,
    allowedBranchIds: allowed,
    staffNoBranch: false,
  };
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
  const allowed = branchScope.allowedBranchIds;
  if (Array.isArray(allowed) && allowed.length > 1) {
    return allowed.includes(rowCode);
  }
  return rowCode === String(branchScope.gymCodeId);
}

/**
 * In-memory filter (SSE payloads, tests, defensive client parity).
 */
export function filterMembersForBranchScope(rows, branchScope) {
  if (!Array.isArray(rows)) return [];
  if (!branchScope || branchScope.isOwner) return rows;
  if (branchScope.staffNoBranch) return [];
  const allowed = branchScope.allowedBranchIds;
  if (Array.isArray(allowed) && allowed.length > 1) {
    const set = new Set(allowed);
    return rows.filter((r) => set.has(String(r?.assignedGymCodeId || '').trim()));
  }
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
  if (!auth || authHasGlobalBranchRead(auth)) return;
  const allowed = resolveAllowedBranchIds(auth);
  if (allowed?.length) return;
  if (!String(auth.gymCodeId || auth.activeBranchId || '').trim()) {
    const err = new Error('branch-scope-missing');
    err.status = 403;
    throw err;
  }
}
