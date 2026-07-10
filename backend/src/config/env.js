import dotenv from 'dotenv';
import { DEFAULT_JWT_EXPIRES_IN } from '../../../src/shared/authSessionTiming.js';
import { parseAuthCookieMode } from '../../../src/shared/authCookieMode.js';
import { parseCorsOrigins } from './cors.js';

dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

function parseProcessControlEnabled() {
  const v = process.env.PROCESS_CONTROL_ENABLED;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return (process.env.NODE_ENV || 'development') !== 'production';
}

export const env = {
  NODE_ENV,
  PORT: Number(process.env.PORT || process.env.BACKEND_PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
  /** V-002 Phase 2B–2D: HttpOnly JWT cookie instead of localStorage Bearer token. */
  AUTH_COOKIE_MODE: parseAuthCookieMode(process.env.APG_AUTH_COOKIE_MODE),
  DATABASE_PATH: process.env.DATABASE_PATH || './data/app.db',
  DATA_BACKEND: process.env.DATA_BACKEND || '',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  APG_GYM_ID: process.env.APG_GYM_ID || '',
  /** When true, API rejects JWTs that omit gymId (forces re-login after deploy). */
  APG_ENFORCE_GYM_JWT: process.env.APG_ENFORCE_GYM_JWT === 'true' || process.env.APG_ENFORCE_GYM_JWT === '1',
  CORS_ALLOWED_ORIGINS: parseCorsOrigins(NODE_ENV),
  PROCESS_CONTROL_ENABLED: parseProcessControlEnabled(),
  PROCESS_CONTROL_TOKEN: process.env.PROCESS_CONTROL_TOKEN || '',
  APG_BACKEND_START_SCRIPT: process.env.APG_BACKEND_START_SCRIPT || '',
  LOGIN_RATE_LIMIT_MAX: Math.max(3, Number(process.env.LOGIN_RATE_LIMIT_MAX || 10)),
  LOGIN_RATE_LIMIT_WINDOW_MS: Math.max(
    60 * 1000,
    Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  ),
  PASSWORD_RESET_RATE_LIMIT_MAX: Math.max(1, Number(process.env.PASSWORD_RESET_RATE_LIMIT_MAX || 5)),
  PASSWORD_RESET_RATE_LIMIT_WINDOW_MS: Math.max(
    60 * 1000,
    Number(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  ),
  /** Optional shared secret for GET /api/public/member-status (header X-APG-Member-Status-Key or ?apiKey=). */
  MEMBER_STATUS_PUBLIC_API_KEY: process.env.MEMBER_STATUS_PUBLIC_API_KEY || '',
  /** When true, staff_role branch_owner + staff_branch_assignments are enforced. */
  BRANCH_OWNER_ENABLED:
    process.env.BRANCH_OWNER_ENABLED === 'true' || process.env.BRANCH_OWNER_ENABLED === '1',
};
