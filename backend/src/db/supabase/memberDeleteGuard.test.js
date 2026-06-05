import { describe, expect, it } from 'vitest';
import {
  filterMembersBlockedFromBulkWrite,
  applyActiveMembersFilter,
} from './memberDeleteGuard.js';

describe('filterMembersBlockedFromBulkWrite', () => {
  it('drops members whose codes are in the blocked set', () => {
    const blocked = new Set(['APG-1', 'APG-2']);
    const { allowed, skipped } = filterMembersBlockedFromBulkWrite([
      { memberId: 'APG-1', name: 'A' },
      { memberId: 'APG-3', name: 'C' },
      { memberId: 'APG-2', name: 'B' },
    ], blocked);
    expect(skipped).toEqual(['APG-1', 'APG-2']);
    expect(allowed.map((m) => m.memberId)).toEqual(['APG-3']);
  });

  it('allows all when blocked set is empty', () => {
    const { allowed, skipped } = filterMembersBlockedFromBulkWrite(
      [{ memberId: 'APG-9' }],
      new Set(),
    );
    expect(skipped).toEqual([]);
    expect(allowed).toHaveLength(1);
  });
});

describe('applyActiveMembersFilter', () => {
  it('chains is(deleted_at, null) on query builder', () => {
    const calls = [];
    const q = {
      is: (col, val) => {
        calls.push([col, val]);
        return q;
      },
    };
    applyActiveMembersFilter(q);
    expect(calls).toEqual([['deleted_at', null]]);
  });
});
