import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTH_SESSION_IDLE_MS,
  DEFAULT_AUTH_SESSION_TTL_MS,
  DEFAULT_JWT_EXPIRES_IN,
  parseJwtExpiresToMs,
  resolveAuthSessionTiming,
} from '../src/shared/authSessionTiming.js';

describe('authSessionTiming', () => {
  it('defaults to 2h JWT / 90m idle', () => {
    expect(DEFAULT_JWT_EXPIRES_IN).toBe('2h');
    expect(DEFAULT_AUTH_SESSION_TTL_MS).toBe(2 * 60 * 60 * 1000);
    expect(DEFAULT_AUTH_SESSION_IDLE_MS).toBe(90 * 60 * 1000);
  });

  it('parseJwtExpiresToMs supports h/m/s units', () => {
    expect(parseJwtExpiresToMs('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseJwtExpiresToMs('30m')).toBe(30 * 60 * 1000);
    expect(parseJwtExpiresToMs('45s')).toBe(45 * 1000);
  });

  it('resolveAuthSessionTiming caps idle at ttl', () => {
    const { ttlMs, idleMs } = resolveAuthSessionTiming('1h');
    expect(ttlMs).toBe(60 * 60 * 1000);
    expect(idleMs).toBeLessThanOrEqual(ttlMs);
  });
});
