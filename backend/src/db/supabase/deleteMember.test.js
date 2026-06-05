import { describe, expect, it, vi, beforeEach } from 'vitest';

const softDeleteUpdate = vi.fn();
const selectRange = vi.fn();
const auditUpsert = vi.fn();
const fromMock = vi.fn();

vi.mock('./client.js', () => ({
  getSupabase: () => ({
    from: fromMock,
  }),
  gymId: () => 'gym-1',
}));

vi.mock('./utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchAll: async (builder) => {
      const pageSize = 1000;
      let from = 0;
      const all = [];
      while (true) {
        const { data, error } = await builder(from, from + pageSize - 1);
        if (error) throw error;
        if (!data?.length) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
  };
});

vi.mock('../../realtime/supabaseListener.js', () => ({
  notifyCollectionChange: vi.fn(),
}));

vi.mock('./memberPaidForMonthSync.js', () => ({
  syncMemberPaidForMonthLedger: vi.fn(),
}));

vi.mock('./memberDeleteGuard.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    recordMemberDeleteAudit: vi.fn().mockResolvedValue(undefined),
    applyActiveMembersFilter: (q) => q,
  };
});

describe('deleteMemberByExternalId', () => {
  beforeEach(() => {
    softDeleteUpdate.mockReset();
    selectRange.mockReset();
    auditUpsert.mockReset();
    fromMock.mockReset();
    fromMock.mockImplementation((table) => {
      if (table === 'members') {
        const eqChain = () => ({
          order: () => ({ range: selectRange, limit: () => selectRange }),
          range: selectRange,
          is: () => ({ range: selectRange }),
        });
        return {
          select: () => ({
            eq: () => ({
              eq: eqChain,
              not: () => ({ range: selectRange }),
            }),
          }),
          update: () => ({
            eq: () => ({
              eq: softDeleteUpdate,
            }),
          }),
        };
      }
      if (table === 'member_delete_audit') {
        return {
          upsert: auditUpsert,
        };
      }
      const schemaCacheErr = {
        message: "Could not find the table 'public.member_paid_for_month' in the schema cache",
      };
      return {
        delete: () => ({
          in: vi.fn().mockImplementation(async () => {
            if (table === 'member_paid_for_month') return { error: schemaCacheErr };
            return { error: null };
          }),
        }),
      };
    });
  });

  it('soft-deletes member when member_paid_for_month table is not migrated', async () => {
    let selectCalls = 0;
    selectRange.mockImplementation(async () => {
      selectCalls += 1;
      if (selectCalls === 1) {
        return {
          data: [{ id: 42, member_code: 'APG-1004/26', assigned_gym_code_id: 'branch-a' }],
          error: null,
        };
      }
      return { data: [], error: null };
    });
    softDeleteUpdate.mockResolvedValue({ error: null });

    const { deleteMemberByExternalId } = await import('./repository.js');
    const result = await deleteMemberByExternalId('APG-1004/26', {
      isOwner: true,
      gymCodeId: 'branch-a',
      allowedBranchIds: ['branch-a'],
      staffNoBranch: false,
    });
    expect(result.deleted).toBe(true);
    expect(result.softDeleted).toBe(true);
    expect(softDeleteUpdate).toHaveBeenCalled();
  });

  it('soft-deletes all duplicate rows for member_code', async () => {
    let selectCalls = 0;
    selectRange.mockImplementation(async () => {
      selectCalls += 1;
      if (selectCalls === 1) {
        return {
          data: [
            { id: 42, member_code: 'APG-1/26', assigned_gym_code_id: 'branch-a' },
            { id: 43, member_code: 'APG-1/26', assigned_gym_code_id: 'branch-a' },
          ],
          error: null,
        };
      }
      return { data: [], error: null };
    });
    softDeleteUpdate.mockResolvedValue({ error: null });

    const { deleteMemberByExternalId } = await import('./repository.js');
    const result = await deleteMemberByExternalId('APG-1/26', {
      isOwner: false,
      gymCodeId: 'branch-a',
      allowedBranchIds: ['branch-a'],
      staffNoBranch: false,
    });
    expect(result).toMatchObject({ ok: true, deleted: true, id: 'APG-1/26', rowsRemoved: 2, softDeleted: true });
    expect(softDeleteUpdate).toHaveBeenCalled();
  });

  it('rejects delete outside active branch for branch owner context', async () => {
    selectRange.mockResolvedValueOnce({
      data: [{ id: 42, member_code: 'APG-1', assigned_gym_code_id: 'branch-b' }],
      error: null,
    });

    const { deleteMemberByExternalId } = await import('./repository.js');
    await expect(deleteMemberByExternalId('APG-1', {
      isOwner: true,
      gymCodeId: 'branch-a',
      allowedBranchIds: ['branch-a'],
      staffNoBranch: false,
    })).rejects.toMatchObject({ message: 'branch-write-forbidden', status: 403 });
  });
});
