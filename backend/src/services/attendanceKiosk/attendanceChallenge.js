/**
 * Rotating attendance QR challenge (HMAC) with offline grace window.
 * Stateless — kiosk and API share the same secret + branch id.
 */

import crypto from 'node:crypto';

export const ATTENDANCE_QR_ROTATION_MS = 60_000;
export const ATTENDANCE_QR_GRACE_MS = 90_000;
export const ATTENDANCE_QR_CODE_LEN = 12;
export const ATTENDANCE_QR_PREFIX = 'APG1';

function base64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function attendanceKioskSecret(baseSecret) {
  const raw = String(baseSecret || 'change-me');
  return crypto.createHash('sha256').update(`${raw}:attendance-kiosk-v1`).digest();
}

export function windowIndexAt(nowMs = Date.now(), rotationMs = ATTENDANCE_QR_ROTATION_MS) {
  return Math.floor(Number(nowMs) / Number(rotationMs));
}

export function buildChallengeCode({
  secret,
  gymId,
  branchId,
  windowIndex,
  codeLen = ATTENDANCE_QR_CODE_LEN,
}) {
  const key = Buffer.isBuffer(secret) ? secret : attendanceKioskSecret(secret);
  const payload = `${String(gymId || '')}|${String(branchId || '').trim()}|${Number(windowIndex)}`;
  const mac = crypto.createHmac('sha256', key).update(payload).digest();
  return base64Url(mac).slice(0, codeLen);
}

export function getCurrentChallenge({
  secret,
  gymId,
  branchId,
  branchCode = '',
  nowMs = Date.now(),
  rotationMs = ATTENDANCE_QR_ROTATION_MS,
  codeLen = ATTENDANCE_QR_CODE_LEN,
}) {
  const w = windowIndexAt(nowMs, rotationMs);
  const windowStart = w * rotationMs;
  const expiresAt = windowStart + rotationMs;
  const code = buildChallengeCode({ secret, gymId, branchId, windowIndex: w, codeLen });
  const refreshInMs = Math.max(0, expiresAt - nowMs);
  const branchKey = String(branchCode || branchId || '').trim();
  const qrPayload = encodeQrPayload({
    branchKey,
    branchId: String(branchId || '').trim(),
    code,
    expiresAt,
  });
  return {
    code,
    windowIndex: w,
    issuedAt: windowStart,
    expiresAt,
    refreshInMs,
    rotationMs,
    graceMs: ATTENDANCE_QR_GRACE_MS,
    qrPayload,
    branchId: String(branchId || '').trim(),
    branchCode: String(branchCode || '').trim(),
  };
}

/**
 * Accept current window always; accept previous window within GRACE after it ended.
 */
export function validateChallengeCode({
  secret,
  gymId,
  branchId,
  code,
  nowMs = Date.now(),
  rotationMs = ATTENDANCE_QR_ROTATION_MS,
  graceMs = ATTENDANCE_QR_GRACE_MS,
  codeLen = ATTENDANCE_QR_CODE_LEN,
}) {
  const raw = String(code || '').trim();
  if (!raw) return { ok: false, reason: 'code-required' };
  const bid = String(branchId || '').trim();
  if (!bid) return { ok: false, reason: 'branch-required' };

  const w = windowIndexAt(nowMs, rotationMs);
  const candidates = [
    { windowIndex: w, graceUsed: false },
    { windowIndex: w - 1, graceUsed: true },
  ];

  for (const c of candidates) {
    if (c.windowIndex < 0) continue;
    if (c.graceUsed) {
      const prevEnd = (c.windowIndex + 1) * rotationMs;
      if (nowMs > prevEnd + graceMs) continue;
    }
    const expected = buildChallengeCode({
      secret,
      gymId,
      branchId: bid,
      windowIndex: c.windowIndex,
      codeLen,
    });
    if (timingSafeEqualString(raw, expected)) {
      return { ok: true, windowIndex: c.windowIndex, graceUsed: c.graceUsed };
    }
  }
  return { ok: false, reason: 'invalid-or-expired-code' };
}

export function encodeQrPayload({ branchKey, branchId, code, expiresAt }) {
  const key = String(branchKey || branchId || '').trim();
  const c = String(code || '').trim();
  const exp = Number(expiresAt) || 0;
  return `${ATTENDANCE_QR_PREFIX}|${key}|${c}|${exp}`;
}

export function parseQrPayload(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  // Also accept deep-link style: apg-att://v1/BRANCH/CODE
  const deep = /^apg-att:\/\/v1\/([^/]+)\/([A-Za-z0-9_-]+)/i.exec(s);
  if (deep) {
    return {
      prefix: ATTENDANCE_QR_PREFIX,
      branchKey: decodeURIComponent(deep[1]),
      code: deep[2],
      expiresAt: 0,
    };
  }
  const parts = s.split('|');
  if (parts.length >= 3 && parts[0] === ATTENDANCE_QR_PREFIX) {
    return {
      prefix: parts[0],
      branchKey: String(parts[1] || '').trim(),
      code: String(parts[2] || '').trim(),
      expiresAt: Number(parts[3] || 0) || 0,
    };
  }
  // Bare code (kiosk already knows branch)
  if (/^[A-Za-z0-9_-]{8,24}$/.test(s)) {
    return { prefix: ATTENDANCE_QR_PREFIX, branchKey: '', code: s, expiresAt: 0 };
  }
  return null;
}

function timingSafeEqualString(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
