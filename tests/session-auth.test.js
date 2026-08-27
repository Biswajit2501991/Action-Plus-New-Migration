import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTH_SESSION_IDLE_MS,
  DEFAULT_AUTH_SESSION_TTL_MS,
  isAuthSessionExpired,
} from '../src/shared/authSessionTiming.js';

describe('staff session TTL alignment', () => {
  it('uses a 2h absolute cap with 90m idle (not 15m)', () => {
    expect(DEFAULT_AUTH_SESSION_TTL_MS).toBe(2 * 60 * 60 * 1000);
    expect(DEFAULT_AUTH_SESSION_TTL_MS).toBeGreaterThan(15 * 60 * 1000);
    expect(DEFAULT_AUTH_SESSION_IDLE_MS).toBe(90 * 60 * 1000);
    expect(DEFAULT_AUTH_SESSION_IDLE_MS).toBeLessThanOrEqual(DEFAULT_AUTH_SESSION_TTL_MS);
  });

  it('expires only after absolute cap or idle window', () => {
    const now = Date.now();
    const active = {
      expiresAt: now + DEFAULT_AUTH_SESSION_TTL_MS,
      lastActivityAt: now,
    };
    expect(isAuthSessionExpired(active, now)).toBe(false);

    const idle = {
      expiresAt: now + DEFAULT_AUTH_SESSION_TTL_MS,
      lastActivityAt: now - DEFAULT_AUTH_SESSION_IDLE_MS - 1,
    };
    expect(isAuthSessionExpired(idle, now)).toBe(true);

    const absolute = {
      expiresAt: now - 1,
      lastActivityAt: now,
    };
    expect(isAuthSessionExpired(absolute, now)).toBe(true);
  });

  it('compares staff ids case-insensitively', () => {
    const match = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    expect(match('Deep', 'deep')).toBe(true);
  });
});
