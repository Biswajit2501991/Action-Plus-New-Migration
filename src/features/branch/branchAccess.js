/**
 * Client-side branch helpers (defense in depth — server enforces via API).
 */

export function authIsOwnerUser(user) {
  if (!user) return false;
  const id = String(user.id || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();
  return id === 'owner' || role === 'owner';
}

export function staffHasBranch(user) {
  if (!user || authIsOwnerUser(user)) return true;
  return Boolean(String(user.gymCodeId || '').trim());
}

export function memberInStaffBranch(user, member) {
  if (!member) return false;
  if (authIsOwnerUser(user)) return true;
  const staffCode = String(user?.gymCodeId || '').trim();
  if (!staffCode) return false;
  const memberCode = String(member?.assignedGymCodeId || '').trim();
  if (!memberCode) return false;
  return memberCode === staffCode;
}

export function filterMembersForUser(user, members) {
  const list = Array.isArray(members) ? members : [];
  if (authIsOwnerUser(user)) return list;
  if (!staffHasBranch(user)) return [];
  return list.filter((m) => memberInStaffBranch(user, m));
}

export function filterVisitorsForUser(user, visitors) {
  const list = Array.isArray(visitors) ? visitors : [];
  if (authIsOwnerUser(user)) return list;
  if (!staffHasBranch(user)) return [];
  return list.filter((v) => memberInStaffBranch(user, v));
}

/** Bulk PUT payload — never send cross-branch rows (avoids 403 on debounced sync). */
export function scopeMembersForBulkSync(user, members) {
  return filterMembersForUser(user, members);
}

export function scopeVisitorsForBulkSync(user, visitors) {
  return filterVisitorsForUser(user, visitors);
}
