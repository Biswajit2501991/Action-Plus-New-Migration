import { describe, expect, it, beforeEach, vi } from 'vitest';
import { addMemberDeleteTombstone } from '../src/features/members/memberDeleteTombstones.js';
import {
  mergeMembersAfterBranchReplace,
  scopeMembersToUserBranch,
} from '../src/features/tenant/branchSwitchCoordinator.js';

const BRANCH_A = 'branch-a';
const BRANCH_B = 'branch-b';

describe('scopeMembersToUserBranch', () => {
  const masterOwner = {
    id: 'owner',
    staffRole: 'master_owner',
    activeBranchId: BRANCH_A,
    gymCodeId: BRANCH_A,
    allowedBranchIds: [BRANCH_A, BRANCH_B],
  };

  it('drops cross-branch rows after remote merge when branch context is set', () => {
    const merged = [
      { memberId: '1', assignedGymCodeId: BRANCH_A },
      { memberId: '2', assignedGymCodeId: BRANCH_B },
      { memberId: '3', assignedGymCodeId: '' },
    ];
    const scoped = scopeMembersToUserBranch(masterOwner, merged, BRANCH_A);
    expect(scoped.map((m) => m.memberId).sort()).toEqual(['1', '3']);
  });

  it('uses authoritative branch id over stale user fields', () => {
    const staleUser = { ...masterOwner, activeBranchId: BRANCH_B, gymCodeId: BRANCH_B };
    const rows = [
      { memberId: '1', assignedGymCodeId: BRANCH_A },
      { memberId: '2', assignedGymCodeId: BRANCH_B },
    ];
    const scoped = scopeMembersToUserBranch(staleUser, rows, BRANCH_A);
    expect(scoped.map((m) => m.memberId)).toEqual(['1']);
  });
});

describe('mergeMembersAfterBranchReplace', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
  });

  it('drops tombstoned members from remote and local', () => {
    addMemberDeleteTombstone('gone');
    const remote = [
      { memberId: 'gone', assignedGymCodeId: BRANCH_A },
      { memberId: 'r1', assignedGymCodeId: BRANCH_A },
    ];
    const local = [{ memberId: 'gone', assignedGymCodeId: BRANCH_A }];
    const out = mergeMembersAfterBranchReplace(local, remote, BRANCH_A);
    expect(out.map((m) => m.memberId)).toEqual(['r1']);
  });

  it('keeps same-branch optimistic locals only', () => {
    const remote = [{ memberId: 'r1', assignedGymCodeId: BRANCH_A }];
    const local = [
      { memberId: 'l1', assignedGymCodeId: BRANCH_A },
      { memberId: 'stale', assignedGymCodeId: BRANCH_B },
    ];
    const out = mergeMembersAfterBranchReplace(local, remote, BRANCH_A);
    expect(out.map((m) => m.memberId).sort()).toEqual(['l1', 'r1']);
  });
});
