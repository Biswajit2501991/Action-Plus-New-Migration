import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  activeBranchStore,
  beginActiveBranchSwitch,
  commitActiveBranchSwitch,
  endActiveBranchSwitch,
  getAuthoritativeActiveBranchId,
  syncActiveBranchFromAuthPayload,
  resetActiveBranchStore,
} from '../src/features/branding/activeBranchStore.js';

describe('activeBranchStore', () => {
  beforeEach(() => {
    resetActiveBranchStore();
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(k) { return this.store[k] ?? null; },
      setItem(k, v) { this.store[k] = v; },
    });
  });

  it('commitSwitch makes authoritative branch available to UI', () => {
    beginActiveBranchSwitch('staff1', 'adra');
    commitActiveBranchSwitch({
      userId: 'staff1',
      branchId: 'adra',
      allowedBranchIds: ['raja', 'adra'],
    });
    endActiveBranchSwitch();
    const user = {
      id: 'staff1',
      gymCodeId: 'raja',
      activeBranchId: 'raja',
      allowedBranchIds: ['raja', 'adra'],
    };
    expect(getAuthoritativeActiveBranchId(user, [])).toBe('adra');
  });

  it('blocks auth payload from downgrading branch during switch lock', () => {
    beginActiveBranchSwitch('staff1', 'adra');
    syncActiveBranchFromAuthPayload('staff1', {
      user: { id: 'staff1', activeBranchId: 'raja', gymCodeId: 'raja' },
      activeBranchId: 'raja',
    });
    expect(activeBranchStore.getSnapshot().activeBranchId).toBe('adra');
  });

  it('notifies subscribers on commit', () => {
    const seen = [];
    activeBranchStore.subscribe((snap) => seen.push(snap.activeBranchId));
    commitActiveBranchSwitch({ userId: 'o1', branchId: 'b2' });
    expect(seen).toContain('b2');
  });
});
