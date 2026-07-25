import crypto from 'node:crypto';

const ROTATE_TTL_MS = Math.max(45_000, Number(process.env.ATTENDANCE_PRESENCE_ROTATE_TTL_MS || 90_000));
const TICKET_TTL_MS = Math.max(60_000, Number(process.env.ATTENDANCE_PRESENCE_TICKET_TTL_MS || 8 * 60_000));

/** Display tokens keyed by hash so prior codes stay valid until their own TTL (overlap). */
/** @type {Map<string, { tokenHash: string, gymCodeId: string, expiresAt: number }>} */
const displayTokens = new Map();
/** @type {Map<string, { gymCodeId: string, expiresAt: number, usedBy?: string }>} */
const tickets = new Map();

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw || ''), 'utf8').digest('hex');
}

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of displayTokens) {
    if (!v || v.expiresAt <= now) displayTokens.delete(k);
  }
  for (const [k, v] of tickets) {
    if (!v || v.expiresAt <= now) tickets.delete(k);
  }
}

setInterval(pruneExpired, 60_000).unref?.();

export function rotateAttendancePresenceToken(gymCodeId) {
  pruneExpired();
  const branchId = String(gymCodeId || '').trim();
  if (!branchId) {
    const err = new Error('gym-code-id-required');
    err.status = 400;
    throw err;
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = Date.now() + ROTATE_TTL_MS;
  displayTokens.set(tokenHash, { tokenHash, gymCodeId: branchId, expiresAt });
  return {
    token,
    gymCodeId: branchId,
    expiresAt: new Date(expiresAt).toISOString(),
    expiresInSec: Math.floor(ROTATE_TTL_MS / 1000),
  };
}

export function redeemAttendancePresenceToken(rawToken) {
  pruneExpired();
  const token = String(rawToken || '').trim();
  if (!token) {
    const err = new Error('token-required');
    err.status = 400;
    err.code = 'token-required';
    throw err;
  }
  const tokenHash = hashToken(token);
  const matched = displayTokens.get(tokenHash);
  if (!matched || matched.expiresAt <= Date.now()) {
    displayTokens.delete(tokenHash);
    const err = new Error('token-invalid');
    err.status = 400;
    err.code = 'token-invalid';
    err.detail = 'Attendance QR expired or invalid. Scan the gym display again.';
    throw err;
  }

  const ticket = crypto.randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + TICKET_TTL_MS;
  tickets.set(hashToken(ticket), {
    gymCodeId: matched.gymCodeId,
    expiresAt,
  });
  return {
    presenceTicket: ticket,
    gymCodeId: matched.gymCodeId,
    expiresAt: new Date(expiresAt).toISOString(),
    expiresInSec: Math.floor(TICKET_TTL_MS / 1000),
  };
}

/**
 * Consume a presence ticket for a login punch. Single-use.
 * @returns {{ gymCodeId: string }}
 */
export function consumeAttendancePresenceTicket(rawTicket, userId) {
  pruneExpired();
  const ticket = String(rawTicket || '').trim();
  if (!ticket) {
    const err = new Error('presence_required');
    err.status = 403;
    err.code = 'presence_required';
    err.detail = 'Scan the gym Attendance QR before Time In.';
    throw err;
  }
  const key = hashToken(ticket);
  const entry = tickets.get(key);
  if (!entry || entry.expiresAt <= Date.now()) {
    tickets.delete(key);
    const err = new Error('presence_required');
    err.status = 403;
    err.code = 'presence_required';
    err.detail = 'Attendance presence expired. Scan the gym QR again, then log in.';
    throw err;
  }
  if (entry.usedBy && entry.usedBy !== String(userId || '').trim()) {
    const err = new Error('presence_required');
    err.status = 403;
    err.code = 'presence_required';
    err.detail = 'This attendance scan was already used.';
    throw err;
  }
  tickets.delete(key);
  return { gymCodeId: entry.gymCodeId };
}

/** HMAC helper for future signed tickets (unused in v1 opaque map). */
export function presenceHmacSecret() {
  return String(process.env.JWT_SECRET || 'change-me');
}
