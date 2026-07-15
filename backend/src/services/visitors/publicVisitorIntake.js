import crypto from 'node:crypto';

const RATE_IP_MAX = Math.max(3, Number(process.env.PUBLIC_VISITOR_RATE_IP_MAX || 5));
const RATE_IP_WINDOW_MS = Math.max(
  30 * 1000,
  Number(process.env.PUBLIC_VISITOR_RATE_IP_WINDOW_MS || 60 * 1000),
);
const RATE_MOBILE_MAX = Math.max(5, Number(process.env.PUBLIC_VISITOR_RATE_MOBILE_MAX || 20));
const RATE_MOBILE_WINDOW_MS = Math.max(
  60 * 60 * 1000,
  Number(process.env.PUBLIC_VISITOR_RATE_MOBILE_WINDOW_MS || 24 * 60 * 60 * 1000),
);

/** @type {Map<string, { count: number, resetAt: number }>} */
const ipBuckets = new Map();
/** @type {Map<string, { count: number, resetAt: number }>} */
const mobileBuckets = new Map();

function clientIp(req) {
  const cf = req?.headers?.['cf-connecting-ip'] || req?.headers?.['CF-Connecting-IP'];
  if (cf) return String(cf).trim();
  const xff = req?.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  const socketIp = req?.socket?.remoteAddress || '';
  if (socketIp === '::1') return '127.0.0.1';
  return socketIp || 'unknown';
}

function touchBucket(map, key, max, windowMs) {
  const now = Date.now();
  let entry = map.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    map.set(key, entry);
  }
  entry.count += 1;
  return { ok: entry.count <= max, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

export function normalizePublicMobile(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(-10);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(-10);
  return digits.slice(-10);
}

export function assertPublicVisitorPayload(body) {
  const honeypot = String(body?.website || body?.company || '').trim();
  if (honeypot) {
    const err = new Error('rejected');
    err.status = 400;
    err.code = 'bot-rejected';
    throw err;
  }

  const fullName = String(body?.fullName || body?.name || '').trim();
  if (fullName.length < 2) {
    const err = new Error('name-required');
    err.status = 400;
    err.code = 'name-required';
    err.detail = 'Name is required (at least 2 characters).';
    throw err;
  }

  const mobileNormalized = normalizePublicMobile(body?.mobile);
  if (mobileNormalized.length !== 10) {
    const err = new Error('invalid-mobile');
    err.status = 400;
    err.code = 'invalid-mobile';
    err.detail = 'Enter a valid 10-digit mobile number.';
    throw err;
  }

  const gender = String(body?.gender || '').trim();
  const email = String(body?.email || '').trim();
  const dob = String(body?.dob || '').trim().slice(0, 10);
  const notes = String(body?.notes || '').trim().slice(0, 500);

  return {
    fullName,
    mobile: mobileNormalized,
    gender: gender || null,
    email: email || '',
    dob: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : null,
    notes,
  };
}

export function enforcePublicVisitorRateLimits(req, mobileNormalized) {
  const ip = clientIp(req);
  const ipHit = touchBucket(ipBuckets, `ip:${ip}`, RATE_IP_MAX, RATE_IP_WINDOW_MS);
  if (!ipHit.ok) {
    const err = new Error('too-many-requests');
    err.status = 429;
    err.code = 'too-many-requests';
    err.retryAfterSec = ipHit.retryAfterSec;
    err.detail = 'Too many submissions from this network. Try again shortly.';
    throw err;
  }
  const mobileHit = touchBucket(
    mobileBuckets,
    `m:${mobileNormalized}`,
    RATE_MOBILE_MAX,
    RATE_MOBILE_WINDOW_MS,
  );
  if (!mobileHit.ok) {
    const err = new Error('too-many-requests');
    err.status = 429;
    err.code = 'too-many-requests';
    err.retryAfterSec = mobileHit.retryAfterSec;
    err.detail = 'Too many submissions for this mobile number today.';
    throw err;
  }
}

/**
 * @param {string} gymCode
 * @param {object} body
 * @param {import('express').Request} req
 */
export async function submitPublicVisitorIntake(gymCode, body, req) {
  const { resolveGymCodeId } = await import('../gymCodesService.js');
  const { createOrUpsertPublicVisitor } = await import('../../db/dataStore.js');

  const branchId = await resolveGymCodeId(gymCode);
  if (!branchId) {
    const err = new Error('branch-not-found');
    err.status = 404;
    err.code = 'branch-not-found';
    err.detail = 'Unknown gym / branch code.';
    throw err;
  }

  const payload = assertPublicVisitorPayload(body);
  enforcePublicVisitorRateLimits(req, payload.mobile);

  const now = new Date().toISOString();
  const visitor = {
    id: `VQR-${crypto.randomUUID().slice(0, 8)}`,
    fullName: payload.fullName,
    name: payload.fullName,
    mobile: payload.mobile,
    email: payload.email,
    dob: payload.dob || '',
    gender: payload.gender || '',
    notes: payload.notes || '',
    status: 'New',
    callBackRequired: false,
    tentativeJoiningDate: '',
    assignedGymCodeId: branchId,
    addedAt: now,
    visitDate: now,
    intakeSource: 'qr_public',
    updatedAt: now,
  };

  const saved = await createOrUpsertPublicVisitor(visitor);
  return saved;
}
