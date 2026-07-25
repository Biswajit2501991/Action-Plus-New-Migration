import { authHasGlobalBranchRead, filterRowsByBranch, stampBranchOnRows } from './branchFilter.js';
import {
  resolveActiveBranchId,
  resolveAllowedBranchIds,
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
  const allAllowed = resolveAllowedBranchIds(auth);
  const allAllowedBranchIds = allAllowed === null ? null : [...new Set(allAllowed)];
  if (authHasGlobalBranchRead(auth)) {
    if (readIds === null) {
      return {
        isOwner: true,
        gymCodeId: null,
        allowedBranchIds: null,
        allAllowedBranchIds,
        staffNoBranch: false,
      };
    }
    return {
      isOwner: true,
      gymCodeId: readIds[0],
      allowedBranchIds: readIds,
      allAllowedBranchIds,
      staffNoBranch: false,
    };
  }
  if (!readIds?.length) {
    return {
      isOwner: false,
      gymCodeId: null,
      allowedBranchIds: [],
      allAllowedBranchIds: allAllowedBranchIds || [],
      staffNoBranch: true,
    };
  }
  const gymCodeId = readIds[0];
  return {
    isOwner: false,
    gymCodeId,
    allowedBranchIds: readIds,
    allAllowedBranchIds: allAllowedBranchIds || readIds,
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

/**
 * Whether a member may be reassigned from one branch to another.
 * Master owner: always. Multi-branch staff/admin: both branches must be in JWT scope.
 */
export function branchScopeAllowsMemberTransfer(branchScope, fromBranchId, toBranchId) {
  if (!branchScope) return true;
  if (branchScope.isOwner) return true;
  const from = String(fromBranchId || '').trim();
  const to = String(toBranchId || '').trim();
  if (!to || to === from) return true;
  const allowed = branchScope.allAllowedBranchIds;
  if (!Array.isArray(allowed) || !allowed.length) return false;
  const set = new Set(allowed.map((id) => String(id).trim()).filter(Boolean));
  return set.has(from) && set.has(to);
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
 * Filter attendance rows by branch staff logins.
 * When scope is not limited (master owner), staffLogins is null — return all rows.
 * @param {object[]} records
 * @param {{ limited?: boolean, staffLogins?: Set<string>|null }} scope from loadBranchScope
 */
export function filterAttendanceRecordsForBranchScope(records, scope) {
  const rows = Array.isArray(records) ? records : [];
  if (!scope?.limited || !scope.staffLogins) return rows;
  return rows.filter((r) => scope.staffLogins.has(String(r?.userId || '').trim()));
}

/**
 * Server-side write filter: staff may only upsert rows in their branch.
 * Prefer {@link prepareMembersBulkWrite} for PUT /members/bulk so untagged
 * creates are stamped before this filter runs (otherwise creates are silently dropped).
 */
export function filterRowsForStaffWrite(rows, auth) {
  return filterRowsByBranch(rows, auth);
}

/**
 * Durable bulk prepare: stamp branch first, then apply staff write filter.
 * Prevents "saved then disappeared" when clients omit assignedGymCodeId.
 *
 * @returns {{ prepared: object[], stamped: object[], droppedIds: string[] }}
 */
export function prepareMembersBulkWrite(rows, auth) {
  const incoming = Array.isArray(rows) ? rows : [];
  const stamped = stampBranchOnRows(incoming, auth);
  const prepared = filterRowsForStaffWrite(stamped, auth);
  if (authHasGlobalBranchRead(auth) || prepared.length === stamped.length) {
    return { prepared, stamped, droppedIds: [] };
  }
  const kept = new Set(
    prepared.map((r) => String(r?.memberId || '').trim()).filter(Boolean),
  );
  const droppedIds = stamped
    .map((r) => String(r?.memberId || '').trim())
    .filter((id) => id && !kept.has(id));
  return { prepared, stamped, droppedIds };
}

/**
 * Fail closed when the client sent members but none are writable after scope.
 * @throws {Error & { status?: number, detail?: object }}
 */
export function assertMembersBulkWriteNonEmpty(receivedCount, prepared, droppedIds = []) {
  const n = Number(receivedCount) || 0;
  const writable = Array.isArray(prepared) ? prepared.length : 0;
  if (n > 0 && writable === 0) {
    const err = new Error('members-bulk-empty-after-scope');
    err.status = 400;
    err.detail = {
      received: n,
      writable: 0,
      droppedIds: Array.isArray(droppedIds) ? droppedIds : [],
    };
    throw err;
  }
}

/**
 * Fail closed when the client sent writable rows but nothing was persisted
 * (e.g. all codes blocked by soft-delete / delete-audit resurrection guard).
 * @throws {Error & { status?: number, detail?: object }}
 */
export function assertMembersBulkPersisted(preparedIds, writtenIds, skippedIds) {
  const prepared = (Array.isArray(preparedIds) ? preparedIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  if (!prepared.length) return;
  const written = new Set(
    (Array.isArray(writtenIds) ? writtenIds : []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  if (written.size > 0) return;
  const skipped = (Array.isArray(skippedIds) ? skippedIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const err = new Error(skipped.length ? 'members-bulk-blocked' : 'members-bulk-not-persisted');
  err.status = 409;
  err.detail = { skipped, missing: prepared };
  throw err;
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
