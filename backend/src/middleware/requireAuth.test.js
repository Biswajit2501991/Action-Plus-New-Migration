import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('readAuthToken', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefers Bearer header over cookie', async () => {
    vi.stubEnv('APG_AUTH_COOKIE_MODE', '1');
    const { readAuthToken } = await import('../middleware/requireAuth.js');
    const req = {
      headers: {
        authorization: 'Bearer header-token',
        cookie: 'apg_access=cookie-token',
      },
      query: {},
    };
    expect(readAuthToken(req)).toBe('header-token');
  });

  it('reads HttpOnly cookie when cookie mode is enabled', async () => {
    vi.stubEnv('APG_AUTH_COOKIE_MODE', '1');
    const { readAuthToken } = await import('../middleware/requireAuth.js');
    const req = { headers: { cookie: 'apg_access=cookie-token' }, query: {} };
    expect(readAuthToken(req)).toBe('cookie-token');
  });
});
