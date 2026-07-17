import { Router } from 'express';
import { requireMasterOwner } from '../middleware/requireMasterOwner.js';
import { requireAccess } from '../middleware/permissions.js';
import { Access } from '../auth/accessControl.js';
import {
  createKioskDevice,
  listKioskDevices,
  revokeKioskDevice,
  punchViaQrScan,
  resolveAttendanceBranchId,
} from '../services/attendanceKiosk/attendanceKioskService.js';
import { resolveGymCodeId } from '../services/gymCodesService.js';
import { useSupabase } from '../db/dataStore.js';

const router = Router();

router.get('/devices', requireMasterOwner, async (req, res) => {
  try {
    let branchId = String(req.query?.gymCodeId || req.query?.branchId || '').trim();
    if (branchId && useSupabase()) {
      branchId = (await resolveGymCodeId(branchId)) || branchId;
    }
    const devices = listKioskDevices(branchId || undefined);
    return res.json({ ok: true, devices });
  } catch (error) {
    return res.status(500).json({ error: 'list-failed', message: String(error?.message || error) });
  }
});

router.post('/devices', requireMasterOwner, async (req, res) => {
  try {
    let branchId = String(req.body?.gymCodeId || req.body?.branchId || '').trim();
    if (!branchId) return res.status(400).json({ error: 'branch-required' });
    if (useSupabase()) {
      const resolved = await resolveAttendanceBranchId(branchId);
      if (!resolved) return res.status(404).json({ error: 'branch-not-found' });
      branchId = resolved;
    }
    const created = createKioskDevice({
      branchId,
      label: req.body?.label || 'Reception Kiosk',
    });
    let gymCodeForUrl = String(req.body?.gymCode || req.body?.code || '').trim();
    if (!gymCodeForUrl && useSupabase()) {
      try {
        const { getSupabase, gymId } = await import('../db/supabase/client.js');
        const { T } = await import('../db/tables.js');
        const { data } = await getSupabase()
          .from(T.gym_codes)
          .select('code')
          .eq('gym_id', gymId())
          .eq('id', branchId)
          .maybeSingle();
        gymCodeForUrl = data?.code || branchId;
      } catch {
        gymCodeForUrl = branchId;
      }
    }
    if (!gymCodeForUrl) gymCodeForUrl = branchId;
    return res.status(201).json({
      ok: true,
      device: created.device,
      token: created.token,
      kioskUrl: `/api/public/attendance-kiosk/${encodeURIComponent(gymCodeForUrl)}/view?device=${encodeURIComponent(created.token)}`,
      hint: 'Copy the token now — it is shown only once. Open kioskUrl on the wall tablet.',
    });
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({ error: error?.message || 'create-failed', message: String(error?.message || error) });
  }
});

router.delete('/devices/:id', requireMasterOwner, async (req, res) => {
  try {
    const ok = revokeKioskDevice(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not-found' });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'revoke-failed', message: String(error?.message || error) });
  }
});

/** Authenticated staff: scan QR payload from phone while logged into the app. */
router.post('/qr-scan', requireAccess(Access.attendancePunch), async (req, res) => {
  try {
    const result = await punchViaQrScan({
      auth: req.auth,
      qrPayload: req.body?.qrPayload || req.body?.payload,
      code: req.body?.code,
      branchId: req.body?.branchId || req.body?.gymCodeId,
      type: req.body?.type || 'login',
      atIso: req.body?.at,
      timeZone: req.body?.timeZone,
    });
    return res.json(result);
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({
      error: error?.message || 'qr-scan-failed',
      message: String(error?.message || error),
    });
  }
});

export default router;
