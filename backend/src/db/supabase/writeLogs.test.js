import { describe, expect, it, vi, beforeEach } from 'vitest';

const syncGymRowsByExternalId = vi.fn().mockResolvedValue(undefined);
const notifyCollectionChange = vi.fn();

vi.mock('./collectionSync.js', () => ({
  syncGymRowsByExternalId: (...args) => syncGymRowsByExternalId(...args),
  syncMemberChildRows: vi.fn(),
}));

const sbFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    limit: vi.fn(async () => ({ error: null })),
  })),
  delete: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
  insert: vi.fn(async () => ({ error: null })),
}));

vi.mock('./client.js', () => ({
  getSupabase: () => ({ from: sbFrom }),
  gymId: () => 'gym-test',
}));

vi.mock('../../realtime/supabaseListener.js', () => ({
  notifyCollectionChange: (...args) => notifyCollectionChange(...args),
}));

vi.mock('./mappers.js', () => ({
  appLogToRow: (log, gid) => ({
    gym_id: gid,
    external_log_id: String(log.id || 'log-1'),
    logged_at: log.loggedAt || new Date().toISOString(),
    payload: log,
  }),
  logRowToApp: (row) => row.payload || row,
  appMemberToRow: vi.fn(),
  memberRowToApp: vi.fn(),
  appStaffToRow: vi.fn(),
  staffRowToApp: vi.fn(),
  appVisitorToRow: vi.fn(),
  visitorRowToApp: vi.fn(),
  appFinanceToRow: vi.fn(),
  financeRowToApp: vi.fn(),
  appSmsToRow: vi.fn(),
  smsRowToApp: vi.fn(),
  MEMBER_LIST_COLUMNS: '*',
  LOG_LIST_COLUMNS: '*',
  messageRowToApp: vi.fn(),
  paymentRowToApp: vi.fn(),
  attachmentRowToApp: vi.fn(),
}));

describe('writeLogs via writeCollection', () => {
  beforeEach(async () => {
    syncGymRowsByExternalId.mockClear();
    notifyCollectionChange.mockClear();
    sbFrom.mockClear();
    vi.resetModules();
  });

  it('empty payload does not call sync (preserves DB audit rows)', async () => {
    const { writeCollection } = await import('./repository.js');
    await writeCollection('apg.logs', []);
    expect(syncGymRowsByExternalId).not.toHaveBeenCalled();
    expect(notifyCollectionChange).toHaveBeenCalledWith('logs');
  });

  it('non-empty payload syncs with deleteOrphans false', async () => {
    const { writeCollection } = await import('./repository.js');
    const log = { id: 'L-1', loggedAt: '2026-05-01T00:00:00.000Z', action: 'member.payment.added' };
    await writeCollection('apg.logs', [log]);
    expect(syncGymRowsByExternalId).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ deleteOrphans: false }),
    );
  });
});
