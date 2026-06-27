export const STAFF_ROLES = {
  STAFF: 'staff',
  BRANCH_OWNER: 'branch_owner',
  MASTER_OWNER: 'master_owner',
};

export function authIsMasterOwnerUser(user) {
  if (!user) return false;
  const id = String(user.id || '').trim().toLowerCase();
  if (id === 'owner') return true;
  const role = String(user.staffRole || user.role || '').trim().toLowerCase();
  if (role === 'master_owner' || role === 'owner') return true;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.some((r) => {
    const key = String(r || '').trim().toLowerCase();
    return key === 'owner' || key === 'master_owner';
  });
}

export function authIsBranchOwnerUser(user) {
  if (!user) return false;
  if (authIsMasterOwnerUser(user)) return false;
  const role = String(user.staffRole || user.role || '').trim().toLowerCase();
  return role === 'branch_owner' || (Array.isArray(user.roles) && user.roles.includes('branch_owner'));
}

export function authIsBranchAdminUser(user) {
  return authIsMasterOwnerUser(user) || authIsBranchOwnerUser(user);
}

function normalizeBranchIdList(ids) {
  return [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export function allowedBranchIdsForUser(user) {
  if (!user) return [];
  if (authIsMasterOwnerUser(user)) return null;
  const fromAllowed = normalizeBranchIdList(user.allowedBranchIds);
  const fromAssigned = normalizeBranchIdList(user.assignedBranchIds);
  const union = normalizeBranchIdList([...fromAllowed, ...fromAssigned]);
  if (union.length) return union;
  const single = String(user.activeBranchId || user.gymCodeId || '').trim();
  return single ? [single] : [];
}

/** Data visibility scope — single active branch (staff, branch owner, and master owner in branch context). */
export function activeBranchIdsForDataScope(user) {
  const active = String(user?.activeBranchId || user?.gymCodeId || '').trim();
  if (authIsMasterOwnerUser(user)) {
    return active ? [active] : null;
  }
  const allowed = allowedBranchIdsForUser(user);
  if (!allowed?.length) return [];
  if (active && allowed.includes(active)) return [active];
  return [allowed[0]];
}

export function userCanAccessBranch(user, gymCodeId) {
  const target = String(gymCodeId || '').trim();
  if (!target) return false;
  const allowed = allowedBranchIdsForUser(user);
  if (allowed === null) return true;
  return allowed.includes(target);
}

export function memberInUserBranches(user, member) {
  if (!member) return false;
  const scope = activeBranchIdsForDataScope(user);
  if (scope === null) return true;
  if (!scope.length) return false;
  const memberBranch = String(member?.assignedGymCodeId || '').trim();
  // Legacy rows without branch tag: visible to master owner in active branch context only.
  if (!memberBranch) return authIsMasterOwnerUser(user);
  return scope.includes(memberBranch);
}

export function canDeleteMemberForUser(user, member, membersAccess) {
  if (membersAccess?.deleteMembers === false) return false;
  if (authIsMasterOwnerUser(user)) return true;
  if (authIsBranchOwnerUser(user)) return memberInUserBranches(user, member);
  return false;
}
