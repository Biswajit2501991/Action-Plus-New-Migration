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

/**
 * Update staff_users by primary key.
 * Retries without password_reset_rejected_* when those columns are not migrated yet.
 */
export async function updateStaffUserRow(sb, staffPk, patch) {
  const { error } = await sb.from(T.staff_users).update(patch).eq('id', staffPk);
  if (!error) return;
  if (isPasswordResetRejectionColumnError(error)) {
    const { error: retryErr } = await sb
      .from(T.staff_users)
      .update(omitPasswordResetRejectionColumns(patch))
      .eq('id', staffPk);
    if (retryErr) throw retryErr;
    return;
  }
  throw error;
}
