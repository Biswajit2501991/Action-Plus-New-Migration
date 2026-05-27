import { findStaffByIdentifier } from '../auth/staffAuth.js';
import { authHasGlobalBranchRead } from '../auth/branchFilter.js';
import { resolveStaffBranchContext } from '../auth/tenant/branchAssignments.js';
import { branchOwnerFeatureEnabled } from '../auth/tenant/scopedAuth.js';

/**
 * Keep req.auth branch claims aligned with DB on every request.
 */
export async function syncStaffBranchScope(req, res, next) {
  try {
    if (!req.auth?.userId || authHasGlobalBranchRead(req.auth)) return next();
    const row = await findStaffByIdentifier(req.auth.userId);
    if (!row) return next();
    if (branchOwnerFeatureEnabled()) {
      const ctx = await resolveStaffBranchContext(row);
      req.auth.staffRole = ctx.staffRole;
      if (ctx.allowedBranchIds.length) {
        req.auth.allowedBranchIds = ctx.allowedBranchIds;
        const active = String(req.auth.activeBranchId || req.auth.gymCodeId || '').trim();
        const pick = active && ctx.allowedBranchIds.includes(active)
          ? active
          : ctx.primaryBranchId;
        if (pick) {
          req.auth.gymCodeId = pick;
          req.auth.activeBranchId = pick;
        }
      } else if (row.gym_code_id) {
        req.auth.gymCodeId = String(row.gym_code_id);
        req.auth.activeBranchId = String(row.gym_code_id);
      } else {
        delete req.auth.gymCodeId;
        delete req.auth.activeBranchId;
      }
      return next();
    }
    if (row?.gym_code_id) {
      req.auth.gymCodeId = String(row.gym_code_id);
      req.auth.activeBranchId = String(row.gym_code_id);
    } else {
      delete req.auth.gymCodeId;
      delete req.auth.activeBranchId;
    }
    return next();
  } catch (error) {
    return res.status(500).json({
      error: 'branch-scope-load-failed',
      message: String(error?.message || error),
    });
  }
}
