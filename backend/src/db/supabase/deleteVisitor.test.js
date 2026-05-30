import { describe, expect, it, vi, beforeEach } from 'vitest';

const deleteChain = vi.fn();
const maybeSingle = vi.fn();
const fromMock = vi.fn();

vi.mock('./client.js', () => ({
  getSupabase: () => ({
    from: fromMock,
  }),
  gymId: () => 'gym-1',
}));

vi.mock('./visitorsSchema.js', () => ({
  visitorsHaveGymCodeColumn: vi.fn().mockResolvedValue(true),
  stripVisitorGymCodeColumn: (row) => row,
}));

vi.mock('../../realtime/supabaseListener.js', () => ({
  notifyCollectionChange: vi.fn(),
}));

describe('deleteVisitorByExternalId', () => {
  beforeEach(() => {
    deleteChain.mockReset();
    maybeSingle.mockReset();
    fromMock.mockReset();
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle,
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          eq: deleteChain,
        }),
      }),
    });
  });

  it('deletes row when branch matches staff scope', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'uuid-1', external_visitor_id: 'V-1', assigned_gym_code_id: 'branch-a' },
      error: null,
    });
    deleteChain.mockResolvedValue({ error: null });

    const { deleteVisitorByExternalId } = await import('./repository.js');
    const result = await deleteVisitorByExternalId('V-1', {
      isOwner: false,
      gymCodeId: 'branch-a',
      allowedBranchIds: ['branch-a'],
      staffNoBranch: false,
    });
    expect(result).toEqual({ ok: true, id: 'V-1' });
    expect(deleteChain).toHaveBeenCalled();
  });

  it('rejects delete outside active branch', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'uuid-1', external_visitor_id: 'V-1', assigned_gym_code_id: 'branch-b' },
      error: null,
    });

    const { deleteVisitorByExternalId } = await import('./repository.js');
    await expect(deleteVisitorByExternalId('V-1', {
      isOwner: false,
      gymCodeId: 'branch-a',
      allowedBranchIds: ['branch-a'],
      staffNoBranch: false,
    })).rejects.toMatchObject({ message: 'branch-write-forbidden', status: 403 });
  });
});
