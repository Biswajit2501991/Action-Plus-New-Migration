/**
 * Password reset request status — shared by frontend and backend.
 * Status values: '' | 'pending' | 'approved' | 'rejected' | 'cancelled'
 */

export const PASSWORD_RESET_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
};

function toMs(value) {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/** @param {{ passwordResetRequestedAt?: string, passwordResetApprovedAt?: string, passwordResetRejectedAt?: string, password_reset_requested_at?: string, password_reset_approved_at?: string, password_reset_rejected_at?: string }} record */
export function passwordResetStatusFromRecord(record) {
  const requestedAt = record?.passwordResetRequestedAt || record?.password_reset_requested_at || '';
  const approvedAt = record?.passwordResetApprovedAt || record?.password_reset_approved_at || '';
  const rejectedAt = record?.passwordResetRejectedAt || record?.password_reset_rejected_at || '';

  if (!requestedAt) {
    if (rejectedAt && !approvedAt) return PASSWORD_RESET_STATUS.REJECTED;
    return '';
  }

  const reqMs = toMs(requestedAt);
  if (!Number.isFinite(reqMs)) return '';

  const appMs = toMs(approvedAt);
  const rejMs = toMs(rejectedAt);

  if (Number.isFinite(appMs) && appMs >= reqMs) return PASSWORD_RESET_STATUS.APPROVED;
  if (Number.isFinite(rejMs) && rejMs >= reqMs) return PASSWORD_RESET_STATUS.REJECTED;
  return PASSWORD_RESET_STATUS.PENDING;
}

/** @param {object | null | undefined} user */
export function isPasswordResetPendingUser(user) {
  if (!user || String(user.id || '').trim().toLowerCase() === 'owner') return false;
  if (String(user.passwordResetStatus || '') === PASSWORD_RESET_STATUS.PENDING) return true;
  return passwordResetStatusFromRecord(user) === PASSWORD_RESET_STATUS.PENDING;
}

/** Owner / branch admin may see password reset notifications. */
export function canViewPasswordResetNotifications(user) {
  if (!user?.id) return false;
  const masterFn = typeof globalThis !== 'undefined' && globalThis.window?.__APG_MODULES?.authIsMasterOwnerUser;
  const branchAdminFn = typeof globalThis !== 'undefined' && globalThis.window?.__APG_MODULES?.authIsBranchAdminUser;
  if (typeof masterFn === 'function' && masterFn(user)) return true;
  if (typeof branchAdminFn === 'function' && branchAdminFn(user)) return true;
  const idKey = String(user.id || '').trim().toLowerCase();
  const roleKey = String(user.staffRole || user.role || '').trim().toLowerCase();
  return idKey === 'owner' || roleKey === 'owner' || roleKey === 'master_owner' || roleKey === 'branch_owner';
}
