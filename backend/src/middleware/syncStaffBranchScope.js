import { findStaffByIdentifier } from '../auth/staffAuth.js';
import { authIsOwner } from '../auth/branchFilter.js';

/**
 * Keep req.auth.gymCodeId aligned with staff_users.gym_code_id on every request.
 * Fixes: owner reassigned branch while JWT still has old/missing gymCodeId →
 * branch-scope-missing on writes or unfiltered member reads.
 */
export async function syncStaffBranchScope(req, res, next) {
  try {
    if (!req.auth?.userId || authIsOwner(req.auth)) return next();
    const row = await findStaffByIdentifier(req.auth.userId);
    if (row?.gym_code_id) {
      req.auth.gymCodeId = String(row.gym_code_id);
    } else {
      delete req.auth.gymCodeId;
    }
    return next();
  } catch (error) {
    return res.status(500).json({
      error: 'branch-scope-load-failed',
      message: String(error?.message || error),
    });
  }
}
