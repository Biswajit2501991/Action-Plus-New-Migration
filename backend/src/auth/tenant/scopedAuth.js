import { env } from '../../config/env.js';
import { STAFF_ROLES, normalizeStaffRole, isMasterOwnerRole, isBranchOwnerRole } from './roles.js';

export function branchOwnerFeatureEnabled() {
  const v = process.env.BRANCH_OWNER_ENABLED;
  if (v === 'true' || v === '1') return true;
  return env.BRANCH_OWNER_ENABLED === true;
}

/** Global master owner (login owner or master_owner role). */
export function authIsMasterOwner(auth) {
  if (!auth) return false;
  if (String(auth.userId || '').toLowerCase() === 'owner') return true;
  if (Array.isArray(auth.roles) && auth.roles.includes('owner')) return true;
  return isMasterOwnerRole(auth.staffRole);
}

/** Branch owner with feature enabled. */
export function authIsBranchOwner(auth) {
  if (!branchOwnerFeatureEnabled()) return false;
  return isBranchOwnerRole(auth.staffRole)
    || (Array.isArray(auth.roles) && auth.roles.includes('branch_owner'));
}

/** Cross-branch read (all gym branches). */
export function authHasGlobalBranchRead(auth) {
  return authIsMasterOwner(auth);
}

/**
 * @returns {string[]|null} null = all branches (master); [] = none; [...] = allowed UUIDs
 */
export function resolveAllowedBranchIds(auth) {
  if (!auth) return [];
  if (authHasGlobalBranchRead(auth)) return null;
  if (Array.isArray(auth.allowedBranchIds) && auth.allowedBranchIds.length) {
    return auth.allowedBranchIds.map((id) => String(id).trim()).filter(Boolean);
  }
  const single = String(auth.gymCodeId || auth.activeBranchId || '').trim();
  return single ? [single] : [];
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

/** Elevated admin within assigned branches (not global master). */
export function authIsBranchAdmin(auth) {
  return authIsMasterOwner(auth) || authIsBranchOwner(auth);
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
