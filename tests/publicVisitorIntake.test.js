import { describe, expect, it } from 'vitest';
import {
  assertPublicVisitorPayload,
  normalizePublicMobile,
  enforcePublicVisitorRateLimits,
} from '../backend/src/services/visitors/publicVisitorIntake.js';

describe('publicVisitorIntake helpers', () => {
  it('normalizes +91 / leading-0 mobiles to 10 digits', () => {
    expect(normalizePublicMobile('9876543210')).toBe('9876543210');
    expect(normalizePublicMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizePublicMobile('09876543210')).toBe('9876543210');
  });

  it('requires name and valid mobile; rejects honeypot', () => {
    expect(() => assertPublicVisitorPayload({ fullName: 'A', mobile: '9876543210' })).toThrow(
      /name-required/,
    );
    expect(() =>
      assertPublicVisitorPayload({ fullName: 'Ada Lovelace', mobile: '123' }),
    ).toThrow(/invalid-mobile/);
    expect(() =>
      assertPublicVisitorPayload({
        fullName: 'Ada Lovelace',
        mobile: '9876543210',
        website: 'http://spam',
      }),
    ).toThrow(/rejected/);

    const ok = assertPublicVisitorPayload({
      fullName: 'Ada Lovelace',
      mobile: '+919876543210',
      gender: 'Female',
    });
    expect(ok.fullName).toBe('Ada Lovelace');
    expect(ok.mobile).toBe('9876543210');
    expect(ok.gender).toBe('Female');
  });

  it('rate-limits by IP after the configured max', () => {
    const req = { headers: {}, socket: { remoteAddress: '203.0.113.50' } };
    const mobile = `9${String(Date.now()).slice(-9)}`;
    let hit429 = false;
    for (let i = 0; i < 12; i += 1) {
      try {
        enforcePublicVisitorRateLimits(req, mobile);
      } catch (err) {
        if (err?.status === 429) {
          hit429 = true;
          expect(err.code).toBe('too-many-requests');
          break;
        }
        throw err;
      }
    }
    expect(hit429).toBe(true);
  });
});
