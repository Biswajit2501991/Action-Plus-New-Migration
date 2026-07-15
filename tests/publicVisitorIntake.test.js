import { describe, expect, it } from 'vitest';
import {
  assertPublicVisitorPayload,
  normalizePublicMobile,
  enforcePublicVisitorRateLimits,
  publicMobileLiveHint,
} from '../backend/src/services/visitors/publicVisitorIntake.js';

describe('publicVisitorIntake helpers', () => {
  it('normalizes 10 / 0… / 91… / +91 mobiles to 10 digits', () => {
    expect(normalizePublicMobile('9876543210')).toBe('9876543210');
    expect(normalizePublicMobile('+91 98765 43210')).toBe('9876543210');
    expect(normalizePublicMobile('09876543210')).toBe('9876543210');
    expect(normalizePublicMobile('919876543210')).toBe('9876543210');
  });

  it('rejects mobiles that break length prefix rules', () => {
    expect(() => normalizePublicMobile('19876543210')).toThrow(/start with 0/);
    expect(() => normalizePublicMobile('929876543210')).toThrow(/start with 91/);
    expect(() => normalizePublicMobile('+929876543210')).toThrow(/\+91/);
    expect(() => normalizePublicMobile('123')).toThrow(/10 digits/);
  });

  it('live hint flags bad prefixes once length is complete', () => {
    expect(publicMobileLiveHint('19876543210')).toMatch(/start with 0/);
    expect(publicMobileLiveHint('98765')).toBeNull();
    expect(publicMobileLiveHint('+929876543210')).toMatch(/\+91/);
  });

  it('requires name, valid mobile, plan, and goal; rejects honeypot', () => {
    expect(() => assertPublicVisitorPayload({ fullName: 'A', mobile: '9876543210' })).toThrow(
      /name-required/,
    );
    expect(() =>
      assertPublicVisitorPayload({ fullName: 'Ada Lovelace', mobile: '123' }),
    ).toThrow(/10 digits/);
    expect(() =>
      assertPublicVisitorPayload({
        fullName: 'Ada Lovelace',
        mobile: '9876543210',
        website: 'http://spam',
      }),
    ).toThrow(/rejected/);
    expect(() =>
      assertPublicVisitorPayload({
        fullName: 'Ada Lovelace',
        mobile: '9876543210',
      }),
    ).toThrow(/plan-required/);
    expect(() =>
      assertPublicVisitorPayload({
        fullName: 'Ada Lovelace',
        mobile: '9876543210',
        interestPlan: 'Basic',
      }),
    ).toThrow(/goal-required/);

    const ok = assertPublicVisitorPayload({
      fullName: 'Ada Lovelace',
      mobile: '+919876543210',
      gender: 'Female',
      interestPlan: 'Personal Training',
      goal: 'Weight loss',
    });
    expect(ok.fullName).toBe('Ada Lovelace');
    expect(ok.mobile).toBe('9876543210');
    expect(ok.gender).toBe('Female');
    expect(ok.interestPlan).toBe('Personal Training');
    expect(ok.goal).toBe('Weight loss');
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
