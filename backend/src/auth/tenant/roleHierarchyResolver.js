import { STAFF_ROLES, normalizeStaffRole, isMasterOwnerRole, isBranchOwnerRole } from './roles.js';

/**
 * Resolved role hierarchy for a request auth object (JWT + middleware enrichment).
 * Master Owner > Branch Owner > Staff
 */
export function resolveRoleHierarchy(auth) {
  if (!auth?.userId) {
    return {
      staffRole: STAFF_ROLES.STAFF,
      isMasterOwner: false,
      isBranchOwner: false,
      isBranchAdmin: false,
      isStaff: true,
      roleSource: 'none',
    };
  }

  const userId = String(auth.userId || '').trim();
  const loginLower = userId.toLowerCase();
  const jwtRoles = Array.isArray(auth.roles) ? auth.roles : [];
  const dbRole = normalizeStaffRole(auth.staffRole, userId);

  let staffRole = dbRole;
  let roleSource = auth.staffRole ? 'staffRole' : 'default';

  if (loginLower === 'owner' || jwtRoles.includes('owner') || isMasterOwnerRole(dbRole)) {
    staffRole = STAFF_ROLES.MASTER_OWNER;
    roleSource = loginLower === 'owner' ? 'login-id' : (jwtRoles.includes('owner') ? 'jwt-roles' : 'staffRole');
  } else if (isBranchOwnerRole(dbRole) || jwtRoles.includes('branch_owner')) {
    staffRole = STAFF_ROLES.BRANCH_OWNER;
    roleSource = isBranchOwnerRole(dbRole) ? 'staffRole' : 'jwt-roles';
  }

  const isMasterOwner = staffRole === STAFF_ROLES.MASTER_OWNER;
  const isBranchOwner = !isMasterOwner && staffRole === STAFF_ROLES.BRANCH_OWNER;
  const isBranchAdmin = isMasterOwner || isBranchOwner;

  return {
    staffRole,
    isMasterOwner,
    isBranchOwner,
    isBranchAdmin,
    isStaff: !isBranchAdmin,
    roleSource,
  };
}
