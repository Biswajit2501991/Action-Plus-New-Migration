import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  addMemberDeleteTombstone,
  isMemberDeleteTombstoned,
  readMemberDeleteTombstones,
  reconcileMemberDeleteTombstones,
  shouldKeepLocalOnlyMember,
} from '../src/features/members/memberDeleteTombstones.js';

describe('memberDeleteTombstones', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
  });

  it('blocks local-only merge for tombstoned ids', () => {
    addMemberDeleteTombstone('APG-1/26');
    expect(shouldKeepLocalOnlyMember('APG-1/26', null)).toBe(false);
    expect(shouldKeepLocalOnlyMember('APG-1/26', { 'APG-1/26': true })).toBe(false);
  });

  it('allows local-only merge when sync pending and not tombstoned', () => {
    expect(shouldKeepLocalOnlyMember('APG-NEW', { 'APG-NEW': true })).toBe(true);
  });

  it('keeps tombstone while server still returns member; clears when gone', () => {
    addMemberDeleteTombstone('APG-1');
    addMemberDeleteTombstone('APG-2');
    reconcileMemberDeleteTombstones([{ memberId: 'APG-2' }]);
    expect(readMemberDeleteTombstones()).toEqual(['APG-2']);
    reconcileMemberDeleteTombstones([]);
    expect(readMemberDeleteTombstones()).toEqual([]);
  });
});
