import { Router } from 'express';
import { redeemAttendancePresenceToken } from '../services/attendance/presenceTokens.js';
import { clientIp } from '../middleware/loginRateLimit.js';
import {
  isQrVisitorAttendanceFeatureEnabled,
  qrFeatureDisabledError,
} from '../services/qrVisitorAttendanceFeature.js';

const router = Router();

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();
const MAX = 30;
const WINDOW_MS = 60 * 1000;

function rateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  let entry = buckets.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count > MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'too-many-requests',
      message: 'Too many QR redeem attempts. Try again shortly.',
      retryAfterSec,
    });
  }
  return next();
}

router.post('/redeem', rateLimit, async (req, res) => {
  try {
    if (!(await isQrVisitorAttendanceFeatureEnabled())) {
      throw qrFeatureDisabledError();
    }
    const token = String(req.body?.token || req.query?.token || '').trim();
    const result = redeemAttendancePresenceToken(token);
    return res.json({ ok: true, ...result });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.code || err?.message || 'redeem-failed',
      message: err?.detail || err?.message || 'Unable to redeem attendance QR.',
    });
  }
});

export default router;
