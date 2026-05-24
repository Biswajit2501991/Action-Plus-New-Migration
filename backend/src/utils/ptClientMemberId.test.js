import { describe, expect, it } from 'vitest';
import { resolvePtClientMemberId } from './ptClientMemberId.js';

describe('resolvePtClientMemberId', () => {
  it('prefers memberId from JSON body (safe for codes containing /)', () => {
    expect(resolvePtClientMemberId({
      bodyMemberId: 'APG-531/26',
      pathParam: 'APG-531',
      pathSuffix: '',
    })).toBe('APG-531/26');
  });

  it('decodes path suffix when body is absent', () => {
    expect(resolvePtClientMemberId({
      bodyMemberId: '',
      pathParam: '',
      pathSuffix: 'APG-531%2F26',
    })).toBe('APG-531/26');
  });

  it('falls back to path param for simple codes', () => {
    expect(resolvePtClientMemberId({
      bodyMemberId: '',
      pathParam: 'M-1001',
      pathSuffix: '',
    })).toBe('M-1001');
  });

  it('returns empty when nothing provided', () => {
    expect(resolvePtClientMemberId({})).toBe('');
  });
});
