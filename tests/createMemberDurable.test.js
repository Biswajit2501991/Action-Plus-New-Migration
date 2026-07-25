import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../backend/src/db/dataStore.js', () => ({
  writeJsonCollection: vi.fn(async (_key, rows) => ({
    written: (rows || []).map((r) => String(r.memberId)).filter(Boolean),
    skipped: [],
  })),
  readMember: vi.fn(async (code) => ({
    memberId: code,
    name: 'Avijit Sildas',
    assignedGymCodeId: 'branch-a',
  })),
}));

import { createMemberDurable } from '../backend/src/services/members/createMember.js';
import { writeJsonCollection, readMember } from '../backend/src/db/dataStore.js';

const BRANCH_A = 'branch-a';

describe('createMemberDurable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps untagged staff creates and returns the saved member', async () => {
    const auth = { userId: 'Deep', gymCodeId: BRANCH_A, activeBranchId: BRANCH_A };
    const saved = await createMemberDurable(
      { memberId: 'APG-9999/26-AP01', name: 'Avijit Sildas' },
      auth,
      { isOwner: false, gymCodeId: BRANCH_A },
    );
    expect(writeJsonCollection).toHaveBeenCalledTimes(1);
    const rows = writeJsonCollection.mock.calls[0][1];
    expect(rows[0].assignedGymCodeId).toBe(BRANCH_A);
    expect(saved.memberId).toBe('APG-9999/26-AP01');
    expect(readMember).toHaveBeenCalledWith('APG-9999/26-AP01', expect.any(Object));
  });

  it('fails closed when write returns no written ids', async () => {
    writeJsonCollection.mockResolvedValueOnce({ written: [], skipped: ['APG-1'] });
    const auth = { userId: 'Deep', gymCodeId: BRANCH_A, activeBranchId: BRANCH_A };
    await expect(
      createMemberDurable({ memberId: 'APG-1', name: 'X' }, auth, { gymCodeId: BRANCH_A }),
    ).rejects.toMatchObject({ message: 'members-bulk-blocked', status: 409 });
  });

  it('fails closed when read-back misses the row', async () => {
    readMember.mockResolvedValueOnce(null);
    const auth = { userId: 'Deep', gymCodeId: BRANCH_A, activeBranchId: BRANCH_A };
    await expect(
      createMemberDurable({ memberId: 'APG-2', name: 'X' }, auth, { gymCodeId: BRANCH_A }),
    ).rejects.toMatchObject({ message: 'member-create-not-readable', status: 500 });
  });
});
