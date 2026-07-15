import { Router } from 'express';
import { submitPublicVisitorIntake } from '../services/visitors/publicVisitorIntake.js';
import {
  isQrVisitorAttendanceFeatureEnabled,
  qrFeatureDisabledError,
} from '../services/qrVisitorAttendanceFeature.js';

const router = Router();

router.post('/:gymCode', async (req, res) => {
  const gymCode = String(req.params?.gymCode || '').trim();
  if (!gymCode) {
    return res.status(400).json({ error: 'gym-code-required', message: 'Gym code is required.' });
  }
  try {
    if (!(await isQrVisitorAttendanceFeatureEnabled())) {
      throw qrFeatureDisabledError();
    }
    const visitor = await submitPublicVisitorIntake(gymCode, req.body || {}, req);
    return res.status(201).json({
      ok: true,
      visitor: {
        id: visitor.id,
        fullName: visitor.fullName || visitor.name,
        mobile: visitor.mobile,
        status: visitor.status || 'New',
        intakeSource: visitor.intakeSource || 'qr_public',
      },
      message: 'Thanks — front desk will contact you.',
    });
  } catch (err) {
    const status = err?.status || 500;
    if (status === 429) {
      res.setHeader('Retry-After', String(err.retryAfterSec || 60));
    }
    return res.status(status).json({
      error: err?.code || err?.message || 'visitor-intake-failed',
      message: err?.detail || err?.message || 'Unable to save visitor.',
      retryAfterSec: err?.retryAfterSec || undefined,
    });
  }
});

export default router;
