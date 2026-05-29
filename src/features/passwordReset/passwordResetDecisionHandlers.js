import {
  isPasswordResetPendingUser,
  PASSWORD_RESET_STATUS,
} from './passwordResetStatus.js';
import {
  patchUserAfterPasswordResetApprove,
  patchUserAfterPasswordResetReject,
  patchUserAfterPasswordResetRequest,
} from './passwordResetUserPatch.js';

/**
 * Owner / branch-admin approve & reject handlers (mirrors leave approval pattern).
 */
export function createPasswordResetDecisionHandlers({
  backendJson,
  dataSyncMode,
  getUsers,
  setUsers,
  getActor,
  logEvent,
  canDecideForStaff = () => true,
  onToast,
}) {
  const toast = (msg, ms = 2400) => {
    if (typeof onToast === 'function') onToast(msg, ms);
  };

  const findStaffUser = (staffUserId) => {
    const key = String(staffUserId || '').trim().toLowerCase();
    const list = typeof getUsers === 'function' ? getUsers() : [];
    return (Array.isArray(list) ? list : []).find(
      (u) => String(u?.id || '').trim().toLowerCase() === key,
    ) || null;
  };

  const patchUserRow = (staffUserId, patchFn) => {
    const key = String(staffUserId || '').trim().toLowerCase();
    setUsers((prev) => (Array.isArray(prev) ? prev : []).map((x) => (
      String(x?.id || '').trim().toLowerCase() === key ? patchFn(x) : x
    )));
  };

  async function approvePasswordReset(staffUserId) {
    const targetId = String(staffUserId || '').trim();
    if (!targetId || targetId.toLowerCase() === 'owner') return { ok: false };

    const targetUser = findStaffUser(staffUserId);
    if (!targetUser) {
      toast('Staff account not found.', 2200);
      return { ok: false };
    }
    if (!canDecideForStaff(targetUser)) {
      toast('You cannot manage password resets for this staff member.', 2600);
      return { ok: false };
    }
    if (!isPasswordResetPendingUser(targetUser)) {
      toast('No pending reset request for this staff.', 2200);
      return { ok: false };
    }

    const nextPassword = String(
      typeof window !== 'undefined'
        ? window.prompt(`Set new password for ${targetUser.name || targetUser.id}:`) || ''
        : '',
    ).trim();
    if (!nextPassword) return { ok: false };

    if (dataSyncMode === 'backend' && typeof backendJson === 'function') {
      try {
        await backendJson('/auth/admin-set-password', {
          method: 'POST',
          body: JSON.stringify({ staffId: targetUser.id, newPassword: nextPassword }),
        });
      } catch {
        toast('Could not set password on server. Try again.', 2600);
        return { ok: false };
      }
    }

    const now = new Date().toISOString();
    const actor = typeof getActor === 'function' ? getActor() : 'owner';
    patchUserRow(targetUser.id, (x) => patchUserAfterPasswordResetApprove(x, { actor, now }));

    if (typeof logEvent === 'function') {
      logEvent('staff.password_reset.approved', 'user', targetUser.id, null, {
        staffId: targetUser.id,
        staffName: targetUser.name || '',
        approvedAt: now,
        approvedBy: actor,
      });
    }

    toast(`Password reset approved for ${targetUser.name || targetUser.id}.`);
    return { ok: true };
  }

  async function rejectPasswordReset(staffUserId) {
    const targetId = String(staffUserId || '').trim();
    if (!targetId || targetId.toLowerCase() === 'owner') return { ok: false };

    const targetUser = findStaffUser(staffUserId);
    if (!targetUser) {
      toast('Staff account not found.', 2200);
      return { ok: false };
    }
    if (!canDecideForStaff(targetUser)) {
      toast('You cannot manage password resets for this staff member.', 2600);
      return { ok: false };
    }
    if (!isPasswordResetPendingUser(targetUser)) {
      toast('No pending reset request for this staff.', 2200);
      return { ok: false };
    }

    if (
      typeof window !== 'undefined'
      && !window.confirm(`Reject password reset for ${targetUser.name || targetUser.id}? Their current password will stay unchanged.`)
    ) {
      return { ok: false };
    }

    if (dataSyncMode === 'backend' && typeof backendJson === 'function') {
      try {
        await backendJson('/auth/reject-password-reset', {
          method: 'POST',
          body: JSON.stringify({ staffId: targetUser.id }),
        });
      } catch (err) {
        toast(String(err?.message || 'Could not reject reset on server. Try again.'), 3200);
        return { ok: false };
      }
    }

    const now = new Date().toISOString();
    const actor = typeof getActor === 'function' ? getActor() : 'owner';
    patchUserRow(targetUser.id, (x) => patchUserAfterPasswordResetReject(x, { actor, now }));

    if (typeof logEvent === 'function') {
      logEvent('staff.password_reset.rejected', 'user', targetUser.id, null, {
        staffId: targetUser.id,
        staffName: targetUser.name || '',
        rejectedAt: now,
        rejectedBy: actor,
      });
    }

    toast(`Password reset rejected for ${targetUser.name || targetUser.id}.`);
    return { ok: true };
  }

  return {
    approvePasswordReset,
    rejectPasswordReset,
    patchUserAfterPasswordResetRequest,
    PASSWORD_RESET_STATUS,
  };
}
