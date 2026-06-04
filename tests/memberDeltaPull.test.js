import { describe, expect, it } from 'vitest';
import { mergeMemberDeltaIntoList } from '../src/features/members/memberDeltaPull.js';

describe('mergeMemberDeltaIntoList', () => {
  it('keeps members not present in delta payload', () => {
    const prev = [
      { memberId: 'A', status: 'Active', updatedAt: '2026-01-01T00:00:00.000Z' },
      { memberId: 'B', status: 'Hold', updatedAt: '2026-01-01T00:00:00.000Z' },
      { memberId: 'C', status: 'Active', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const delta = [
      { memberId: 'A', status: 'Active', updatedAt: '2026-06-04T12:00:00.000Z', plan: 'Gold' },
    ];
    const out = mergeMemberDeltaIntoList(prev, delta);
    expect(out.map((m) => m.memberId).sort()).toEqual(['A', 'B', 'C']);
    expect(out.find((m) => m.memberId === 'A').plan).toBe('Gold');
  });

  it('appends new members from delta', () => {
    const prev = [{ memberId: 'A', status: 'Active' }];
    const delta = [{ memberId: 'NEW', status: 'Active' }];
    const out = mergeMemberDeltaIntoList(prev, delta);
    expect(out.map((m) => m.memberId).sort()).toEqual(['A', 'NEW']);
  });
});
