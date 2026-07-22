import { Router } from 'express';
import { requireMasterOwner } from '../middleware/requireMasterOwner.js';
import { resolveActiveBranchId } from '../auth/tenant/scopedAuth.js';
import { createAttendanceKioskDevice } from '../services/attendance/kioskDevices.js';

const router = Router();

/**
 * POST /api/attendance-kiosk/devices
 * Owner creates a wall-tablet device token (no staff session needed on the tablet).
 */
router.post('/devices', requireMasterOwner, async (req, res) => {
  try {
    let gymCodeId = String(req.body?.gymCodeId || resolveActiveBranchId(req.auth) || '').trim();
    let gymCode = String(req.body?.gymCode || '').trim();

    if (!gymCodeId) {
      try {
        const { listGymCodes } = await import('../services/gymCodesService.js');
        const codes = await listGymCodes();
        gymCodeId = String(codes?.[0]?.id || '').trim();
        if (!gymCode) gymCode = String(codes?.[0]?.code || '').trim();
      } catch {
        /* ignore */
      }
    }

    if (!gymCode && gymCodeId) {
      try {
        const { listGymCodes } = await import('../services/gymCodesService.js');
        const codes = await listGymCodes();
        const hit = (codes || []).find((c) => String(c.id) === gymCodeId);
        gymCode = String(hit?.code || '').trim();
      } catch {
        /* ignore */
      }
    }

    if (!gymCodeId) {
      return res.status(400).json({
        error: 'gym-code-id-required',
        message: 'Select a branch first, then open the punch QR kiosk.',
      });
    }

    const created = await createAttendanceKioskDevice({
      gymCodeId,
      gymCode,
      label: req.body?.label || 'Reception Kiosk',
      createdBy: req.auth?.name || req.auth?.userId || null,
    });

    return res.json({
      ok: true,
      token: created.token,
      kioskUrl: created.kioskUrl,
      device: created.device,
      hint: 'Open this URL on a wall tablet. It keeps rotating the punch QR without staff login.',
    });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.code || err?.message || 'kiosk-device-create-failed',
      message: err?.detail || err?.message || 'Could not create kiosk device.',
    });
  }
});

export default router;
