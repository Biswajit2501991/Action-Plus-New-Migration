import { describe, expect, it } from 'vitest';
import {
  nextBranchFormNumber,
  branchCodeToken,
  buildBranchMemberId,
} from '../src/features/members/branchFormNumber.js';

describe('branch form number helpers', () => {
  it('nextBranchFormNumber is isolated per branch', () => {
    const members = [
      { assignedGymCodeId: 'A', formNo: 1001 },
      { assignedGymCodeId: 'A', formNo: 1003 },
      { assignedGymCodeId: 'B', formNo: 1002 },
    ];
    expect(nextBranchFormNumber(members, 'A')).toBe(1004);
    expect(nextBranchFormNumber(members, 'B')).toBe(1003);
  });

  it('branchCodeToken falls back when code missing', () => {
    expect(branchCodeToken([{ id: 'x', code: 'HQ' }], 'x')).toBe('HQ');
    expect(branchCodeToken([], 'x')).toBe('BR');
  });

  it('buildBranchMemberId includes branch token', () => {
    expect(buildBranchMemberId(1004, '26', 'A')).toBe('APG-1004/26-A');
  });
});

