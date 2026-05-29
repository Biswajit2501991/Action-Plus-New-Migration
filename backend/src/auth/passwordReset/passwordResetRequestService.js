import { T } from '../../db/tables.js';
import { getSupabase } from '../../db/supabase/client.js';
import { staffRowToApp } from '../../db/supabase/mappers.js';
import {
  findStaffByIdentifier,
  getStaffAppUser,
  setStaffPassword,
} from '../staffAuth.js';
import {
  assertActorCanDecideForStaff,
  isPasswordResetPendingRow,
  validatePendingDecision,
} from './passwordResetDecisionEngine.js';
import { logPasswordResetAudit } from './passwordResetAuditService.js';
import { PASSWORD_RESET_STATUS } from '../../../../src/features/passwordReset/passwordResetStatus.js';

export async function requestStaffPasswordResetWithAudit(identifier) {
  const row = await findStaffByIdentifier(identifier);
  if (!row) return { ok: true, skipped: true };
  if (String(row.staff_login_id || '').toLowerCase() === 'owner') return { ok: true, skipped: true };
  if (row.is_blocked) return { ok: true, skipped: true };

  const sb = getSupabase();
  const now = new Date().toISOString();
  const { error } = await sb
    .from(T.staff_users)
    .update({
      password_reset_requested_at: now,
      password_reset_approved_at: null,
      updated_at: now,
    })
    .eq('id', row.id);
  if (error) throw error;

  const user = staffRowToApp(row);
  await logPasswordResetAudit({
    action: 'staff.password_reset.requested',
    actorId: String(row.staff_login_id || identifier).trim(),
    staffId: user.id,
    staffName: user.name || user.id,
    meta: {
      requestedByLogin: String(identifier || '').trim(),
      requestedAt: now,
    },
  }).catch(() => {});

  return { ok: true, staffId: user.id, requestedAt: now };
}

export async function approveStaffPasswordReset(auth, staffLoginId, newPassword) {
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) {
    const err = new Error('staff-not-found');
    err.status = 404;
    throw err;
  }
  const targetUser = await getStaffAppUser(staffLoginId);
  if (!targetUser) {
    const err = new Error('staff-not-found');
    err.status = 404;
    throw err;
  }
  assertActorCanDecideForStaff(auth, targetUser);

  const gate = validatePendingDecision(row, PASSWORD_RESET_STATUS.APPROVED);
  if (!gate.ok) {
    const err = new Error(gate.error);
    err.status = 409;
    throw err;
  }
  if (gate.alreadyProcessed) {
    return { ok: true, staffId: targetUser.id, alreadyProcessed: true, status: gate.status };
  }

  const now = new Date().toISOString();
  await setStaffPassword(staffLoginId, newPassword, { clearPasswordReset: true });

  const sb = getSupabase();
  await sb
    .from(T.staff_users)
    .update({
      password_reset_rejected_at: null,
      password_reset_rejected_by: null,
      updated_at: now,
    })
    .eq('id', row.id);

  await logPasswordResetAudit({
    action: 'staff.password_reset.approved',
    actorId: auth.userId,
    staffId: targetUser.id,
    staffName: targetUser.name || targetUser.id,
    meta: { approvedAt: now, approvedBy: auth.userId },
  }).catch(() => {});

  return { ok: true, staffId: targetUser.id, status: PASSWORD_RESET_STATUS.APPROVED };
}

export async function rejectStaffPasswordReset(auth, staffLoginId) {
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) {
    const err = new Error('staff-not-found');
    err.status = 404;
    throw err;
  }
  const targetUser = await getStaffAppUser(staffLoginId);
  if (!targetUser) {
    const err = new Error('staff-not-found');
    err.status = 404;
    throw err;
  }
  assertActorCanDecideForStaff(auth, targetUser);

  const gate = validatePendingDecision(row, PASSWORD_RESET_STATUS.REJECTED);
  if (!gate.ok) {
    const err = new Error(gate.error);
    err.status = 409;
    throw err;
  }
  if (gate.alreadyProcessed) {
    return { ok: true, staffId: targetUser.id, alreadyProcessed: true, status: gate.status };
  }
  if (!isPasswordResetPendingRow(row)) {
    const err = new Error('reset-not-pending');
    err.status = 409;
    throw err;
  }

  const sb = getSupabase();
  const now = new Date().toISOString();
  const actor = String(auth.userId || 'owner').trim();
  let updateError = null;
  {
    const { error } = await sb
      .from(T.staff_users)
      .update({
        password_reset_requested_at: null,
        password_reset_rejected_at: now,
        password_reset_rejected_by: actor,
        updated_at: now,
      })
      .eq('id', row.id);
    updateError = error;
  }
  if (updateError) {
    const msg = String(updateError.message || updateError);
    if (/password_reset_rejected/i.test(msg)) {
      const { error: fallbackErr } = await sb
        .from(T.staff_users)
        .update({
          password_reset_requested_at: null,
          updated_at: now,
        })
        .eq('id', row.id);
      if (fallbackErr) throw fallbackErr;
    } else {
      throw updateError;
    }
  }

  await logPasswordResetAudit({
    action: 'staff.password_reset.rejected',
    actorId: actor,
    staffId: targetUser.id,
    staffName: targetUser.name || targetUser.id,
    meta: { rejectedAt: now, rejectedBy: actor },
  }).catch(() => {});

  return { ok: true, staffId: targetUser.id, status: PASSWORD_RESET_STATUS.REJECTED };
}
