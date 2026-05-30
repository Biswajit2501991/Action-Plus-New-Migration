import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runWithGymContext } from '../requestContext.js';

const readJsonValue = vi.fn();

vi.mock('../db/dataStore.js', () => ({
  readJsonValue: (...args) => readJsonValue(...args),
}));

vi.mock('../db/supabase/client.js', () => ({
  gymId: vi.fn(() => 'gym-test-1'),
}));

import { readSettingsDeduped, resetSettingsReadDedupeForTests } from './settingsReadService.js';

describe('readSettingsDeduped', () => {
  beforeEach(() => {
    resetSettingsReadDedupeForTests();
    readJsonValue.mockReset();
  });

  it('dedupes concurrent reads for the same scope', async () => {
    let resolve;
    readJsonValue.mockImplementation(() => new Promise((r) => { resolve = r; }));

    await runWithGymContext({ gymId: 'gym-test-1' }, async () => {
      const a = readSettingsDeduped(null, { scope: 'core' });
      const b = readSettingsDeduped(null, { scope: 'core' });
      expect(readJsonValue).toHaveBeenCalledTimes(1);
      expect(readJsonValue).toHaveBeenCalledWith('apg.settings', {}, null, {
        scope: 'core',
        auth: null,
        staffAccess: null,
      });
      resolve({ plans: ['Basic'] });
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra).toEqual({ plans: ['Basic'] });
      expect(rb).toEqual({ plans: ['Basic'] });
    });
  });

  it('runs separate reads for different scopes', async () => {
    readJsonValue
      .mockResolvedValueOnce({ plans: [] })
      .mockResolvedValueOnce({ leaveRequests: [] });

    await runWithGymContext({ gymId: 'gym-test-1' }, async () => {
      await readSettingsDeduped(null, { scope: 'core' });
      await readSettingsDeduped(null, { scope: 'leave' });
      expect(readJsonValue).toHaveBeenCalledTimes(2);
    });
  });

  it('allows a new read after the first completes', async () => {
    readJsonValue.mockResolvedValue({ plans: ['A'] });

    await runWithGymContext({ gymId: 'gym-test-1' }, async () => {
      await readSettingsDeduped(null, { scope: 'core' });
      await readSettingsDeduped(null, { scope: 'core' });
      expect(readJsonValue).toHaveBeenCalledTimes(2);
    });
  });
});
