import { PASSWORD_RESET_STATUS } from './passwordResetStatus.js';

/**
 * @param {object} targetUser
 * @param {{ actor?: string, now?: string, requestedByLogin?: string }} [opts]
 */
export function patchUserAfterPasswordResetRequest(targetUser, opts = {}) {
  const now = opts.now || new Date().toISOString();
  return {
    ...targetUser,
    passwordResetStatus: PASSWORD_RESET_STATUS.PENDING,
    passwordResetRequestedAt: now,
    passwordResetRequestedByLogin: opts.requestedByLogin || targetUser?.id || '',
    passwordResetApprovedAt: '',
    passwordResetApprovedBy: '',
    passwordResetRejectedAt: '',
    passwordResetRejectedBy: '',
  };
}

/**
 * @param {object} targetUser
 * @param {{ actor?: string, now?: string }} [opts]
 */
export function patchUserAfterPasswordResetApprove(targetUser, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const actor = opts.actor || 'owner';
  return {
    ...targetUser,
    passwordUpdatedAt: now,
    passwordUpdatedBy: actor,
    passwordResetStatus: PASSWORD_RESET_STATUS.APPROVED,
    passwordResetApprovedAt: now,
    passwordResetApprovedBy: actor,
    passwordResetRequestedAt: '',
    passwordResetRequestedByLogin: '',
    passwordResetRejectedAt: '',
    passwordResetRejectedBy: '',
  };
}

/**
 * @param {object} targetUser
 * @param {{ actor?: string, now?: string }} [opts]
 */
export function patchUserAfterPasswordResetReject(targetUser, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const actor = opts.actor || 'owner';
  return {
    ...targetUser,
    passwordResetStatus: PASSWORD_RESET_STATUS.REJECTED,
    passwordResetRejectedAt: now,
    passwordResetRejectedBy: actor,
    passwordResetRequestedAt: '',
    passwordResetRequestedByLogin: '',
    passwordResetApprovedAt: '',
    passwordResetApprovedBy: '',
  };
}
