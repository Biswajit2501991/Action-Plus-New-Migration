import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTH_SESSION_IDLE_MS,
  DEFAULT_AUTH_SESSION_TTL_MS,
} from '../src/shared/authSessionTiming.js';

/**
 * Mirrors the session TTL constants/logic shipped in index.html so we catch
 * accidental regressions back to the 15-minute client cap.
 */
function isAuthSessionExpired(parsed, now = Date.now()) {
  if (!parsed || typeof parsed !== 'object') return true;
  const expiresAt = Number(parsed.expiresAt || 0);
  const lastActivityAt = Number(parsed.lastActivityAt || parsed.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return true;
  if (now > expiresAt) return true;
  if (Number.isFinite(lastActivityAt) && lastActivityAt > 0 && now - lastActivityAt > DEFAULT_AUTH_SESSION_IDLE_MS) return true;
  return false;
}

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
  });

  it('compares staff ids case-insensitively', () => {
    const match = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    expect(match('Deep', 'deep')).toBe(true);
  });
});
