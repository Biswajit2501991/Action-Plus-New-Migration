import { describe, it, expect, beforeEach } from 'vitest';
import {
  addMemberDraftKeyForUser,
  loadAddMemberDraft,
  saveAddMemberDraft,
  clearAddMemberDraft,
  ADD_MEMBER_DRAFT_KEY,
} from '../src/features/forms/addMemberDraft.js';

function mockStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

describe('addMemberDraft scoped keys', () => {
  let storage;

  beforeEach(() => {
    storage = mockStorage();
  });

  it('uses separate keys for owner and staff', () => {
    expect(addMemberDraftKeyForUser({ id: 'owner', role: 'owner' })).toBe(`${ADD_MEMBER_DRAFT_KEY}::owner`);
    expect(addMemberDraftKeyForUser({ id: 'raja', role: 'staff' })).toBe(`${ADD_MEMBER_DRAFT_KEY}::raja`);
  });

  it('staff draft does not read owner scoped key', () => {
    saveAddMemberDraft(storage, { id: 'owner', role: 'owner' }, { step: 2, form: { assignedGymCodeId: 'hq' } });
    expect(loadAddMemberDraft(storage, { id: 'raja', role: 'staff', gymCodeId: 'r01' })).toBeNull();
  });

  it('staff falls back to legacy global key once', () => {
    storage.setItem(ADD_MEMBER_DRAFT_KEY, JSON.stringify({ step: 1, form: { name: 'x' } }));
    const loaded = loadAddMemberDraft(storage, { id: 'raja', role: 'staff' });
    expect(loaded?.form?.name).toBe('x');
  });

  it('clear without user removes legacy and scoped keys', () => {
    storage.setItem(ADD_MEMBER_DRAFT_KEY, '{}');
    storage.setItem(`${ADD_MEMBER_DRAFT_KEY}::raja`, '{}');
    storage.setItem(`${ADD_MEMBER_DRAFT_KEY}::owner`, '{}');
    clearAddMemberDraft(storage);
    expect(storage.getItem(ADD_MEMBER_DRAFT_KEY)).toBeNull();
    expect(storage.getItem(`${ADD_MEMBER_DRAFT_KEY}::raja`)).toBeNull();
    expect(storage.getItem(`${ADD_MEMBER_DRAFT_KEY}::owner`)).toBeNull();
  });
});
