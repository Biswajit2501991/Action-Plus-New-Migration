import { describe, expect, it } from 'vitest';
import { shouldSyncBranchAssignmentsOnWrite } from '../backend/src/auth/tenant/branchAssignments.js';

describe('shouldSyncBranchAssignmentsOnWrite', () => {
  it('syncs explicit staff saves', () => {
    expect(shouldSyncBranchAssignmentsOnWrite(
      { syncBranchAssignments: true },
      ['b1'],
      ['b1', 'b2', 'b3'],
    )).toBe(true);
  });

  it('skips collapsing multi-branch to a single gym on stale bulk', () => {
    expect(shouldSyncBranchAssignmentsOnWrite(
      { staffRole: 'staff' },
      ['b1'],
      ['b1', 'b2', 'b3'],
    )).toBe(false);
  });

  it('syncs multi-branch payloads', () => {
    expect(shouldSyncBranchAssignmentsOnWrite(
      { staffRole: 'staff' },
      ['b1', 'b2'],
      ['b1'],
    )).toBe(true);
  });

  it('does not collapse branch_owner on stale single-branch bulk', () => {
    expect(shouldSyncBranchAssignmentsOnWrite(
      { staffRole: 'branch_owner', id: 'mgr' },
      ['b1'],
      ['b1', 'b2'],
    )).toBe(false);
  });

  it('syncs branch_owner when explicitly saved', () => {
    expect(shouldSyncBranchAssignmentsOnWrite(
      { staffRole: 'branch_owner', id: 'mgr', syncBranchAssignments: true },
      ['b1'],
      ['b1', 'b2'],
    )).toBe(true);
  });
});
