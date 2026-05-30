/**
 * Startup security validation (V-001, V-003).
 * Used by server.js and scripts/security-check-env.js.
 */

const WEAK_JWT_SECRETS = new Set(['', 'change-me', 'changeme', 'secret', 'jwt-secret']);

function resolveProcessControlEnabled(nodeEnv, raw = process.env.PROCESS_CONTROL_ENABLED) {
  const v = raw;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return nodeEnv !== 'production';
}

/**
 * @param {object} [opts]
 * @param {string} [opts.nodeEnv]
 * @param {string} [opts.jwtSecret]
 * @param {boolean} [opts.processControlEnabled]
 * @param {string} [opts.processControlToken]
 * @param {string} [opts.supabaseServiceKey]
 * @param {string} [opts.corsOrigins]
 */
export function collectSecurityEnvIssues(opts = {}) {
  const nodeEnv = opts.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const jwt = String(opts.jwtSecret ?? process.env.JWT_SECRET ?? '');
  const processControlEnabled = opts.processControlEnabled ?? resolveProcessControlEnabled(nodeEnv);
  const processToken = String(opts.processControlToken ?? process.env.PROCESS_CONTROL_TOKEN ?? '');
  const serviceKey = String(opts.supabaseServiceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  const cors = String(opts.corsOrigins ?? process.env.CORS_ALLOWED_ORIGINS ?? '');

  const issues = [];
  const warnings = [];

  if (!jwt || WEAK_JWT_SECRETS.has(jwt) || jwt.length < 32) {
    issues.push('JWT_SECRET is missing, default, or too short (min 32 chars; run: npm run security:new-jwt-secret)');
  }

  if (serviceKey.includes('your-service-role') || (nodeEnv === 'production' && serviceKey.length < 40)) {
    issues.push('SUPABASE_SERVICE_ROLE_KEY looks like a placeholder or is missing');
  }

  if (nodeEnv === 'production') {
    if (processControlEnabled) {
      issues.push(
        'PROCESS_CONTROL_ENABLED must be false in production (use local supervisor via /__apg_supervisor instead)',
      );
    }
    if (cors.includes('*')) {
      issues.push('CORS_ALLOWED_ORIGINS must not contain * in production');
    }
    if (cors && !cors.includes('https://app.gymactionplus.com')) {
      warnings.push('CORS_ALLOWED_ORIGINS does not include https://app.gymactionplus.com');
    }
  } else if (processControlEnabled && !processToken) {
    warnings.push('PROCESS_CONTROL_ENABLED without PROCESS_CONTROL_TOKEN (process APIs accept any caller when token unset)');
  }

  return { issues, warnings, nodeEnv };
}

/**
 * @returns {{ ok: boolean, issues: string[], warnings: string[] }}
 */
export function validateSecurityEnv() {
  const { issues, warnings } = collectSecurityEnvIssues();
  return { ok: issues.length === 0, issues, warnings };
}

/**
 * Exit process when production env is insecure. Warn in development.
 */
export function assertSecurityEnvAtStartup() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const { issues, warnings } = collectSecurityEnvIssues({ nodeEnv });

  for (const w of warnings) {
    // eslint-disable-next-line no-console
    console.warn(`[security] ${w}`);
  }

  if (nodeEnv === 'production') {
    if (issues.length) {
      // eslint-disable-next-line no-console
      console.error('[security] Refusing to start — fix these before running in production:\n');
      for (const i of issues) {
        // eslint-disable-next-line no-console
        console.error(`  ✗ ${i}`);
      }
      process.exit(1);
    }
    return;
  }

  const jwt = String(process.env.JWT_SECRET || '');
  const allowDevDefault = ['1', 'true', 'yes'].includes(
    String(process.env.APG_ALLOW_DEV_JWT_DEFAULT || '').toLowerCase(),
  );
  const jwtWeak = !jwt || WEAK_JWT_SECRETS.has(jwt) || jwt.length < 32;

  if (jwtWeak && !allowDevDefault) {
    // eslint-disable-next-line no-console
    console.warn(
      '[security] JWT_SECRET is weak or unset. Set a strong JWT_SECRET in backend/.env '
      + 'or APG_ALLOW_DEV_JWT_DEFAULT=1 for local dev only.',
    );
  }
}
