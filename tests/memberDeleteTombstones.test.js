import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  addMemberDeleteTombstone,
  isMemberDeleteTombstoned,
  mergePendingMembersForDisplay,
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

  it('clears tombstone when server returns active member unless delete still pending', () => {
    addMemberDeleteTombstone('APG-1');
    addMemberDeleteTombstone('APG-2');
    reconcileMemberDeleteTombstones([{ memberId: 'APG-2' }], ['APG-2']);
    expect(readMemberDeleteTombstones()).toEqual(['APG-2']);
    reconcileMemberDeleteTombstones([{ memberId: 'APG-1' }], []);
    expect(readMemberDeleteTombstones()).toEqual([]);
    reconcileMemberDeleteTombstones([]);
    expect(readMemberDeleteTombstones()).toEqual([]);
  });

  it('shows pending local adds even when branch scope excludes them', () => {
    const all = [
      { memberId: 'APG-NEW', name: 'New Member', assignedGymCodeId: 'branch-a' },
      { memberId: 'APG-OLD', name: 'Old Member', assignedGymCodeId: 'branch-b' },
    ];
    const scoped = [{ memberId: 'APG-OLD', name: 'Old Member', assignedGymCodeId: 'branch-b' }];
    const out = mergePendingMembersForDisplay(scoped, all, { 'APG-NEW': { localTs: Date.now() } });
    expect(out.map((m) => m.memberId)).toEqual(['APG-NEW', 'APG-OLD']);
  });
});
