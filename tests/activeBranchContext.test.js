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

  it('shows switcher when staff has 2+ assigned branches', () => {
    const user = {
      id: 'biswajit',
      staffRole: 'staff',
      assignedBranchIds: ['b1', 'b2', 'b3', 'b4'],
      allowedBranchIds: ['b1', 'b2', 'b3', 'b4'],
      gymCodeId: 'b1',
      activeBranchId: 'b1',
    };
    expect(shouldShowBranchSwitcher(user)).toBe(true);
    expect(switchableBranchesForUser(user, []).length).toBe(4);
  });

  it('hides switcher for single-branch staff', () => {
    const user = { id: 's1', gymCodeId: 'b1', assignedBranchIds: ['b1'] };
    expect(shouldShowBranchSwitcher(user)).toBe(false);
  });

  it('effectiveActiveBranchId uses session activeBranchId', () => {
    const user = {
      id: 's1',
      activeBranchId: 'b2',
      gymCodeId: 'b1',
      assignedBranchIds: ['b1', 'b2'],
    };
    expect(effectiveActiveBranchId(user, [])).toBe('b2');
  });
});
