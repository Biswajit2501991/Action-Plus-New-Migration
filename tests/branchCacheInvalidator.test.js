import { describe, expect, it, vi } from 'vitest';
import { invalidateCachesForBranchSwitch } from '../src/features/tenant/branchCacheInvalidator.js';

describe('branchCacheInvalidator', () => {
  it('does not clear visitors on branch switch (avoids losing unsynced rows)', () => {
    const setVisitors = vi.fn();
    invalidateCachesForBranchSwitch({ setVisitors, setMembers: vi.fn() }, 'branch-b');
    expect(setVisitors).not.toHaveBeenCalled();
  });
});
