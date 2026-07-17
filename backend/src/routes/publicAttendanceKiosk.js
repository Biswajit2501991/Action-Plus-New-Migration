import { Router } from 'express';
import { loginRateLimit, recordFailedLogin, clearLoginFailures } from '../middleware/loginRateLimit.js';
import {
  buildPublicChallenge,
  punchViaPin,
} from '../services/attendanceKiosk/attendanceKioskService.js';
import { renderAttendanceKioskHtml } from '../services/attendanceKiosk/attendanceKioskView.js';

const router = Router();

function deviceFromReq(req) {
  return String(
    req.query?.device
      || req.query?.token
      || req.headers['x-apg-kiosk-device']
      || req.body?.deviceToken
      || '',
  ).trim();
}

router.get('/pin-punch', (_req, res) => {
  res.status(405).json({ error: 'method-not-allowed', message: 'Use POST /api/public/attendance-kiosk/pin-punch' });
});

router.post('/pin-punch', loginRateLimit, async (req, res) => {
  try {
    const result = await punchViaPin({
      identifier: req.body?.identifier || req.body?.id,
      password: req.body?.password || req.body?.pin,
      qrPayload: req.body?.qrPayload,
      code: req.body?.code,
      branchId: req.body?.branchId || req.body?.gymCode,
      type: req.body?.type || 'login',
      atIso: req.body?.at,
      timeZone: req.body?.timeZone,
    });
    clearLoginFailures(req);
    return res.json(result);
  } catch (error) {
    const status = error?.status || 500;
    if (status === 401 || status === 403) recordFailedLogin(req);
    return res.status(status).json({
      error: error?.message || 'pin-punch-failed',
      message: String(error?.message || error),
    });
  }
});

router.get('/:gymCode/challenge', async (req, res) => {
  try {
    const data = await buildPublicChallenge({
      gymCode: req.params.gymCode,
      deviceToken: deviceFromReq(req),
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.json(data);
  } catch (error) {
    const status = error?.status || 500;
    return res.status(status).json({
      error: error?.message || 'challenge-failed',
      message: String(error?.message || error),
    });
  }
});

router.get('/:gymCode/view', async (req, res) => {
  const gymCode = String(req.params?.gymCode || '').trim();
  const deviceToken = deviceFromReq(req);
  if (!gymCode) return res.status(400).send('Gym code is required.');
  try {
    // Validate device before rendering so wall screens fail closed.
    let branchName = '';
    if (deviceToken) {
      const challenge = await buildPublicChallenge({ gymCode, deviceToken });
      branchName = challenge.branchName || '';
    }
    const html = renderAttendanceKioskHtml({
      gymCode,
      branchName,
      deviceToken,
      apiBase: '/api/public/attendance-kiosk',
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (error) {
    const status = error?.status || 500;
    if (status === 401) return res.status(401).send('Invalid or missing kiosk device token.');
    if (status === 404) return res.status(404).send('Branch not found.');
    return res.status(status).send(String(error?.message || 'Unable to load attendance kiosk.'));
  }
});

router.get('/:gymCode', (req, res) => {
  const q = new URLSearchParams(req.query || {}).toString();
  const suffix = q ? `?${q}` : '';
  return res.redirect(302, `/api/public/attendance-kiosk/${encodeURIComponent(req.params.gymCode)}/view${suffix}`);
});

export default router;
