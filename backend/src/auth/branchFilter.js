import { T } from '../db/tables.js';
import { gymId } from '../db/supabase/client.js';
import { fetchAll } from '../db/supabase/utils.js';
import { visitorsHaveGymCodeColumn } from '../db/supabase/visitorsSchema.js';

export function authIsOwner(auth) {
  if (!auth) return false;
  if (String(auth.userId || '').toLowerCase() === 'owner') return true;
  return Array.isArray(auth.roles) && auth.roles.includes('owner');
}

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
  if (authIsOwner(auth)) return rows;
  if (!auth) return [];
  if (!auth.gymCodeId) return [];
  const code = String(auth.gymCodeId);
  return rows.filter((r) => {
    const rowCode = String(r?.assignedGymCodeId || '').trim();
    return rowCode === code;
  });
}

/** Stamp `assignedGymCodeId` from staff JWT when missing. Owner gets `defaultCode` (HQ) if omitted. */
export function stampBranchOnRows(rows, auth, defaultCode = null) {
  if (!Array.isArray(rows)) return [];
  const fromAuth = auth?.gymCodeId ? String(auth.gymCodeId) : null;
  const isOwner = authIsOwner(auth);
  return rows.map((r) => {
    if (!r || typeof r !== 'object') return r;
    if (r.assignedGymCodeId) return r;
    // Owner with no selection falls back to HQ; staff is stamped from JWT.
    const code = isOwner ? (defaultCode || fromAuth) : fromAuth;
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
  if (authIsOwner(auth)) return;
  if (!auth?.gymCodeId) {
    const err = new Error('branch-scope-missing');
    err.status = 403;
    throw err;
  }
  const code = String(auth.gymCodeId);
  for (const r of rows) {
    const rowCode = r?.assignedGymCodeId ? String(r.assignedGymCodeId).trim() : '';
    if (rowCode && rowCode !== code) {
      const err = new Error('cross-branch-write-forbidden');
      err.status = 403;
      err.detail = {
        violatingRow: r?.memberId || r?.id || null,
        expectedGymCodeId: code,
        gotGymCodeId: rowCode,
      };
      throw err;
    }
  }
}

/** @returns {Promise<{ limited: boolean, gymCodeId: string|null, memberCodes: Set<string>|null, staffLogins: Set<string>|null, visitorIds: Set<string>|null }>} */
export async function loadBranchScope(sb, auth) {
  if (!auth?.gymCodeId || authIsOwner(auth)) {
    return { limited: false, gymCodeId: null, memberCodes: null, staffLogins: null, visitorIds: null };
  }
  const gid = gymId();
  const gymCodeId = String(auth.gymCodeId);
  const visitorsGymCodeReady = await visitorsHaveGymCodeColumn(sb);
  const [memberRows, staffRows, visitorRows] = await Promise.all([
    fetchAll((from, to) =>
      sb.from(T.members).select('member_code').eq('gym_id', gid).eq('assigned_gym_code_id', gymCodeId).range(from, to),
    ),
    fetchAll((from, to) =>
      sb.from(T.staff_users).select('staff_login_id').eq('gym_id', gid).eq('gym_code_id', gymCodeId).range(from, to),
    ),
    visitorsGymCodeReady
      ? fetchAll((from, to) =>
        sb.from(T.visitors).select('external_visitor_id').eq('gym_id', gid).eq('assigned_gym_code_id', gymCodeId).range(from, to),
      )
      : fetchAll((from, to) =>
        sb.from(T.visitors).select('external_visitor_id').eq('gym_id', gid).range(from, to),
      ),
  ]);
  return {
    limited: true,
    gymCodeId,
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
