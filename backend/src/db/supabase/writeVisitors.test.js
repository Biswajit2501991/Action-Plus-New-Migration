import { describe, expect, it, vi, beforeEach } from 'vitest';

const syncGymRowsByExternalId = vi.fn().mockResolvedValue(undefined);

vi.mock('./collectionSync.js', () => ({
  syncGymRowsByExternalId: (...args) => syncGymRowsByExternalId(...args),
  syncMemberChildRows: vi.fn(),
}));

vi.mock('./client.js', () => ({
  getSupabase: () => ({}),
  gymId: () => 'gym-test',
}));

vi.mock('./visitorsSchema.js', () => ({
  visitorsHaveGymCodeColumn: vi.fn().mockResolvedValue(true),
  stripVisitorGymCodeColumn: (row) => row,
}));

vi.mock('../../realtime/supabaseListener.js', () => ({
  notifyCollectionChange: vi.fn(),
}));

describe('writeVisitors via writeCollection', () => {
  beforeEach(() => {
    syncGymRowsByExternalId.mockClear();
  });

  it('uses upsert-only sync (deleteOrphans false)', async () => {
    const { writeCollection } = await import('./repository.js');
    await writeCollection('apg.visitors', [{ id: 'V-1', name: 'Test Visitor' }]);
    expect(syncGymRowsByExternalId).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ deleteOrphans: false }),
    );
  });

  it('empty payload does not trigger orphan delete (rows stay empty upsert)', async () => {
    const { writeCollection } = await import('./repository.js');
    await writeCollection('apg.visitors', []);
    expect(syncGymRowsByExternalId).toHaveBeenCalledTimes(1);
    expect(syncGymRowsByExternalId).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({
        deleteOrphans: false,
        rows: [],
      }),
    );
  });
});
