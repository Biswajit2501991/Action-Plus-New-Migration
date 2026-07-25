import { T } from '../tables.js';

/** Strip rejection columns when Supabase schema cache lacks migration. */
export function omitPasswordResetRejectionColumns(patch) {
  if (!patch || typeof patch !== 'object') return patch;
  const next = { ...patch };
  delete next.password_reset_rejected_at;
  delete next.password_reset_rejected_by;
  return next;
}

export function isPasswordResetRejectionColumnError(error) {
  return /password_reset_rejected/i.test(String(error?.message || error));
}

export function omitPasswordPlainLegacyColumn(patch) {
  if (!patch || typeof patch !== 'object') return patch;
  const next = { ...patch };
  delete next.password_plain_legacy;
  return next;
}

export function isPasswordPlainLegacyColumnError(error) {
  return /password_plain_legacy/i.test(String(error?.message || error));
}

/**
 * Update staff_users by primary key.
 * Retries without optional columns when schema cache lacks migrations.
 */
export async function updateStaffUserRow(sb, staffPk, patch) {
  const { error } = await sb.from(T.staff_users).update(patch).eq('id', staffPk);
  if (!error) return;
  let next = patch;
  if (isPasswordResetRejectionColumnError(error)) {
    next = omitPasswordResetRejectionColumns(next);
  }
  if (isPasswordPlainLegacyColumnError(error)) {
    next = omitPasswordPlainLegacyColumn(next);
  }
  if (next === patch) throw error;
  const { error: retryErr } = await sb.from(T.staff_users).update(next).eq('id', staffPk);
  if (!retryErr) return;
  if (isPasswordResetRejectionColumnError(retryErr) || isPasswordPlainLegacyColumnError(retryErr)) {
    const stripped = omitPasswordPlainLegacyColumn(omitPasswordResetRejectionColumns(next));
    const { error: finalErr } = await sb.from(T.staff_users).update(stripped).eq('id', staffPk);
    if (finalErr) throw finalErr;
    return;
  }
  throw retryErr;
}
