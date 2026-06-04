import { describe, expect, it, vi, beforeEach } from 'vitest';

const deleteMemberRow = vi.fn();
const selectRange = vi.fn();
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

describe('deleteMemberByExternalId', () => {
  beforeEach(() => {
    deleteMemberRow.mockReset();
    selectRange.mockReset();
    fromMock.mockReset();
    fromMock.mockImplementation((table) => {
      if (table === 'members') {
        const eqChain = () => ({
          order: () => ({ range: selectRange }),
          range: selectRange,
        });
        return {
          select: () => ({
            eq: () => ({
              eq: eqChain,
            }),
          }),
          delete: () => ({
            eq: () => ({
              eq: deleteMemberRow,
            }),
          }),
        };
      }
      return {
        delete: () => ({
          in: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
    });
  });

  it('deletes all duplicate rows for member_code', async () => {
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
    deleteMemberRow.mockResolvedValue({ error: null });

    const { deleteMemberByExternalId } = await import('./repository.js');
    const result = await deleteMemberByExternalId('APG-1/26', {
      isOwner: false,
      gymCodeId: 'branch-a',
      allowedBranchIds: ['branch-a'],
      staffNoBranch: false,
    });
    expect(result).toEqual({ ok: true, deleted: true, id: 'APG-1/26', rowsRemoved: 2 });
    expect(deleteMemberRow).toHaveBeenCalled();
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
