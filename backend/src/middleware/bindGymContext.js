import { env } from '../config/env.js';
import { runWithGymContext } from '../requestContext.js';

const PUBLIC_PATHS = new Set(['/health', '/v1/health']);

/**
 * Resolve gym from JWT (preferred) or APG_GYM_ID for legacy tokens / scripts.
 * Binds gym into AsyncLocalStorage for repository calls.
 */
export function bindGymContext(req, res, next) {
  const path = req.path || '';
  if (PUBLIC_PATHS.has(path)) return next();

  const tokenGymId = String(req.auth?.gymId || '').trim();
  const envGymId = String(env.APG_GYM_ID || '').trim();

  if (tokenGymId && envGymId && tokenGymId !== envGymId) {
    return res.status(403).json({
      error: 'gym-mismatch',
      message: 'This session is not valid for the configured gym.',
    });
  }

  let resolved = tokenGymId || envGymId;
  if (!resolved) {
    return res.status(503).json({
      error: 'gym-not-configured',
      message: 'APG_GYM_ID is not set and the login token has no gymId. Sign in again after server configuration.',
    });
  }

  if (env.APG_ENFORCE_GYM_JWT && !tokenGymId) {
    return res.status(401).json({
      error: 'token-missing-gym',
      message: 'Session expired or outdated. Please sign in again.',
    });
  }

  if (req.auth && !req.auth.gymId) {
    req.auth.gymId = resolved;
  }

  return runWithGymContext({ gymId: resolved }, () => next());
}
