import { authIsOwnerUser } from '../branch/branchAccess.js';

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
  return role === 'master_owner' || role === 'owner';
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

export function allowedBranchIdsForUser(user) {
  if (!user) return [];
  if (authIsMasterOwnerUser(user)) return null;
  const fromUser = Array.isArray(user.allowedBranchIds) ? user.allowedBranchIds : [];
  if (fromUser.length) return fromUser.map((id) => String(id).trim()).filter(Boolean);
  const single = String(user.activeBranchId || user.gymCodeId || '').trim();
  return single ? [single] : [];
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
  if (authIsMasterOwnerUser(user)) return true;
  const allowed = allowedBranchIdsForUser(user);
  if (!allowed?.length) return false;
  const memberBranch = String(member?.assignedGymCodeId || '').trim();
  if (!memberBranch) return false;
  return allowed.includes(memberBranch);
}

export function canDeleteMemberForUser(user, member, membersAccess) {
  if (membersAccess?.deleteMembers === false) return false;
  if (authIsMasterOwnerUser(user)) return true;
  if (authIsBranchOwnerUser(user)) return memberInUserBranches(user, member);
  return false;
}
