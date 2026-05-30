import { env } from '../config/env.js';
import { parseJwtExpiresToMs } from '../../../src/shared/authSessionTiming.js';

export const ACCESS_COOKIE_NAME = 'apg_access';

export function isAuthCookieModeEnabled() {
  return env.AUTH_COOKIE_MODE === true;
}

/** Client explicitly requests legacy Bearer token in JSON (migration window). */
export function wantsLegacyAuthResponse(req) {
  const header = String(req.headers['x-apg-legacy-auth'] || '').trim().toLowerCase();
  if (header === '1' || header === 'true' || header === 'yes') return true;
  const query = String(req.query?.legacyAuth || '').trim();
  return query === '1' || query === 'true';
}

function cookieMaxAgeSeconds() {
  return Math.max(60, Math.floor(parseJwtExpiresToMs(env.JWT_EXPIRES_IN) / 1000));
}

function baseCookieAttributes() {
  const parts = ['HttpOnly', 'Path=/api', 'SameSite=Lax'];
  if (env.NODE_ENV === 'production') parts.push('Secure');
  return parts;
}

export function parseCookieHeader(req) {
  const raw = req?.headers?.cookie;
  if (!raw || typeof raw !== 'string') return {};
  const out = {};
  for (const segment of raw.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

export function readAccessTokenFromCookie(req) {
  if (!isAuthCookieModeEnabled()) return '';
  const fromParser = req?.cookies?.[ACCESS_COOKIE_NAME];
  if (fromParser) return String(fromParser);
  const parsed = parseCookieHeader(req);
  return parsed[ACCESS_COOKIE_NAME] ? String(parsed[ACCESS_COOKIE_NAME]) : '';
}

export function setAccessTokenCookie(res, token) {
  if (!token || !isAuthCookieModeEnabled()) return;
  const attrs = [
    `${ACCESS_COOKIE_NAME}=${encodeURIComponent(String(token))}`,
    ...baseCookieAttributes(),
    `Max-Age=${cookieMaxAgeSeconds()}`,
  ];
  res.append('Set-Cookie', attrs.join('; '));
}

export function clearAccessTokenCookie(res) {
  if (!isAuthCookieModeEnabled()) return;
  const attrs = [
    `${ACCESS_COOKIE_NAME}=`,
    ...baseCookieAttributes(),
    'Max-Age=0',
  ];
  res.append('Set-Cookie', attrs.join('; '));
}
