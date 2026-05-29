import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  effectiveActiveBranchId,
  shouldShowBranchSwitcher,
  switchableBranchesForUser,
} from '../src/features/branding/activeBranchContext.js';

describe('activeBranchContext', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(k) { return this.store[k] ?? null; },
      setItem(k, v) { this.store[k] = v; },
    });
  });

  it('shows switcher when user has 2+ allowed branches', () => {
    const user = { id: 's1', allowedBranchIds: ['a', 'b'], assignedBranchIds: ['a', 'b'] };
    expect(shouldShowBranchSwitcher(user, [])).toBe(true);
  });

  it('shows switcher for master owner when gymCodes has 2+ branches', () => {
    const user = { id: 'owner', staffRole: 'master_owner' };
    const gymCodes = [{ id: 'b1', code: 'HQ' }, { id: 'b2', code: 'R01' }];
    expect(shouldShowBranchSwitcher(user, gymCodes)).toBe(true);
    expect(shouldShowBranchSwitcher(user, [])).toBe(false);
  });

  it('builds switchable list from branch ids when gymCodes empty', () => {
    const user = { id: 's1', allowedBranchIds: ['uuid-1', 'uuid-2'] };
    const branches = switchableBranchesForUser(user, []);
    expect(branches).toHaveLength(2);
    expect(branches[0].id).toBe('uuid-1');
  });

  it('effectiveActiveBranchId prefers session activeBranchId', () => {
    const user = {
      id: 's1',
      activeBranchId: 'b2',
      gymCodeId: 'b1',
      allowedBranchIds: ['b1', 'b2'],
      assignedBranchIds: ['b1', 'b2'],
    };
    expect(effectiveActiveBranchId(user, [])).toBe('b2');
  });

  it('effectiveActiveBranchId falls back to localStorage pref when session branch unset', () => {
    localStorage.setItem('apg.activeBranch.pref', JSON.stringify({ s1: 'b2' }));
    const user = {
      id: 's1',
      allowedBranchIds: ['b1', 'b2'],
    };
    expect(effectiveActiveBranchId(user, [])).toBe('b2');
  });
});
