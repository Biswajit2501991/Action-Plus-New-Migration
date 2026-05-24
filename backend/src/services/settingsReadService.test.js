import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runWithGymContext } from '../requestContext.js';

vi.mock('../db/supabase/repository.js', () => ({
  readSettingsValue: vi.fn(),
}));

vi.mock('../db/supabase/client.js', () => ({
  gymId: vi.fn(() => 'gym-test-1'),
}));

import { readSettingsValue } from '../db/supabase/repository.js';
import { readSettingsDeduped, resetSettingsReadDedupeForTests } from './settingsReadService.js';

describe('readSettingsDeduped', () => {
  beforeEach(() => {
    resetSettingsReadDedupeForTests();
    vi.mocked(readSettingsValue).mockReset();
  });

  it('dedupes concurrent reads for the same scope', async () => {
    let resolve;
    vi.mocked(readSettingsValue).mockImplementation(() => new Promise((r) => { resolve = r; }));

    await runWithGymContext({ gymId: 'gym-test-1' }, async () => {
      const a = readSettingsDeduped(null, { scope: 'core' });
      const b = readSettingsDeduped(null, { scope: 'core' });
      expect(readSettingsValue).toHaveBeenCalledTimes(1);
      resolve({ plans: ['Basic'] });
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra).toEqual({ plans: ['Basic'] });
      expect(rb).toEqual({ plans: ['Basic'] });
    });
  });

  it('runs separate reads for different scopes', async () => {
    vi.mocked(readSettingsValue)
      .mockResolvedValueOnce({ plans: [] })
      .mockResolvedValueOnce({ leaveRequests: [] });

    await runWithGymContext({ gymId: 'gym-test-1' }, async () => {
      await readSettingsDeduped(null, { scope: 'core' });
      await readSettingsDeduped(null, { scope: 'leave' });
      expect(readSettingsValue).toHaveBeenCalledTimes(2);
    });
  });

  it('allows a new read after the first completes', async () => {
    vi.mocked(readSettingsValue).mockResolvedValue({ plans: ['A'] });

    await runWithGymContext({ gymId: 'gym-test-1' }, async () => {
      await readSettingsDeduped(null, { scope: 'core' });
      await readSettingsDeduped(null, { scope: 'core' });
      expect(readSettingsValue).toHaveBeenCalledTimes(2);
    });
  });
});
