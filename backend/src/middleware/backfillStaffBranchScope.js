import { findStaffByIdentifier } from '../auth/staffAuth.js';
import { authIsOwner } from '../auth/branchFilter.js';

/**
 * Legacy JWTs may omit gymCodeId (pre gym-codes deploy). Staff bulk writes then 403
 * with branch-scope-missing even though the staff row has gym_code_id in Supabase.
 */
export async function backfillStaffBranchScope(req, res, next) {
  try {
    if (!req.auth?.userId || req.auth.gymCodeId || authIsOwner(req.auth)) return next();
    const row = await findStaffByIdentifier(req.auth.userId);
    if (row?.gym_code_id) req.auth.gymCodeId = String(row.gym_code_id);
    return next();
  } catch (error) {
    return res.status(500).json({
      error: 'branch-scope-load-failed',
      message: String(error?.message || error),
    });
  }
}
