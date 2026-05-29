import {
  engineCanListStaff,
  engineCanManageStaff,
  engineDescribeAuth,
} from '../auth/tenant/scopedAuthorizationEngine.js';
import { logAuthorizationDenial } from '../auth/tenant/authorizationAuditService.js';

/** Master Owner or Branch Owner — list staff (scoped by filterUsersForAuth). */
export function requireStaffManagementRead(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  if (engineCanListStaff(req.auth)) return next();
  const desc = engineDescribeAuth(req.auth);
  logAuthorizationDenial(req, {
    error: 'branch-admin-required',
    reason: 'staff-list-forbidden',
    roleSource: desc.roleSource,
  });
  return res.status(403).json({
    error: 'branch-admin-required',
    message: 'This action requires branch administrator privileges.',
  });
}

/** Master Owner or Branch Owner — create/edit/delete staff within scope. */
export function requireStaffManagementWrite(req, res, next) {
  if (!req.auth?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Login required.' });
  }
  if (engineCanManageStaff(req.auth)) return next();
  const desc = engineDescribeAuth(req.auth);
  logAuthorizationDenial(req, {
    error: 'branch-admin-required',
    reason: 'staff-write-forbidden',
    roleSource: desc.roleSource,
  });
  return res.status(403).json({
    error: 'branch-admin-required',
    message: 'This action requires branch administrator privileges.',
  });
}
