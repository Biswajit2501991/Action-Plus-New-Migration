import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  addMemberDeleteTombstone,
  buildMembersFromServerWithPending,
} from '../src/features/members/memberDeleteTombstones.js';

describe('buildMembersFromServerWithPending', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
  });

  it('drops tombstoned members from server list on hydrate', () => {
    addMemberDeleteTombstone('APG-1/26');
    const prev = [{ memberId: 'APG-1/26', name: 'Ghost from localStorage' }];
    const remote = [{ memberId: 'APG-1/26', name: 'Still in DB' }, { memberId: 'APG-2', name: 'Keep' }];
    const out = buildMembersFromServerWithPending(remote, prev, { syncPending: {} });
    expect(out.map((m) => m.memberId)).toEqual(['APG-2']);
  });
});
