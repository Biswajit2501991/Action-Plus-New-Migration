import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.BRANCH_OWNER_ENABLED = 'true';
});
import {
  authIsMasterOwner,
  authIsBranchOwner,
  authCanAccessBranch,
  resolveAllowedBranchIds,
  branchOwnerFeatureEnabled,
} from '../backend/src/auth/tenant/scopedAuth.js';
import { filterUsersForAuth, sanitizeUsersBulkForAuth } from '../backend/src/auth/tenant/userScope.js';
import { resolveReadBranchScope, branchScopeAllowsMember } from '../backend/src/auth/branchScope.js';
import { filterRowsByBranch } from '../backend/src/auth/branchFilter.js';
import {
  authIsMasterOwnerUser,
  authIsBranchOwnerUser,
  canDeleteMemberForUser,
  memberInUserBranches,
} from '../src/features/tenant/branchOwnerAccess.js';

describe('scopedAuth', () => {
  it('master owner detected by login id', () => {
    expect(authIsMasterOwner({ userId: 'owner', roles: ['owner'] })).toBe(true);
    expect(branchOwnerFeatureEnabled()).toBe(true);
  });

  it('branch owner has allowed branches', () => {
    const auth = {
      userId: 'raja',
      staffRole: 'branch_owner',
      roles: ['branch_owner'],
      allowedBranchIds: ['b1', 'b2'],
      gymCodeId: 'b1',
    };
    expect(authIsBranchOwner(auth)).toBe(true);
    expect(authIsMasterOwner(auth)).toBe(false);
    expect(resolveAllowedBranchIds(auth)).toEqual(['b1', 'b2']);
    expect(authCanAccessBranch(auth, 'b2')).toBe(true);
    expect(authCanAccessBranch(auth, 'hq')).toBe(false);
  });
});

describe('userScope', () => {
  it('branch owner bulk strips branch_owner role', () => {
    const auth = { userId: 'raja', staffRole: 'branch_owner', allowedBranchIds: ['b1'] };
    const out = sanitizeUsersBulkForAuth([
      { id: 's1', staffRole: 'branch_owner', gymCodeId: 'b1' },
      { id: 's2', gymCodeId: 'b1' },
    ], auth);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('s2');
    expect(out[0].staffRole).toBe('staff');
  });

  it('filters users to assigned branches', () => {
    const auth = { staffRole: 'branch_owner', allowedBranchIds: ['b1'] };
    const users = [
      { id: 'a', gymCodeId: 'b1' },
      { id: 'b', gymCodeId: 'b2' },
      { id: 'owner', staffRole: 'master_owner', gymCodeId: 'hq' },
    ];
    expect(filterUsersForAuth(users, auth)).toEqual([{ id: 'a', gymCodeId: 'b1' }]);
  });
});

describe('branchScope multi-branch', () => {
  it('allows member only in active branch (not other assignments)', () => {
    const scope = resolveReadBranchScope({
      staffRole: 'branch_owner',
      allowedBranchIds: ['b1', 'b2'],
      gymCodeId: 'b1',
      activeBranchId: 'b1',
    });
    expect(branchScopeAllowsMember(scope, 'b1')).toBe(true);
    expect(branchScopeAllowsMember(scope, 'b2')).toBe(false);
    expect(branchScopeAllowsMember(scope, 'b9')).toBe(false);
  });

  it('filterRowsByBranch scopes to active branch when multiple assignments', () => {
    const rows = [
      { memberId: '1', assignedGymCodeId: 'b1' },
      { memberId: '2', assignedGymCodeId: 'b2' },
      { memberId: '3', assignedGymCodeId: 'x' },
    ];
    const outB1 = filterRowsByBranch(rows, {
      staffRole: 'branch_owner',
      allowedBranchIds: ['b1', 'b2'],
      gymCodeId: 'b1',
      activeBranchId: 'b1',
    });
    expect(outB1.map((r) => r.memberId)).toEqual(['1']);
    const outB2 = filterRowsByBranch(rows, {
      staffRole: 'branch_owner',
      allowedBranchIds: ['b1', 'b2'],
      gymCodeId: 'b2',
      activeBranchId: 'b2',
    });
    expect(outB2.map((r) => r.memberId)).toEqual(['2']);
  });
});

describe('client branchOwnerAccess', () => {
  it('branch owner may delete member in assigned branch', () => {
    const user = { id: 'raja', staffRole: 'branch_owner', allowedBranchIds: ['b1'] };
    const member = { assignedGymCodeId: 'b1' };
    expect(canDeleteMemberForUser(user, member, { deleteMembers: true })).toBe(true);
    expect(canDeleteMemberForUser(user, { assignedGymCodeId: 'b2' }, { deleteMembers: true })).toBe(false);
  });

  it('master owner helpers', () => {
    expect(authIsMasterOwnerUser({ id: 'owner' })).toBe(true);
    expect(authIsBranchOwnerUser({ id: 'raja', staffRole: 'branch_owner' })).toBe(true);
    expect(authIsBranchOwnerUser({ id: 'owner' })).toBe(false);
  });

  it('legacy untagged member visible to master owner in active branch only', () => {
    const owner = {
      id: 'owner',
      staffRole: 'master_owner',
      activeBranchId: 'b1',
      gymCodeId: 'b1',
    };
    expect(memberInUserBranches(owner, { assignedGymCodeId: '' })).toBe(true);
    expect(memberInUserBranches(owner, { assignedGymCodeId: 'b2' })).toBe(false);
  });

  it('branch owner does not see legacy untagged members', () => {
    const branchOwner = { id: 'raja', staffRole: 'branch_owner', allowedBranchIds: ['b1'] };
    expect(memberInUserBranches(branchOwner, { assignedGymCodeId: '' })).toBe(false);
    expect(memberInUserBranches(branchOwner, { assignedGymCodeId: 'b1' })).toBe(true);
  });
});
