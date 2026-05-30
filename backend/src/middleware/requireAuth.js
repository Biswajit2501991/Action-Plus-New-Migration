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

export function readBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const q = req.query?.token;
  if (q) return String(q).trim();
  return '';
}

/** Bearer header, ?token= (legacy SSE), or HttpOnly cookie when cookie mode is enabled. */
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
