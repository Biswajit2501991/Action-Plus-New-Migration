import { verifyStaffToken, resolveAuthBranchProfile } from '../staffAuth.js';
import { readAuthToken } from '../../middleware/requireAuth.js';
import { engineCanManageStaff } from '../tenant/scopedAuthorizationEngine.js';
import { STAFF_ROLES, normalizeStaffRole } from '../tenant/roles.js';

function rolesFromDbStaffRole(staffRole, userId) {
  const login = String(userId || '').trim().toLowerCase();
  const normalized = normalizeStaffRole(staffRole, userId);
  if (login === 'owner' || normalized === STAFF_ROLES.MASTER_OWNER) return ['owner'];
  if (normalized === STAFF_ROLES.BRANCH_OWNER) return ['branch_owner'];
  return ['staff'];
}

/**
 * Build request auth from DB-backed branch profile (V-004 — do not trust stale JWT role/branch claims).
 * @param {object} claims Verified JWT claims
 * @param {Awaited<ReturnType<typeof resolveAuthBranchProfile>>} profile
 */
export function buildPasswordResetDecisionAuth(claims, profile) {
  const userId = String(claims.userId || profile.user?.id || '').trim();
  const staffRole = normalizeStaffRole(
    profile.tokenCtx?.staffRole || profile.user?.staffRole,
    userId,
  );
  const allowedBranchIds = Array.isArray(profile.allowedBranchIds)
    ? profile.allowedBranchIds.map((id) => String(id).trim()).filter(Boolean)
    : undefined;
  const activeBranchId = String(profile.activeBranchId || profile.gymCodeId || '').trim() || undefined;

  return {
    userId,
    staffRole,
    roles: rolesFromDbStaffRole(staffRole, userId),
    permissions: [],
    gymCodeId: activeBranchId,
    activeBranchId,
    allowedBranchIds,
    claimsStale: Boolean(profile.claimsStale),
  };
}

/**
 * Resolve auth for password reset approve/reject routes with fresh DB role/branch scope.
 */
export async function resolvePasswordResetDecisionAuth(req, res) {
  const token = readAuthToken(req);
  const claims = verifyStaffToken(token);
  if (!claims?.userId) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }

  let profile;
  try {
    profile = await resolveAuthBranchProfile(claims.userId, claims);
  } catch (error) {
    res.status(500).json({
      error: 'auth-refresh-failed',
      message: String(error?.message || error),
    });
    return null;
  }

  if (!profile.user) {
    res.status(401).json({ error: 'invalid-token' });
    return null;
  }
  if (profile.user.blocked) {
    res.status(403).json({ error: 'user-blocked' });
    return null;
  }

  const auth = buildPasswordResetDecisionAuth(claims, profile);
  if (!engineCanManageStaff(auth)) {
    res.status(403).json({
      error: 'branch-admin-required',
      message: 'Password reset decisions require branch administrator privileges.',
    });
    return null;
  }
  return auth;
}
