import { env } from '../../config/env.js';
import { STAFF_ROLES, normalizeStaffRole } from './roles.js';
import { resolveRoleHierarchy } from './roleHierarchyResolver.js';
import {
  engineIsMasterOwner,
  engineIsBranchOwner,
  engineIsBranchAdmin,
  engineHasGlobalBranchRead,
} from './scopedAuthorizationEngine.js';

export function branchOwnerFeatureEnabled() {
  const v = process.env.BRANCH_OWNER_ENABLED;
  if (v === 'true' || v === '1') return true;
  return env.BRANCH_OWNER_ENABLED === true;
}

/** Global master owner (login owner or master_owner role). */
export function authIsMasterOwner(auth) {
  return engineIsMasterOwner(auth);
}

/** Branch owner — role-based; not gated by BRANCH_OWNER_ENABLED. */
export function authIsBranchOwner(auth) {
  return engineIsBranchOwner(auth);
}

/** Cross-branch read (all gym branches). */
export function authHasGlobalBranchRead(auth) {
  return engineHasGlobalBranchRead(auth);
}

/**
 * @returns {string[]|null} null = all branches (master); [] = none; [...] = allowed UUIDs
 */
export function resolveAllowedBranchIds(auth) {
  if (!auth) return [];
  if (authHasGlobalBranchRead(auth)) return null;
  const fromJwt = Array.isArray(auth.allowedBranchIds)
    ? auth.allowedBranchIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (fromJwt.length) return [...new Set(fromJwt)];
  const single = String(auth.gymCodeId || auth.activeBranchId || '').trim();
  return single ? [single] : [];
}

export function authCanAccessBranch(auth, gymCodeId) {
  const target = String(gymCodeId || '').trim();
  if (!target) return false;
  const allowed = resolveAllowedBranchIds(auth);
  if (allowed === null) return true;
  return allowed.includes(target);
}

export function resolveActiveBranchId(auth) {
  if (!auth) return '';
  const active = String(auth.activeBranchId || auth.gymCodeId || '').trim();
  if (!active) return '';
  const allowed = resolveAllowedBranchIds(auth);
  if (allowed === null) return active;
  if (allowed.includes(active)) return active;
  return allowed[0] || '';
}

/**
 * Branch IDs used for read scoping. Multi-branch users see only the active branch.
 * @returns {string[]|null} null = all branches (master)
 */
export function resolveReadBranchIds(auth) {
  if (!auth) return [];
  if (authHasGlobalBranchRead(auth)) return null;
  const allowed = resolveAllowedBranchIds(auth);
  if (!allowed?.length) return [];
  const active = resolveActiveBranchId(auth);
  if (allowed.length > 1 && active && allowed.includes(active)) {
    return [active];
  }
  return allowed;
}

/** Elevated admin within assigned branches (not global master). */
export function authIsBranchAdmin(auth) {
  return engineIsBranchAdmin(auth);
}

export function assertBranchInScope(auth, gymCodeId) {
  if (!authCanAccessBranch(auth, gymCodeId)) {
    const err = new Error('branch-scope-forbidden');
    err.status = 403;
    throw err;
  }
}

export function normalizeAuthStaffRole(auth) {
  if (!auth) return STAFF_ROLES.STAFF;
  return normalizeStaffRole(auth.staffRole, auth.userId);
}

export { resolveRoleHierarchy } from './roleHierarchyResolver.js';
export { engineDescribeAuth, engineCanListStaff, engineCanManageStaff } from './scopedAuthorizationEngine.js';
