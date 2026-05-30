import { Access, getStaffAccessForUser, isAccessAllowed } from '../auth/accessControl.js';
import { isOwnerAuth } from './requireOwner.js';

/**
 * @param {(access: import('../auth/accessControl.js').NormalizedAccess) => boolean} checkFn
 */
export function requireAccess(checkFn) {
  return async (req, res, next) => {
    try {
      if (!req.auth?.userId) {
        return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
      }
      if (isOwnerAuth(req.auth)) {
        return next();
      }

      if (!req.staffAccess) {
        req.staffAccess = await getStaffAccessForUser(req.auth.userId);
      }
      if (!req.staffAccess) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Account not found or blocked.',
        });
      }

      if (!isAccessAllowed(req.staffAccess, checkFn)) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'You do not have permission for this action.',
        });
      }
      return next();
    } catch (error) {
      return res.status(500).json({
        error: 'permission-check-failed',
        message: String(error?.message || error),
      });
    }
  };
}

/** Logs bulk PUT: clearing all rows needs clearLogs; otherwise viewLogs is enough to append. */
export function requireLogsBulkAccess(req, res, next) {
  const logs = req.body?.logs;
  const isClear = Array.isArray(logs) && logs.length === 0;
  return requireAccess(isClear ? Access.logsClear : Access.logsWrite)(req, res, next);
}

/** @deprecated JWT permission codes — use requireAccess(Access.*) instead. */
export function requirePermission(code) {
  return (req, res, next) => {
    const perms = req.auth?.permissions || [];
    if (perms.includes('*') || perms.includes(code)) return next();
    return res.status(403).json({ error: 'forbidden', code });
  };
}
