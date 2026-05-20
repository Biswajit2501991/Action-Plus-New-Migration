import { T } from '../db/tables.js';
import { gymId } from '../db/supabase/client.js';
import { fetchAll } from '../db/supabase/utils.js';

export function authIsOwner(auth) {
  if (!auth) return false;
  if (String(auth.userId || '').toLowerCase() === 'owner') return true;
  return Array.isArray(auth.roles) && auth.roles.includes('owner');
}

/** @returns {Promise<{ limited: boolean, gymCodeId: string|null, memberCodes: Set<string>|null, staffLogins: Set<string>|null, visitorIds: Set<string>|null }>} */
export async function loadBranchScope(sb, auth) {
  if (!auth?.gymCodeId || authIsOwner(auth)) {
    return { limited: false, gymCodeId: null, memberCodes: null, staffLogins: null, visitorIds: null };
  }
  const gid = gymId();
  const gymCodeId = String(auth.gymCodeId);
  const [memberRows, staffRows, visitorRows] = await Promise.all([
    fetchAll((from, to) =>
      sb.from(T.members).select('member_code').eq('gym_id', gid).eq('assigned_gym_code_id', gymCodeId).range(from, to),
    ),
    fetchAll((from, to) =>
      sb.from(T.staff_users).select('staff_login_id').eq('gym_id', gid).eq('gym_code_id', gymCodeId).range(from, to),
    ),
    fetchAll((from, to) =>
      sb.from(T.visitors).select('external_visitor_id').eq('gym_id', gid).eq('assigned_gym_code_id', gymCodeId).range(from, to),
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
