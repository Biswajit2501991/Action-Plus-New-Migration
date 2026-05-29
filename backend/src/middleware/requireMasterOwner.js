import { engineCanMasterPlatformOps } from '../auth/tenant/scopedAuthorizationEngine.js';
import { logAuthorizationDenial } from '../auth/tenant/authorizationAuditService.js';
import { resolveRoleHierarchy } from '../auth/tenant/roleHierarchyResolver.js';

/** Requires prior requireApiAuth. Master Owner (global) only. */
export function requireMasterOwner(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  if (engineCanMasterPlatformOps(req.auth)) return next();
  const desc = resolveRoleHierarchy(req.auth);
  logAuthorizationDenial(req, {
    error: 'master-owner-required',
    reason: 'master-platform-op',
    roleSource: desc.roleSource,
  });
  return res.status(403).json({
    error: 'master-owner-required',
    message: 'This action is restricted to the master owner account.',
  });
}

export function requireMasterOwnerUnlessProcessControl(req, res, next) {
  if (req.auth?.userId === 'process-control') return next();
  return requireMasterOwner(req, res, next);
}
