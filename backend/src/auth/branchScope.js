import { authHasGlobalBranchRead, filterRowsByBranch } from './branchFilter.js';
import {
  resolveActiveBranchId,
  resolveReadBranchIds,
} from './tenant/scopedAuth.js';

/**
 * Read-scope descriptor for SQL / in-memory collection filtering.
 * - Master Owner: no branch filter (sees all members in gym).
 * - Staff / Branch Owner: single active branch (tenant context slice).
 */
export function resolveReadBranchScope(auth) {
  if (!auth) return null;
  const readIds = resolveReadBranchIds(auth);
  if (authHasGlobalBranchRead(auth)) {
    if (readIds === null) {
      return { isOwner: true, gymCodeId: null, allowedBranchIds: null, staffNoBranch: false };
    }
    return {
      isOwner: true,
      gymCodeId: readIds[0],
      allowedBranchIds: readIds,
      staffNoBranch: false,
    };
  }
  if (!readIds?.length) {
    return { isOwner: false, gymCodeId: null, allowedBranchIds: [], staffNoBranch: true };
  }
  const gymCodeId = readIds[0];
  return {
    isOwner: false,
    gymCodeId,
    allowedBranchIds: readIds,
    staffNoBranch: false,
  };
}

/** List/read SQL filters to gymCodeId whenever operational active branch is set. */
export function branchScopeRestrictsToGymCode(branchScope) {
  return Boolean(branchScope?.gymCodeId);
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
  const active = String(branchScope.gymCodeId || branchScope.allowedBranchIds?.[0] || '').trim();
  return rowCode === active;
}

/**
 * In-memory filter (SSE payloads, tests, defensive client parity).
 */
export function filterMembersForBranchScope(rows, branchScope) {
  if (!Array.isArray(rows)) return [];
  if (!branchScope || branchScope.isOwner) return rows;
  if (branchScope.staffNoBranch) return [];
  const code = String(branchScope.gymCodeId || branchScope.allowedBranchIds?.[0] || '').trim();
  if (!code) return [];
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
  const allowed = resolveReadBranchIds(auth);
  if (allowed?.length) return;
  if (!String(auth.gymCodeId || auth.activeBranchId || '').trim()) {
    const err = new Error('branch-scope-missing');
    err.status = 403;
    throw err;
  }
}
