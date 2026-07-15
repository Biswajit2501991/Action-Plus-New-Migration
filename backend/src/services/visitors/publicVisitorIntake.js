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

export const PUBLIC_VISITOR_PLAN_OPTIONS = ['Basic', 'Personal Training'];
export const PUBLIC_VISITOR_GOAL_OPTIONS = [
  'Weight loss',
  'Recovering from injury or Medical condition?',
];

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

function invalidMobile(detail) {
  const err = new Error(detail || 'invalid-mobile');
  err.status = 400;
  err.code = 'invalid-mobile';
  err.detail = detail;
  return err;
}

/**
 * Accept:
 * - 10 digits
 * - 11 digits starting with 0
 * - 12 digits starting with 91
 * - 13 characters starting with +91 (e.g. +919876543210)
 * Returns normalized 10-digit mobile.
 */
export function normalizePublicMobile(raw) {
  const compact = String(raw || '').trim().replace(/[\s-]/g, '');
  if (!compact) {
    throw invalidMobile('Enter a mobile number.');
  }

  if (compact.startsWith('+')) {
    if (!/^\+91\d{10}$/.test(compact)) {
      throw invalidMobile(
        '13-character numbers must start with +91 followed by 10 digits (e.g. +919876543210).',
      );
    }
    return compact.slice(3);
  }

  if (!/^\d+$/.test(compact)) {
    throw invalidMobile('Use digits only, or +91 before a 10-digit mobile.');
  }

  if (compact.length === 10) return compact;
  if (compact.length === 11) {
    if (!compact.startsWith('0')) {
      throw invalidMobile('11-digit numbers must start with 0 (e.g. 09876543210).');
    }
    return compact.slice(1);
  }
  if (compact.length === 12) {
    if (!compact.startsWith('91')) {
      throw invalidMobile('12-digit numbers must start with 91 (e.g. 919876543210).');
    }
    return compact.slice(2);
  }
  if (compact.length === 13) {
    throw invalidMobile(
      'For 13 characters use +91 before the 10-digit mobile (e.g. +919876543210).',
    );
  }

  throw invalidMobile(
    'Mobile must be 10 digits, or 11 (0…), 12 (91…), or +91 plus 10 digits.',
  );
}

/** Soft live check while typing — empty/partial returns null; clear errors return a message. */
export function publicMobileLiveHint(raw) {
  const compact = String(raw || '').trim().replace(/[\s-]/g, '');
  if (!compact) return null;
  try {
    if (compact.startsWith('+')) {
      if (compact.length < 3) return null;
      if (!compact.startsWith('+91')) {
        return 'Numbers with + must start with +91.';
      }
      if (compact.length > 13) {
        return 'Too long — use +91 and 10 digits.';
      }
      if (compact.length === 13) {
        normalizePublicMobile(compact);
        return null;
      }
      return null;
    }
    if (!/^\d+$/.test(compact)) {
      return 'Use digits only, or start with +91.';
    }
    if (compact.length > 13) {
      return 'Too long — use 10–12 digits or +91…';
    }
    if ([10, 11, 12].includes(compact.length)) {
      normalizePublicMobile(compact);
      return null;
    }
    if (compact.length === 13) {
      return 'For 13 characters use +91 before the 10-digit mobile.';
    }
    return null;
  } catch (err) {
    return err?.detail || err?.message || 'Invalid mobile number.';
  }
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

  const interestPlan = String(body?.interestPlan || body?.plan || '').trim();
  if (!PUBLIC_VISITOR_PLAN_OPTIONS.includes(interestPlan)) {
    const err = new Error('plan-required');
    err.status = 400;
    err.code = 'plan-required';
    err.detail = 'Select a plan: Basic or Personal Training.';
    throw err;
  }

  const goal = String(body?.goal || '').trim();
  if (!PUBLIC_VISITOR_GOAL_OPTIONS.includes(goal)) {
    const err = new Error('goal-required');
    err.status = 400;
    err.code = 'goal-required';
    err.detail = 'Select a goal from the list.';
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
    interestPlan,
    goal,
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
    interestPlan: payload.interestPlan,
    goal: payload.goal,
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
