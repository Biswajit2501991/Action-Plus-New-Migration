import { describe, expect, it, beforeEach, vi } from 'vitest';
import { addMemberDeleteTombstone } from '../src/features/members/memberDeleteTombstones.js';
import { membersListFromServerHydrate } from '../src/features/members/memberListSync.js';

describe('membersListFromServerHydrate', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
  });

  it('excludes tombstoned members from server hydrate list', () => {
    addMemberDeleteTombstone('APG-DEL');
    const remote = [
      { memberId: 'APG-DEL', status: 'Active' },
      { memberId: 'APG-OK', status: 'Active' },
    ];
    const out = membersListFromServerHydrate(remote, []);
    expect(out.map((m) => m.memberId)).toEqual(['APG-OK']);
  });
});
