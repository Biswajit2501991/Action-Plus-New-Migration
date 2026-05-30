/** Default JWT lifetime — keep in sync with backend JWT_EXPIRES_IN. */
export const DEFAULT_JWT_EXPIRES_IN = '2h';

export const DEFAULT_AUTH_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/** Idle cap (client); should be ≤ JWT TTL so API rejects before client thinks session is valid. */
export const DEFAULT_AUTH_SESSION_IDLE_MS = 90 * 60 * 1000;

/**
 * Parse jwt/jsonwebtoken-style expires strings (e.g. 2h, 30m, 12h) to milliseconds.
 * @param {string | number | undefined | null} value
 * @param {number} [fallback=DEFAULT_AUTH_SESSION_TTL_MS]
 */
export function parseJwtExpiresToMs(value, fallback = DEFAULT_AUTH_SESSION_TTL_MS) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  const raw = String(value).trim().toLowerCase();
  if (!raw) return fallback;
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  const unit = match[2];
  const mult = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }[unit];
  return Math.round(amount * mult);
}

/**
 * @param {string | undefined} [jwtExpiresIn]
 * @param {string | number | undefined} [idleOverrideMs]
 */
export function resolveAuthSessionTiming(jwtExpiresIn, idleOverrideMs) {
  const jwt = jwtExpiresIn || DEFAULT_JWT_EXPIRES_IN;
  const ttlMs = parseJwtExpiresToMs(jwt);
  let idleMs = DEFAULT_AUTH_SESSION_IDLE_MS;
  if (idleOverrideMs != null && idleOverrideMs !== '') {
    idleMs = parseJwtExpiresToMs(idleOverrideMs, DEFAULT_AUTH_SESSION_IDLE_MS);
  }
  idleMs = Math.min(idleMs, ttlMs);
  return { jwtExpiresIn: jwt, ttlMs, idleMs };
}
