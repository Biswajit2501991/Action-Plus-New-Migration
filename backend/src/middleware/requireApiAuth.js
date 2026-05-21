import { env } from '../config/env.js';
import { verifyAuthToken } from './requireAuth.js';

/** Paths under /api that do not require JWT (relative to /api mount). */
const PUBLIC_PATHS = new Set([
  '/health',
  '/v1/health',
]);

function readBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const q = req.query?.token;
  if (q) return String(q).trim();
  return '';
}

/**
 * Attach JWT from Authorization header or ?token= (for EventSource).
 */
export function requireApiAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const path = req.path || '';
  if (PUBLIC_PATHS.has(path)) return next();

  if (path.startsWith('/process/') && env.PROCESS_CONTROL_ENABLED) {
    const controlToken = String(env.PROCESS_CONTROL_TOKEN || '');
    const fromHeader = String(req.headers['x-apg-process-token'] || '');
    const bearer = readBearerToken(req);
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

  const token = readBearerToken(req);
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
    permissions: claims.permissions || [],
    gymId: claims.gymId ? String(claims.gymId) : undefined,
    // Multi-tenant branch scope (Phase 2 gym-codes). Owner is treated as cross-branch
    // downstream via authIsOwner() in branchFilter.js, even though they still carry a code.
    gymCodeId: claims.gymCodeId ? String(claims.gymCodeId) : undefined,
  };
  return next();
}
