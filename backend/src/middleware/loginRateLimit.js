import { env } from '../config/env.js';

/** @type {Map<string, { failures: number, attempts: number, resetAt: number }>} */
const loginBuckets = new Map();
/** @type {Map<string, { count: number, resetAt: number }>} */
const resetBuckets = new Map();

function pruneMap(map, now) {
  for (const [key, entry] of map) {
    if (now >= entry.resetAt) map.delete(key);
  }
}

setInterval(() => pruneMap(loginBuckets, Date.now()), 10 * 60 * 1000).unref?.();

/** Real client IP when behind Cloudflare tunnel + frontend proxy. */
export function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'] || req.headers['CF-Connecting-IP'];
  if (cf) return String(cf).trim();
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  const socketIp = req.socket?.remoteAddress || '';
  if (socketIp === '::1') return '127.0.0.1';
  return socketIp || 'unknown';
}

function getLoginEntry(ip) {
  const now = Date.now();
  let entry = loginBuckets.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { failures: 0, attempts: 0, resetAt: now + env.LOGIN_RATE_LIMIT_WINDOW_MS };
    loginBuckets.set(ip, entry);
  }
  return entry;
}

function getResetEntry(ip) {
  const now = Date.now();
  let entry = resetBuckets.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS };
    resetBuckets.set(ip, entry);
  }
  return entry;
}

function tooManyResponse(res, entry, message) {
  const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({
    error: 'too-many-requests',
    message,
    retryAfterSec,
  });
}

/** Owner login is never throttled (local dev + E2E). */
export function isOwnerLoginIdentifier(identifier) {
  return String(identifier || '').trim().toLowerCase() === 'owner';
}

function loginIdentifierFromReq(req) {
  return String(req.body?.identifier || req.body?.id || '').trim();
}

/** Block before handler if too many failed logins from this IP. */
export function loginRateLimit(req, res, next) {
  const ip = clientIp(req);
  req.clientIp = ip;
  if (isOwnerLoginIdentifier(loginIdentifierFromReq(req))) {
    return next();
  }
  const entry = getLoginEntry(ip);
  entry.attempts += 1;
  if (entry.failures >= env.LOGIN_RATE_LIMIT_MAX) {
    return tooManyResponse(
      res,
      entry,
      `Too many failed login attempts. Try again in ${Math.ceil((entry.resetAt - Date.now()) / 60000)} minutes.`,
    );
  }
  return next();
}

export function recordFailedLogin(req) {
  if (isOwnerLoginIdentifier(loginIdentifierFromReq(req))) return;
  const ip = req.clientIp || clientIp(req);
  const entry = getLoginEntry(ip);
  entry.failures += 1;
}

export function clearLoginFailures(req) {
  const ip = req.clientIp || clientIp(req);
  loginBuckets.delete(ip);
}

/** Limit password-reset request spam per IP. */
export function passwordResetRateLimit(req, res, next) {
  const ip = clientIp(req);
  req.clientIp = ip;
  const entry = getResetEntry(ip);
  entry.count += 1;
  if (entry.count > env.PASSWORD_RESET_RATE_LIMIT_MAX) {
    return tooManyResponse(
      res,
      entry,
      'Too many password reset requests. Try again later.',
    );
  }
  return next();
}
