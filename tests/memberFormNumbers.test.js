import { describe, expect, it } from 'vitest';
import { buildBranchMemberId } from '../backend/src/services/members/memberFormNumbers.js';

describe('buildBranchMemberId', () => {
  it('builds APG form codes with branch token', () => {
    expect(buildBranchMemberId(1033, '26', 'AP01')).toBe('APG-1033/26-AP01');
    expect(buildBranchMemberId('1032', '26', 'ap01')).toBe('APG-1032/26-AP01');
  });
});
