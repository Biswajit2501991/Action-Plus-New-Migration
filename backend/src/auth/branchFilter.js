import { T } from '../db/tables.js';
import { gymId } from '../db/supabase/client.js';
import { fetchAll } from '../db/supabase/utils.js';
import { visitorsHaveGymCodeColumn } from '../db/supabase/visitorsSchema.js';
import {
  authHasGlobalBranchRead,
  authIsMasterOwner,
  resolveAllowedBranchIds,
  resolveActiveBranchId,
} from './tenant/scopedAuth.js';

/** Master Owner only — cross-branch global authority (legacy name kept). */
export function authIsOwner(auth) {
  return authIsMasterOwner(auth);
}

export { authIsMasterOwner, authHasGlobalBranchRead };

/**
 * Strict branch filter (Phase 2 zero-leak contract).
 *
 * - Owner: sees everything.
 * - Staff with a gymCodeId: ONLY rows whose `assignedGymCodeId` exactly matches the
 *   staff branch. Untagged (NULL) legacy rows are explicitly hidden — they used to leak
 *   to every staff member and that violated the no-cross-tenant directive.
 * - Staff without a gymCodeId: nothing (locked-down by default until the staff record
 *   is repaired).
 *
 * In practice the GET routes apply this filter at the SQL layer, so this function is
 * the in-memory belt-and-braces (used for SSE payloads, unit tests, etc.).
 */
export function filterRowsByBranch(rows, auth) {
  if (!Array.isArray(rows)) return [];
  if (authHasGlobalBranchRead(auth)) return rows;
  if (!auth) return [];
  const allowed = resolveAllowedBranchIds(auth);
  if (allowed === null) return rows;
  if (!allowed.length) return [];
  if (allowed.length === 1) {
    const code = allowed[0];
    return rows.filter((r) => String(r?.assignedGymCodeId || '').trim() === code);
  }
  const set = new Set(allowed);
  return rows.filter((r) => set.has(String(r?.assignedGymCodeId || '').trim()));
}

/** Stamp `assignedGymCodeId` from staff JWT when missing. Owner gets `defaultCode` (HQ) if omitted. */
export function stampBranchOnRows(rows, auth, defaultCode = null) {
  if (!Array.isArray(rows)) return [];
  const fromAuth = resolveActiveBranchId(auth) || null;
  const isOwner = authHasGlobalBranchRead(auth);
  return rows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    // Staff always stamp JWT branch (client drafts may carry owner/HQ).
    if (!isOwner && fromAuth) {
      return { ...r, assignedGymCodeId: fromAuth };
    }
    if (r.assignedGymCodeId) return r;
    // Owner with no selection falls back to HQ.
    const code = defaultCode || fromAuth;
    if (!code) return r;
    return { ...r, assignedGymCodeId: code };
  });
}

/**
 * Reject write payload if staff is touching rows outside their branch.
 * Throws an Error with `.status = 403` so the route handler can return the right HTTP status.
 */
export function assertBranchWriteAllowed(rows, auth) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  if (authHasGlobalBranchRead(auth)) return;
  const allowed = resolveAllowedBranchIds(auth);
  if (!allowed?.length) {
    const err = new Error('branch-scope-missing');
    err.status = 403;
    throw err;
  }
  const set = new Set(allowed);
  for (const r of rows) {
    const rowCode = r?.assignedGymCodeId ? String(r.assignedGymCodeId).trim() : '';
    if (rowCode && !set.has(rowCode)) {
      const err = new Error('cross-branch-write-forbidden');
      err.status = 403;
      err.detail = {
        violatingRow: r?.memberId || r?.id || null,
        allowedGymCodeIds: [...set],
        gotGymCodeId: rowCode,
      };
      throw err;
    }
  }
}

/** @returns {Promise<{ limited: boolean, gymCodeId: string|null, memberCodes: Set<string>|null, staffLogins: Set<string>|null, visitorIds: Set<string>|null }>} */
export async function loadBranchScope(sb, auth) {
  if (authHasGlobalBranchRead(auth)) {
    return { limited: false, gymCodeId: null, memberCodes: null, staffLogins: null, visitorIds: null };
  }
  const allowed = resolveAllowedBranchIds(auth);
  if (!allowed?.length) {
    return {
      limited: true,
      gymCodeId: null,
      memberCodes: new Set(),
      staffLogins: new Set(),
      visitorIds: new Set(),
    };
  }
  const gid = gymId();
  const activeBranch = resolveActiveBranchId(auth) || allowed[0];
  const visitorsGymCodeReady = await visitorsHaveGymCodeColumn(sb);
  const memberQuery = (from, to) => {
    let q = sb.from(T.members).select('member_code').eq('gym_id', gid);
    q = allowed.length === 1
      ? q.eq('assigned_gym_code_id', allowed[0])
      : q.in('assigned_gym_code_id', allowed);
    return q.range(from, to);
  };
  const staffQuery = (from, to) => {
    let q = sb.from(T.staff_users).select('staff_login_id').eq('gym_id', gid);
    q = allowed.length === 1
      ? q.eq('gym_code_id', allowed[0])
      : q.in('gym_code_id', allowed);
    return q.range(from, to);
  };
  const visitorQuery = (from, to) => {
    let q = sb.from(T.visitors).select('external_visitor_id').eq('gym_id', gid);
    if (visitorsGymCodeReady) {
      q = allowed.length === 1
        ? q.eq('assigned_gym_code_id', allowed[0])
        : q.in('assigned_gym_code_id', allowed);
    }
    return q.range(from, to);
  };
  const [memberRows, staffRows, visitorRows] = await Promise.all([
    fetchAll(memberQuery),
    fetchAll(staffQuery),
    fetchAll(visitorQuery),
  ]);
  return {
    limited: true,
    gymCodeId: activeBranch,
    allowedBranchIds: allowed,
    memberCodes: new Set((memberRows || []).map((r) => String(r.member_code || '')).filter(Boolean)),
    staffLogins: new Set((staffRows || []).map((r) => String(r.staff_login_id || '')).filter(Boolean)),
    visitorIds: new Set((visitorRows || []).map((r) => String(r.external_visitor_id || '')).filter(Boolean)),
  };
}

export function logMatchesBranchScope(log, scope) {
  if (!scope?.limited) return true;
  const eid = String(log?.entityId || '').trim();
  const et = String(log?.entityType || '').toLowerCase();
  const act = String(log?.action || '');
  const after = log?.after && typeof log.after === 'object' ? log.after : {};
  const before = log?.before && typeof log.before === 'object' ? log.before : {};

  if (
    et === 'member'
    || act === 'status.changed'
    || act === 'sms.status_triggered'
    || act === 'member.payment.added'
    || act === 'member.payment.deleted'
    || act.startsWith('member.')
  ) {
    return scope.memberCodes.has(eid);
  }
  if (et === 'visitor' || act.startsWith('visitor.')) {
    return scope.visitorIds.has(eid);
  }
  if (et === 'user' || act.startsWith('staff.') || act.startsWith('auth.')) {
    if (scope.staffLogins.has(eid)) return true;
    const ids = [after.id, after.staffId, before.id, after.userId, before.userId].map((x) => String(x || '').trim());
    return ids.some((id) => id && scope.staffLogins.has(id));
  }
  if (act.startsWith('leave.') || act === 'attendance.leave_synced') {
    const uid = String(after.userId || before.userId || eid || '').trim();
    return uid && scope.staffLogins.has(uid);
  }
  return false;
}
