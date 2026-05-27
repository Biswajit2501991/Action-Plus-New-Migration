import { describe, expect, it } from 'vitest';
import {
  resolveReadBranchScope,
  staffBranchBlocksAllRows,
  branchScopeAllowsMember,
  filterMembersForBranchScope,
  filterRowsForStaffWrite,
  assertStaffHasBranchForWrite,
} from '../backend/src/auth/branchScope.js';
import {
  filterMembersForUser,
  memberInStaffBranch,
  scopeMembersForBulkSync,
} from '../src/features/branch/branchAccess.js';

const BRANCH_A = 'uuid-branch-a';
const BRANCH_B = 'uuid-branch-b';

describe('resolveReadBranchScope', () => {
  it('owner has no staff branch lock', () => {
    const s = resolveReadBranchScope({ userId: 'owner', gymCodeId: BRANCH_A });
    expect(s.isOwner).toBe(true);
    expect(s.staffNoBranch).toBe(false);
  });

  it('staff with branch gets gymCodeId', () => {
    const s = resolveReadBranchScope({ userId: 'deep', gymCodeId: BRANCH_A });
    expect(s.staffNoBranch).toBe(false);
    expect(s.gymCodeId).toBe(BRANCH_A);
  });

  it('staff without branch is blocked', () => {
    const s = resolveReadBranchScope({ userId: 'deep' });
    expect(s.staffNoBranch).toBe(true);
    expect(staffBranchBlocksAllRows(s)).toBe(true);
  });
});

describe('branchScopeAllowsMember', () => {
  const staffScope = resolveReadBranchScope({ userId: 's1', gymCodeId: BRANCH_A });

  it('hides untagged members from staff', () => {
    expect(branchScopeAllowsMember(staffScope, null)).toBe(false);
    expect(branchScopeAllowsMember(staffScope, '')).toBe(false);
  });

  it('allows same-branch members only', () => {
    expect(branchScopeAllowsMember(staffScope, BRANCH_A)).toBe(true);
    expect(branchScopeAllowsMember(staffScope, BRANCH_B)).toBe(false);
  });
});

describe('filterMembersForBranchScope', () => {
  const rows = [
    { memberId: 'm1', assignedGymCodeId: BRANCH_A },
    { memberId: 'm2', assignedGymCodeId: BRANCH_B },
    { memberId: 'm3' },
  ];
  const staffScope = resolveReadBranchScope({ userId: 's1', gymCodeId: BRANCH_A });

  it('staff sees only their branch', () => {
    expect(filterMembersForBranchScope(rows, staffScope).map((r) => r.memberId)).toEqual(['m1']);
  });
});

describe('filterRowsForStaffWrite', () => {
  const rows = [
    { memberId: 'm1', assignedGymCodeId: BRANCH_A },
    { memberId: 'm2', assignedGymCodeId: BRANCH_B },
    { memberId: 'm3' },
  ];

  it('owner passes all rows through', () => {
    expect(filterRowsForStaffWrite(rows, { userId: 'owner' })).toHaveLength(3);
  });

  it('staff bulk payload drops other branches and untagged rows', () => {
    const auth = { userId: 'deep', gymCodeId: BRANCH_A };
    expect(filterRowsForStaffWrite(rows, auth).map((r) => r.memberId)).toEqual(['m1']);
  });
});

describe('assertStaffHasBranchForWrite', () => {
  it('blocks staff without gymCodeId', () => {
    expect(() => assertStaffHasBranchForWrite({ userId: 'deep' })).toThrow(/branch-scope-missing/);
  });

  it('allows owner and staffed staff', () => {
    expect(() => assertStaffHasBranchForWrite({ userId: 'owner' })).not.toThrow();
    expect(() => assertStaffHasBranchForWrite({ userId: 'deep', gymCodeId: BRANCH_A })).not.toThrow();
  });
});

describe('scopeMembersForBulkSync', () => {
  it('matches filterMembersForUser for staff', () => {
    const staff = { id: 'deep', gymCodeId: BRANCH_A };
    const rows = [
      { memberId: 'm1', assignedGymCodeId: BRANCH_A },
      { memberId: 'm2', assignedGymCodeId: BRANCH_B },
    ];
    expect(scopeMembersForBulkSync(staff, rows)).toEqual(filterMembersForUser(staff, rows));
  });
});

describe('client filterMembersForUser', () => {
  const staff = { id: 'deep', gymCodeId: BRANCH_A };
  const owner = { id: 'owner' };
  const rows = [
    { memberId: 'm1', assignedGymCodeId: BRANCH_A },
    { memberId: 'm2', assignedGymCodeId: BRANCH_B },
  ];

  it('owner sees all', () => {
    expect(filterMembersForUser(owner, rows)).toHaveLength(2);
  });

  it('staff without branch sees none', () => {
    expect(filterMembersForUser({ id: 'x' }, rows)).toEqual([]);
  });

  it('staff matches server rules', () => {
    expect(filterMembersForUser(staff, rows).map((r) => r.memberId)).toEqual(['m1']);
    expect(memberInStaffBranch(staff, { assignedGymCodeId: BRANCH_B })).toBe(false);
  });
});
