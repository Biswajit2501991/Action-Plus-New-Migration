import { Router } from 'express';
import { env } from '../config/env.js';
import { useSupabase } from '../db/dataStore.js';
import { clientIp } from '../middleware/loginRateLimit.js';
import {
  getMemberStatusByMobile,
  normalizeMobile,
} from '../services/memberStatus/memberStatusLookup.js';

const router = Router();

const RATE_LIMIT_MAX = Math.max(10, Number(process.env.MEMBER_STATUS_RATE_LIMIT_MAX || 60));
const RATE_LIMIT_WINDOW_MS = Math.max(
  60 * 1000,
  Number(process.env.MEMBER_STATUS_RATE_LIMIT_WINDOW_MS || 60 * 1000),
);

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();

function memberStatusRateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  let entry = buckets.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    buckets.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'too-many-requests',
      message: 'Too many member status lookups. Try again shortly.',
      retryAfterSec,
    });
  }
  return next();
}

function requireMemberStatusApiKey(req, res, next) {
  const expected = String(env.MEMBER_STATUS_PUBLIC_API_KEY || '').trim();
  if (!expected) return next();
  const provided = String(
    req.headers['x-apg-member-status-key'] || req.query.apiKey || '',
  ).trim();
  if (provided !== expected) {
    return res.status(401).json({ error: 'unauthorized', message: 'Invalid or missing API key.' });
  }
  return next();
}

router.get('/', memberStatusRateLimit, requireMemberStatusApiKey, async (req, res) => {
  if (!useSupabase()) {
    return res.status(503).json({
      error: 'member-status-requires-supabase',
      message: 'Member status lookup requires DATA_BACKEND=supabase.',
    });
  }

  const mobile = String(req.query.mobile || '').trim();
  if (!mobile) {
    return res.status(400).json({ error: 'mobile-required', message: 'Query parameter mobile is required.' });
  }

  const mobileNormalized = normalizeMobile(mobile);
  if (mobileNormalized.length < 10) {
    return res.status(400).json({
      error: 'invalid-mobile',
      message: 'Mobile must contain at least 10 digits.',
    });
  }

  const gymId = String(req.query.gymId || env.APG_GYM_ID || '').trim() || null;
  if (!gymId) {
    return res.status(400).json({
      error: 'gym-id-required',
      message: 'Set APG_GYM_ID on the server or pass gymId query parameter.',
    });
  }

  try {
    const members = await getMemberStatusByMobile(mobile, gymId);
    const isActive = members.some((m) => m.isActive);

    return res.json({
      ok: true,
      mobile,
      mobileNormalized,
      gymId,
      isActive,
      members,
    });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: 'member-status-lookup-failed',
      message: String(err?.message || err),
    });
  }
});

export default router;
