/** Staff role hierarchy for multi-tenant gym management. */
export const STAFF_ROLES = Object.freeze({
  STAFF: 'staff',
  BRANCH_OWNER: 'branch_owner',
  MASTER_OWNER: 'master_owner',
});

export const LOOKUP_CREATED_BY = Object.freeze({
  MASTER_OWNER: 'master_owner',
  BRANCH_OWNER: 'branch_owner',
  STAFF: 'staff',
});

export function normalizeStaffRole(raw, staffLoginId = '') {
  const login = String(staffLoginId || '').trim().toLowerCase();
  if (login === 'owner') return STAFF_ROLES.MASTER_OWNER;
  const role = String(raw || '').trim().toLowerCase();
  if (role === STAFF_ROLES.BRANCH_OWNER) return STAFF_ROLES.BRANCH_OWNER;
  if (role === STAFF_ROLES.MASTER_OWNER) return STAFF_ROLES.MASTER_OWNER;
  return STAFF_ROLES.STAFF;
}

export function isMasterOwnerRole(role) {
  return normalizeStaffRole(role) === STAFF_ROLES.MASTER_OWNER;
}

export function isBranchOwnerRole(role) {
  return normalizeStaffRole(role) === STAFF_ROLES.BRANCH_OWNER;
}
