import { describe, it, expect } from 'vitest';
import {
  authIsOwner,
  filterRowsByBranch,
  stampBranchOnRows,
  assertBranchWriteAllowed,
} from '../backend/src/auth/branchFilter.js';

describe('authIsOwner', () => {
  it('treats userId="owner" as owner regardless of roles', () => {
    expect(authIsOwner({ userId: 'owner', roles: [] })).toBe(true);
    expect(authIsOwner({ userId: 'OWNER' })).toBe(true);
  });

  it('treats roles=[owner] as owner', () => {
    expect(authIsOwner({ userId: 'someone', roles: ['owner'] })).toBe(true);
  });

  it('rejects plain staff', () => {
    expect(authIsOwner({ userId: 'deep', roles: ['staff'] })).toBe(false);
    expect(authIsOwner(null)).toBe(false);
    expect(authIsOwner(undefined)).toBe(false);
  });
});

describe('filterRowsByBranch', () => {
  const branchA = 'gym-code-a';
  const branchB = 'gym-code-b';
  const rows = [
    { id: 'm1', assignedGymCodeId: branchA },
    { id: 'm2', assignedGymCodeId: branchB },
    { id: 'm3', assignedGymCodeId: '' }, // legacy / not yet stamped
    { id: 'm4', assignedGymCodeId: branchA },
  ];

  it('owner sees all rows', () => {
    const auth = { userId: 'owner', gymCodeId: branchA };
    expect(filterRowsByBranch(rows, auth)).toHaveLength(4);
  });

  it('staff sees ONLY their branch — legacy/NULL rows are hidden (zero-leak)', () => {
    const auth = { userId: 'deep', roles: ['staff'], gymCodeId: branchA };
    const out = filterRowsByBranch(rows, auth);
    expect(out.map(r => r.id)).toEqual(['m1', 'm4']);
  });

  it('staff without gymCodeId sees nothing (locked-down by default)', () => {
    const auth = { userId: 'deep', roles: ['staff'] };
    expect(filterRowsByBranch(rows, auth)).toEqual([]);
  });

  it('returns [] for non-array input', () => {
    expect(filterRowsByBranch(null, { userId: 'deep', gymCodeId: branchA })).toEqual([]);
  });
});

describe('stampBranchOnRows', () => {
  const branchA = 'gym-code-a';
  const branchB = 'gym-code-b';

  it('owner with default code stamps default on blank rows', () => {
    const auth = { userId: 'owner', gymCodeId: branchA, roles: ['owner'] };
    const rows = [
      { id: 'm1' },
      { id: 'm2', assignedGymCodeId: branchB },
    ];
    const out = stampBranchOnRows(rows, auth, branchA);
    expect(out[0].assignedGymCodeId).toBe(branchA);
    expect(out[1].assignedGymCodeId).toBe(branchB);
  });

  it('staff stamps own gymCodeId on blank rows', () => {
    const auth = { userId: 'deep', roles: ['staff'], gymCodeId: branchA };
    const rows = [{ id: 'm1' }];
    expect(stampBranchOnRows(rows, auth)[0].assignedGymCodeId).toBe(branchA);
  });

  it('staff overwrites wrong branch with JWT branch', () => {
    const auth = { userId: 'deep', roles: ['staff'], gymCodeId: branchA };
    const rows = [{ id: 'm1', assignedGymCodeId: branchB }];
    const out = stampBranchOnRows(rows, auth);
    expect(out[0].assignedGymCodeId).toBe(branchA);
  });

  it('owner keeps explicit branch on tagged rows', () => {
    const auth = { userId: 'owner', gymCodeId: branchA, roles: ['owner'] };
    const rows = [{ id: 'm1', assignedGymCodeId: branchB }];
    const out = stampBranchOnRows(rows, auth);
    expect(out[0].assignedGymCodeId).toBe(branchB);
  });
});

describe('assertBranchWriteAllowed', () => {
  const branchA = 'gym-code-a';
  const branchB = 'gym-code-b';

  it('owner can write anything', () => {
    expect(() => assertBranchWriteAllowed(
      [{ id: 'm1', assignedGymCodeId: branchA }, { id: 'm2', assignedGymCodeId: branchB }],
      { userId: 'owner', roles: ['owner'] },
    )).not.toThrow();
  });

  it('staff can write rows in own branch', () => {
    expect(() => assertBranchWriteAllowed(
      [{ id: 'm1', assignedGymCodeId: branchA }],
      { userId: 'deep', roles: ['staff'], gymCodeId: branchA },
    )).not.toThrow();
  });

  it('staff can write rows with no branch (will be stamped)', () => {
    expect(() => assertBranchWriteAllowed(
      [{ id: 'm1' }],
      { userId: 'deep', roles: ['staff'], gymCodeId: branchA },
    )).not.toThrow();
  });

  it('staff CANNOT write rows from another branch — throws 403', () => {
    try {
      assertBranchWriteAllowed(
        [{ id: 'm1', assignedGymCodeId: branchB }],
        { userId: 'deep', roles: ['staff'], gymCodeId: branchA },
      );
      throw new Error('expected throw');
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.message).toBe('cross-branch-write-forbidden');
      expect(err.detail.expectedGymCodeId).toBe(branchA);
      expect(err.detail.gotGymCodeId).toBe(branchB);
    }
  });

  it('staff with no gymCodeId in JWT is blocked with 403', () => {
    try {
      assertBranchWriteAllowed(
        [{ id: 'm1', assignedGymCodeId: branchA }],
        { userId: 'deep', roles: ['staff'] },
      );
      throw new Error('expected throw');
    } catch (err) {
      expect(err.status).toBe(403);
      expect(err.message).toBe('branch-scope-missing');
    }
  });

  it('empty payload is a no-op', () => {
    expect(() => assertBranchWriteAllowed([], { userId: 'deep', gymCodeId: branchA })).not.toThrow();
  });
});
