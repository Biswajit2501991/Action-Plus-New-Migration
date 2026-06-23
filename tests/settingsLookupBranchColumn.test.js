import { describe, expect, it, beforeEach } from 'vitest';
import {
  resetSettingsLookupBranchColumnCache,
  settingsLookupHasBranchColumn,
} from '../backend/src/db/supabase/settingsLookupBranchId.js';

describe('settingsLookupHasBranchColumn', () => {
  beforeEach(() => {
    resetSettingsLookupBranchColumnCache();
  });

  it('returns true when created_by_gym_code_id is selectable', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          limit: async () => ({ error: null }),
        }),
      }),
    };
    await expect(settingsLookupHasBranchColumn(sb)).resolves.toBe(true);
    await expect(settingsLookupHasBranchColumn(sb)).resolves.toBe(true);
  });

  it('returns false when column is missing from the table', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          limit: async () => ({
            error: { message: 'column settings_lookup_values.created_by_gym_code_id does not exist' },
          }),
        }),
      }),
    };
    await expect(settingsLookupHasBranchColumn(sb)).resolves.toBe(false);
  });

  it('caches the probe result', async () => {
    let calls = 0;
    const sb = {
      from: () => ({
        select: () => ({
          limit: async () => {
            calls += 1;
            return { error: null };
          },
        }),
      }),
    };
    await settingsLookupHasBranchColumn(sb);
    await settingsLookupHasBranchColumn(sb);
    expect(calls).toBe(1);
  });
});
