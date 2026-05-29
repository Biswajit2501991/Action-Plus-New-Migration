import {
  PASSWORD_RESET_STATUS,
  passwordResetStatusFromRecord,
} from '../../../../src/features/passwordReset/passwordResetStatus.js';
import { engineCanManageStaff } from '../tenant/scopedAuthorizationEngine.js';
import { assertBranchAdminManagesUser } from '../tenant/userScope.js';

export function isPasswordResetPendingRow(row) {
  return passwordResetStatusFromRecord(row) === PASSWORD_RESET_STATUS.PENDING;
}

/** Master owner or branch owner with staff-management rights. */
export function canDecidePasswordReset(auth) {
  return Boolean(auth?.userId) && engineCanManageStaff(auth);
}

/**
 * @throws Error with status 403 when actor cannot manage target staff
 */
export function assertActorCanDecideForStaff(auth, targetUser) {
  if (!canDecidePasswordReset(auth)) {
    const err = new Error('branch-admin-required');
    err.status = 403;
    throw err;
  }
  const login = String(targetUser?.id || '').trim().toLowerCase();
  if (!login || login === 'owner') {
    const err = new Error('invalid-staff-id');
    err.status = 400;
    throw err;
  }
  assertBranchAdminManagesUser(auth, targetUser);
}

/**
 * @returns {{ ok: true, alreadyProcessed?: boolean, status: string } | { ok: false, error: string, status?: string }}
 */
export function validatePendingDecision(row, expectedTerminalStatus) {
  const status = passwordResetStatusFromRecord(row);
  if (status === PASSWORD_RESET_STATUS.PENDING) {
    return { ok: true, status };
  }
  if (status === expectedTerminalStatus) {
    return { ok: true, alreadyProcessed: true, status };
  }
  return { ok: false, error: 'reset-not-pending', status };
}
