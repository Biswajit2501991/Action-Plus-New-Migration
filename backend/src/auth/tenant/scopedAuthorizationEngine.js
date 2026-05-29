import { resolveRoleHierarchy } from './roleHierarchyResolver.js';

/** Master Owner — global gym authority. */
export function engineIsMasterOwner(auth) {
  return resolveRoleHierarchy(auth).isMasterOwner;
}

/** Branch Owner — admin within assigned branches (role-based, not env-gated). */
export function engineIsBranchOwner(auth) {
  return resolveRoleHierarchy(auth).isBranchOwner;
}

/** Master Owner or Branch Owner — may list/manage staff within scope. */
export function engineIsBranchAdmin(auth) {
  return resolveRoleHierarchy(auth).isBranchAdmin;
}

/** Cross-branch read (all gym branches). */
export function engineHasGlobalBranchRead(auth) {
  return engineIsMasterOwner(auth);
}

/** May call GET /api/users and receive a staff list. */
export function engineCanListStaff(auth) {
  return engineIsBranchAdmin(auth);
}

/** May call PUT /api/users/bulk and POST /api/users/cleanup. */
export function engineCanManageStaff(auth) {
  return engineIsBranchAdmin(auth);
}

/** Master-only platform operations (backups, settings bulk, etc.). */
export function engineCanMasterPlatformOps(auth) {
  return engineIsMasterOwner(auth);
}

export function engineDescribeAuth(auth) {
  const hierarchy = resolveRoleHierarchy(auth);
  return {
    ...hierarchy,
    canListStaff: engineCanListStaff(auth),
    canManageStaff: engineCanManageStaff(auth),
    canMasterPlatformOps: engineCanMasterPlatformOps(auth),
  };
}
