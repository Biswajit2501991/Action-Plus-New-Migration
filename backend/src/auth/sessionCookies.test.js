import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('sessionCookies', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sets HttpOnly access cookie when cookie mode is enabled', async () => {
    vi.stubEnv('APG_AUTH_COOKIE_MODE', '1');
    vi.stubEnv('JWT_EXPIRES_IN', '2h');
    const { setAccessTokenCookie, ACCESS_COOKIE_NAME } = await import('./sessionCookies.js');
    const headers = [];
    const res = { append: (name, value) => headers.push({ name, value }) };
    setAccessTokenCookie(res, 'jwt-token-value');
    expect(headers).toHaveLength(1);
    expect(headers[0].value).toContain(`${ACCESS_COOKIE_NAME}=jwt-token-value`);
    expect(headers[0].value).toContain('HttpOnly');
    expect(headers[0].value).toContain('Path=/api');
  });

  it('reads access token from Cookie header', async () => {
    vi.stubEnv('APG_AUTH_COOKIE_MODE', '1');
    const { readAccessTokenFromCookie } = await import('./sessionCookies.js');
    const req = { headers: { cookie: 'apg_access=abc123; other=x' } };
    expect(readAccessTokenFromCookie(req)).toBe('abc123');
  });

  it('wantsLegacyAuthResponse honors X-APG-Legacy-Auth', async () => {
    const { wantsLegacyAuthResponse } = await import('./sessionCookies.js');
    expect(wantsLegacyAuthResponse({ headers: { 'x-apg-legacy-auth': '1' }, query: {} })).toBe(true);
    expect(wantsLegacyAuthResponse({ headers: {}, query: {} })).toBe(false);
  });
});
