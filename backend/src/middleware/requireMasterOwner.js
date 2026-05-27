import { authIsMasterOwner } from '../auth/tenant/scopedAuth.js';

/** Requires prior requireApiAuth. Master Owner (global) only. */
export function requireMasterOwner(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  if (!authIsMasterOwner(req.auth)) {
    return res.status(403).json({
      error: 'master-owner-required',
      message: 'This action is restricted to the master owner account.',
    });
  }
  return next();
}

export function requireMasterOwnerUnlessProcessControl(req, res, next) {
  if (req.auth?.userId === 'process-control') return next();
  return requireMasterOwner(req, res, next);
}
