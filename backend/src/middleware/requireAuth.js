import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { readAccessTokenFromCookie } from '../auth/sessionCookies.js';

export function verifyAuthToken(rawToken) {
  if (!rawToken) return null;
  try {
    return jwt.verify(rawToken, env.JWT_SECRET);
  } catch {
    return null;
  }
}

/** EventSource cannot set Authorization; only this path may read JWT from ?token=. */
function pathAllowsQueryJwt(req) {
  const path = String(req.path || '').split('?')[0];
  if (path === '/realtime/stream') return true;
  const orig = String(req.originalUrl || req.url || '').split('?')[0];
  return orig === '/api/realtime/stream' || orig.endsWith('/realtime/stream');
}

export function readBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (pathAllowsQueryJwt(req)) {
    const q = req.query?.token;
    if (q) return String(q).trim();
  }
  return '';
}

/** Bearer header, ?token= on /api/realtime/stream only, or HttpOnly cookie when cookie mode is enabled. */
export function readAuthToken(req) {
  const bearer = readBearerToken(req);
  if (bearer) return bearer;
  return readAccessTokenFromCookie(req);
}

export function requireAuth(req, res, next) {
  const token = readAuthToken(req);
  if (token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${token}`;
  }
  const claims = verifyAuthToken(token);
  if (!claims?.userId) return res.status(401).json({ error: 'unauthorized' });

  req.auth = {
    token,
    userId: claims.userId,
    roles: claims.roles || [],
    permissions: claims.permissions || [],
    gymId: claims.gymId ? String(claims.gymId) : undefined,
  };
  return next();
}
