import { describe, expect, it } from 'vitest';
import { resolveReadBranchScope } from '../backend/src/auth/branchScope.js';
import { activeBranchIdsForDataScope } from '../src/features/tenant/branchOwnerAccess.js';
import { primaryBranchIdForLogin } from '../src/features/branding/activeBranchContext.js';
import {
  mergeMembersAfterBranchReplace,
  filterRowsToActiveBranch,
} from '../src/features/tenant/branchSwitchCoordinator.js';

describe('activeBranchIdsForDataScope', () => {
  it('returns single active branch for multi-assignment staff', () => {
    const user = {
      id: 'raja',
      activeBranchId: 'r01',
      allowedBranchIds: ['hq', 'r01', 'ap01'],
      assignedBranchIds: ['hq', 'r01', 'ap01'],
    };
    expect(activeBranchIdsForDataScope(user)).toEqual(['r01']);
  });

  it('falls back to primary (first allowed) when active unset', () => {
    const user = {
      id: 'raja',
      allowedBranchIds: ['hq', 'r01'],
      assignedBranchIds: ['hq', 'r01'],
    };
    expect(activeBranchIdsForDataScope(user)).toEqual(['hq']);
  });

  it('branch owner uses active-branch-only scope like staff', () => {
    const user = {
      id: 'bo1',
      staffRole: 'branch_owner',
      activeBranchId: 'b2',
      allowedBranchIds: ['b1', 'b2'],
    };
    expect(activeBranchIdsForDataScope(user)).toEqual(['b2']);
  });
});

describe('resolveReadBranchScope active-only', () => {
  it('scopes read to active branch when JWT lists multiple allowed', () => {
    const scope = resolveReadBranchScope({
      userId: 's1',
      allowedBranchIds: ['b1', 'b2', 'b3'],
      activeBranchId: 'b2',
      gymCodeId: 'b2',
    });
    expect(scope.gymCodeId).toBe('b2');
    expect(scope.allowedBranchIds).toEqual(['b2']);
  });
});

describe('primaryBranchIdForLogin', () => {
  it('uses server active when present', () => {
    const user = {
      id: 's1',
      activeBranchId: 'r01',
      gymCodeId: 'r01',
      allowedBranchIds: ['hq', 'r01'],
    };
    expect(primaryBranchIdForLogin(user)).toBe('r01');
  });

  it('uses first allowed when server active missing', () => {
    const user = { id: 's1', allowedBranchIds: ['hq', 'r01'] };
    expect(primaryBranchIdForLogin(user)).toBe('hq');
  });
});

describe('mergeMembersAfterBranchReplace', () => {
  it('drops cross-branch local rows and keeps active-branch optimistic rows', () => {
    const local = [
      { memberId: 'm1', assignedGymCodeId: 'b1' },
      { memberId: 'm2', assignedGymCodeId: 'b2' },
    ];
    const remote = [{ memberId: 'm1', assignedGymCodeId: 'b1', name: 'Remote' }];
    const out = mergeMembersAfterBranchReplace(local, remote, 'b1');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Remote');
  });
});

describe('filterRowsToActiveBranch', () => {
  it('filters to one branch', () => {
    const rows = [
      { id: '1', assignedGymCodeId: 'a' },
      { id: '2', assignedGymCodeId: 'b' },
    ];
    expect(filterRowsToActiveBranch(rows, 'a')).toHaveLength(1);
  });
});
