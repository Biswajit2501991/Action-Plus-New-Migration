export function isOwnerAuth(auth) {
  if (!auth?.userId) return false;
  if (String(auth.userId).toLowerCase() === 'owner') return true;
  return Array.isArray(auth.roles) && auth.roles.includes('owner');
}

/** Requires prior requireApiAuth (req.auth populated). */
export function requireOwner(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  if (!isOwnerAuth(req.auth)) {
    return res.status(403).json({
      error: 'owner-required',
      message: 'This action is restricted to the owner account.',
    });
  }
  return next();
}

/** Process supervisor token bypasses owner check. */
export function requireOwnerUnlessProcessControl(req, res, next) {
  if (req.auth?.userId === 'process-control') return next();
  return requireOwner(req, res, next);
}
