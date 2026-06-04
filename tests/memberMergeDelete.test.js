import { describe, expect, it } from 'vitest';
import { shouldKeepLocalOnlyMember } from '../src/features/members/memberDeleteTombstones.js';

describe('member merge after delete', () => {
  it('does not keep stale local-only rows after permanent delete', () => {
    expect(shouldKeepLocalOnlyMember('APG-1/26', null, ['APG-1/26'])).toBe(false);
    expect(shouldKeepLocalOnlyMember('APG-1/26', null, null)).toBe(false);
  });
});
