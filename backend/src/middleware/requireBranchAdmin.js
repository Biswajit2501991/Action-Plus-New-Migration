import { authIsBranchAdmin, authIsMasterOwner } from '../auth/tenant/scopedAuth.js';

/** Master Owner or Branch Owner (when feature enabled). */
export function requireBranchAdmin(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  if (!authIsBranchAdmin(req.auth)) {
    return res.status(403).json({
      error: 'branch-admin-required',
      message: 'This action requires branch administrator privileges.',
    });
  }
  return next();
}

/** Branch-scoped staff management: branch admin only; master always allowed. */
export function requireBranchAdminNotPromotingMaster(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  if (authIsMasterOwner(req.auth)) return next();
  if (!authIsBranchAdmin(req.auth)) {
    return res.status(403).json({
      error: 'branch-admin-required',
      message: 'This action requires branch administrator privileges.',
    });
  }
  return next();
}
