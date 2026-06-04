import { engineCanMasterPlatformOps } from '../auth/tenant/scopedAuthorizationEngine.js';
import { authIsBranchOwner, authIsMasterOwner } from '../auth/tenant/scopedAuth.js';
import { logAuthorizationDenial } from '../auth/tenant/authorizationAuditService.js';
import { resolveRoleHierarchy } from '../auth/tenant/roleHierarchyResolver.js';
import { isOwnerAuth } from './requireOwner.js';

/** Permanent member delete: master owner, branch owner, or legacy owner — never staff. */
export function requireMemberPermanentDelete(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  if (
    engineCanMasterPlatformOps(req.auth)
    || authIsMasterOwner(req.auth)
    || authIsBranchOwner(req.auth)
    || isOwnerAuth(req.auth)
  ) {
    return next();
  }
  const desc = resolveRoleHierarchy(req.auth);
  logAuthorizationDenial(req, {
    error: 'member-delete-forbidden',
    reason: 'owner-or-branch-owner-required',
    roleSource: desc.roleSource,
  });
  return res.status(403).json({
    error: 'member-delete-forbidden',
    message: 'Permanent member delete is restricted to owners.',
  });
}
