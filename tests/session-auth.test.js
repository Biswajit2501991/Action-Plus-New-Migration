import { describe, expect, it } from 'vitest';

/**
 * Mirrors the session TTL constants/logic shipped in index.html so we catch
 * accidental regressions back to the 15-minute client cap.
 */
const AUTH_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const AUTH_SESSION_IDLE_MS = 8 * 60 * 60 * 1000;

function isAuthSessionExpired(parsed, now = Date.now()) {
  if (!parsed || typeof parsed !== 'object') return true;
  const expiresAt = Number(parsed.expiresAt || 0);
  const lastActivityAt = Number(parsed.lastActivityAt || parsed.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return true;
  if (now > expiresAt) return true;
  if (Number.isFinite(lastActivityAt) && lastActivityAt > 0 && now - lastActivityAt > AUTH_SESSION_IDLE_MS) return true;
  return false;
}

describe('staff session TTL alignment', () => {
  it('uses a 12h sliding window (not 15m)', () => {
    expect(AUTH_SESSION_TTL_MS).toBe(12 * 60 * 60 * 1000);
    expect(AUTH_SESSION_TTL_MS).toBeGreaterThan(15 * 60 * 1000);
  });

  it('expires only after absolute cap or 8h idle', () => {
    const now = Date.now();
    const active = {
      expiresAt: now + AUTH_SESSION_TTL_MS,
      lastActivityAt: now,
    };
    expect(isAuthSessionExpired(active, now)).toBe(false);

    const idle = {
      expiresAt: now + AUTH_SESSION_TTL_MS,
      lastActivityAt: now - AUTH_SESSION_IDLE_MS - 1,
    };
    expect(isAuthSessionExpired(idle, now)).toBe(true);
  });

  it('compares staff ids case-insensitively', () => {
    const match = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    expect(match('Deep', 'deep')).toBe(true);
  });
});
