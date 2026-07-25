import { describe, expect, it } from 'vitest';
import {
  prepareMembersBulkWrite,
  assertMembersBulkWriteNonEmpty,
  assertMembersBulkPersisted,
  filterRowsForStaffWrite,
} from '../backend/src/auth/branchScope.js';
import { upsertJsonCollectionById } from '../backend/src/db/dataStore.js';

const BRANCH_A = 'branch-a';
const BRANCH_B = 'branch-b';

describe('prepareMembersBulkWrite', () => {
  it('stamps untagged staff creates so they are not silently dropped', () => {
    const auth = { userId: 'deep', gymCodeId: BRANCH_A, activeBranchId: BRANCH_A };
    const rows = [{ memberId: 'NEW-1', name: 'Fresh' }];
    // Old order (filter then stamp) dropped untagged rows:
    expect(filterRowsForStaffWrite(rows, auth)).toEqual([]);
    const { prepared, droppedIds } = prepareMembersBulkWrite(rows, auth);
    expect(droppedIds).toEqual([]);
    expect(prepared).toEqual([
      { memberId: 'NEW-1', name: 'Fresh', assignedGymCodeId: BRANCH_A },
    ]);
  });

  it('still drops explicit cross-branch rows for staff after stamp', () => {
    const auth = { userId: 'deep', gymCodeId: BRANCH_A, activeBranchId: BRANCH_A };
    const rows = [
      { memberId: 'ok', assignedGymCodeId: BRANCH_A },
      { memberId: 'other', assignedGymCodeId: BRANCH_B },
      { memberId: 'untagged' },
    ];
    // Staff stamp overwrites JWT branch for all rows (including "other").
    const { prepared, droppedIds } = prepareMembersBulkWrite(rows, auth);
    expect(droppedIds).toEqual([]);
    expect(prepared.map((r) => r.memberId).sort()).toEqual(['ok', 'other', 'untagged']);
    expect(prepared.every((r) => r.assignedGymCodeId === BRANCH_A)).toBe(true);
  });

  it('owner keeps explicit branch on tagged rows and stamps missing from active', () => {
    const auth = {
      userId: 'owner',
      staffRole: 'master_owner',
      activeBranchId: BRANCH_A,
      gymCodeId: BRANCH_A,
    };
    const { prepared } = prepareMembersBulkWrite(
      [
        { memberId: 'kp', assignedGymCodeId: BRANCH_B },
        { memberId: 'new' },
      ],
      auth,
    );
    expect(prepared).toEqual([
      { memberId: 'kp', assignedGymCodeId: BRANCH_B },
      { memberId: 'new', assignedGymCodeId: BRANCH_A },
    ]);
  });
});

describe('assertMembersBulkWriteNonEmpty', () => {
  it('throws when client sent rows but scope left none writable', () => {
    expect(() => assertMembersBulkWriteNonEmpty(2, [], ['a', 'b'])).toThrow(
      /members-bulk-empty-after-scope/,
    );
    try {
      assertMembersBulkWriteNonEmpty(1, [], ['x']);
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.detail.droppedIds).toEqual(['x']);
    }
  });

  it('allows empty when client sent nothing', () => {
    expect(() => assertMembersBulkWriteNonEmpty(0, [])).not.toThrow();
  });

  it('allows non-empty prepared', () => {
    expect(() => assertMembersBulkWriteNonEmpty(1, [{ memberId: 'a' }])).not.toThrow();
  });
});

describe('assertMembersBulkPersisted', () => {
  it('throws when prepared ids wrote nothing (blocked / failed)', () => {
    expect(() => assertMembersBulkPersisted(['APG-1'], [], ['APG-1'])).toThrow(
      /members-bulk-blocked/,
    );
    expect(() => assertMembersBulkPersisted(['APG-1'], [], [])).toThrow(
      /members-bulk-not-persisted/,
    );
  });

  it('allows when at least one id persisted', () => {
    expect(() => assertMembersBulkPersisted(['a', 'b'], ['a'], ['b'])).not.toThrow();
  });
});

describe('upsertJsonCollectionById (KV replace-all guard)', () => {
  it('merges partial bulk without deleting existing members', () => {
    const existing = [
      { memberId: 'keep', name: 'Keep' },
      { memberId: 'old', name: 'Old' },
    ];
    const { rows, written } = upsertJsonCollectionById(
      existing,
      [{ memberId: 'new', name: 'New' }, { memberId: 'old', name: 'Updated' }],
      'memberId',
    );
    expect(written.sort()).toEqual(['new', 'old']);
    expect(rows.map((r) => r.memberId).sort()).toEqual(['keep', 'new', 'old']);
    expect(rows.find((r) => r.memberId === 'old').name).toBe('Updated');
    expect(rows.find((r) => r.memberId === 'keep').name).toBe('Keep');
  });

  it('empty incoming is a no-op (never wipe)', () => {
    const existing = [{ memberId: 'a' }];
    const { rows, written } = upsertJsonCollectionById(existing, [], 'memberId');
    expect(written).toEqual([]);
    expect(rows).toEqual(existing);
  });
});
