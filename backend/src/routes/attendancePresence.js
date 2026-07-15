import { Router } from 'express';
import { Access } from '../auth/accessControl.js';
import { requireAccess } from '../middleware/permissions.js';
import { authIsBranchAdmin, authHasGlobalBranchRead, resolveActiveBranchId } from '../auth/tenant/scopedAuth.js';
import { rotateAttendancePresenceToken } from '../services/attendance/presenceTokens.js';
import { readJsonValue, writeJsonValue } from '../db/dataStore.js';
import {
  isAttendancePresenceQrFeatureEnabled,
  qrAttendanceFeatureDisabledError,
} from '../services/qrVisitorAttendanceFeature.js';

const router = Router();

router.post('/rotate', requireAccess(Access.attendancePunch), async (req, res) => {
  try {
    if (!(await isAttendancePresenceQrFeatureEnabled())) {
      throw qrAttendanceFeatureDisabledError();
    }
    const branchId = String(
      req.body?.gymCodeId || resolveActiveBranchId(req.auth) || req.auth?.gymCodeId || '',
    ).trim();
    if (!branchId) {
      return res.status(400).json({ error: 'gym-code-id-required', message: 'Active branch required.' });
    }
    if (
      !authIsBranchAdmin(req.auth) &&
      !authHasGlobalBranchRead(req.auth) &&
      String(req.auth?.gymCodeId || '') !== branchId &&
      !(Array.isArray(req.auth?.allowedBranchIds) && req.auth.allowedBranchIds.includes(branchId))
    ) {
      return res.status(403).json({ error: 'forbidden', message: 'Branch not allowed.' });
    }
    const rotated = rotateAttendancePresenceToken(branchId);
    return res.json({ ok: true, ...rotated });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.code || err?.message || 'presence-rotate-failed',
      message: err?.detail || err?.message || 'Unable to rotate attendance QR.',
    });
  }
});

router.get('/settings', requireAccess(Access.attendancePunch), async (req, res) => {
  try {
    const settings = (await readJsonValue('apg.settings', {}, null)) || {};
    return res.json({
      ok: true,
      qrVisitorIntakeEnabled:
        settings.qrVisitorIntakeEnabled === true || settings.qrVisitorAttendanceEnabled === true,
      attendanceRequirePresenceQr: settings.attendanceRequirePresenceQr === true,
    });
  } catch (err) {
    return res.status(500).json({ error: 'settings-read-failed', message: String(err?.message || err) });
  }
});

router.put('/settings', requireAccess(Access.attendancePunch), async (req, res) => {
  try {
    if (!authIsBranchAdmin(req.auth) && !authHasGlobalBranchRead(req.auth)) {
      return res.status(403).json({ error: 'forbidden', message: 'Only owners can change this setting.' });
    }
    const settings = (await readJsonValue('apg.settings', {}, null)) || {};
    const next = { ...settings };
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'qrVisitorIntakeEnabled')) {
      next.qrVisitorIntakeEnabled = req.body.qrVisitorIntakeEnabled === true;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'attendanceRequirePresenceQr')) {
      next.attendanceRequirePresenceQr = req.body.attendanceRequirePresenceQr === true;
    }
    await writeJsonValue('apg.settings', next, null);
    return res.json({
      ok: true,
      qrVisitorIntakeEnabled: next.qrVisitorIntakeEnabled === true,
      attendanceRequirePresenceQr: next.attendanceRequirePresenceQr === true,
    });
  } catch (err) {
    return res.status(500).json({ error: 'settings-write-failed', message: String(err?.message || err) });
  }
});

export default router;
