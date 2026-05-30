/** Parse APG_AUTH_COOKIE_MODE / AUTH_COOKIE_MODE env or __APG_ENV__ flag. */
export function parseAuthCookieMode(value) {
  if (value === true || value === 1) return true;
  const raw = String(value ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}
