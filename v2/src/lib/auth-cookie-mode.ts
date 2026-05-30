import { parseAuthCookieMode } from '../../../src/shared/authCookieMode.js';

export function authCookieModeFromWindow(): boolean {
  if (typeof window === 'undefined') return false;
  const env = (window as Window & { __APG_ENV__?: { AUTH_COOKIE_MODE?: unknown } }).__APG_ENV__;
  if (env && parseAuthCookieMode(env.AUTH_COOKIE_MODE)) return true;
  return parseAuthCookieMode(import.meta.env.VITE_AUTH_COOKIE_MODE);
}

export function authFetchCredentials(): RequestCredentials {
  return authCookieModeFromWindow() ? 'include' : 'same-origin';
}
