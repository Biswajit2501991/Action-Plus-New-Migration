import { verifyStaffToken } from '../staffAuth.js';
import { readAuthToken } from '../../middleware/requireAuth.js';
import { engineCanManageStaff } from '../tenant/scopedAuthorizationEngine.js';

/**
 * Resolve JWT for password reset approve/reject routes.
 * Master owner and branch owners with staff-management rights.
 */
export function resolvePasswordResetDecisionAuth(req, res) {
  const token = readAuthToken(req);
  const claims = verifyStaffToken(token);
  if (!claims?.userId) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  const auth = {
    userId: String(claims.userId),
    roles: claims.roles || [],
    staffRole: claims.staffRole ? String(claims.staffRole) : undefined,
    permissions: claims.permissions || [],
    gymCodeId: claims.gymCodeId ? String(claims.gymCodeId) : undefined,
    activeBranchId: claims.activeBranchId
      ? String(claims.activeBranchId)
      : (claims.gymCodeId ? String(claims.gymCodeId) : undefined),
    allowedBranchIds: Array.isArray(claims.allowedBranchIds)
      ? claims.allowedBranchIds.map((id) => String(id).trim()).filter(Boolean)
      : undefined,
  };
  if (!engineCanManageStaff(auth)) {
    res.status(403).json({
      error: 'branch-admin-required',
      message: 'Password reset decisions require branch administrator privileges.',
    });
    return null;
  }
  return auth;
}
