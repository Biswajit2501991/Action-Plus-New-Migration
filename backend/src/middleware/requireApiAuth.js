import { env } from '../config/env.js';
import { verifyAuthToken, readAuthToken } from './requireAuth.js';
import { isLoopbackRequest } from './isLoopbackRequest.js';

/** Paths under /api that do not require JWT (relative to /api mount). */
const PUBLIC_PATHS = new Set([
  '/health',
  '/v1/health',
  '/version',
  '/v1/version',
]);

/**
 * Attach JWT from Authorization header, ?token= (legacy SSE), or HttpOnly cookie.
 */
export function requireApiAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const path = req.path || '';
  if (PUBLIC_PATHS.has(path)) return next();
  // Public QR / intake endpoints (also mounted before this middleware).
  if (path.startsWith('/public/')) return next();

  if (path.startsWith('/process/') && env.PROCESS_CONTROL_ENABLED) {
    if (env.NODE_ENV === 'production' && !isLoopbackRequest(req)) {
      // Fall through to normal JWT auth (public callers cannot use process token).
    } else {
      const controlToken = String(env.PROCESS_CONTROL_TOKEN || '');
      const fromHeader = String(req.headers['x-apg-process-token'] || '');
      const bearer = readAuthToken(req);
      if (controlToken && (fromHeader === controlToken || bearer === controlToken)) {
        req.auth = {
          userId: 'process-control',
          roles: ['owner'],
          permissions: ['*'],
          gymId: env.APG_GYM_ID || undefined,
          token: bearer || fromHeader,
        };
        return next();
      }
    }
  }

  const token = readAuthToken(req);
  if (token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${token}`;
  }

  const claims = verifyAuthToken(token);
  if (!claims?.userId) {
    return res.status(401).json({ error: 'unauthorized', message: 'Valid login required.' });
  }

  req.auth = {
    token,
    userId: claims.userId,
    roles: claims.roles || [],
    staffRole: claims.staffRole ? String(claims.staffRole) : undefined,
    permissions: claims.permissions || [],
    gymId: claims.gymId ? String(claims.gymId) : undefined,
    gymCodeId: claims.gymCodeId ? String(claims.gymCodeId) : undefined,
    activeBranchId: claims.activeBranchId ? String(claims.activeBranchId) : (claims.gymCodeId ? String(claims.gymCodeId) : undefined),
    allowedBranchIds: Array.isArray(claims.allowedBranchIds)
      ? claims.allowedBranchIds.map((id) => String(id).trim()).filter(Boolean)
      : undefined,
  };
  return next();
}
