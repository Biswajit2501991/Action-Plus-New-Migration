import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  resetVisitorsSchemaCacheForTests,
  stripVisitorGymCodeColumn,
  visitorsHaveGymCodeColumn,
} from './visitorsSchema.js';

describe('visitorsHaveGymCodeColumn', () => {
  beforeEach(() => {
    resetVisitorsSchemaCacheForTests();
  });

  it('returns true when column probe succeeds', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({ error: null }),
        }),
      }),
    };
    await expect(visitorsHaveGymCodeColumn(sb)).resolves.toBe(true);
    await expect(visitorsHaveGymCodeColumn(sb)).resolves.toBe(true);
  });

  it('returns false when column is missing', async () => {
    const sb = {
      from: () => ({
        select: () => ({
          limit: () => Promise.resolve({
            error: { message: "Could not find the 'assigned_gym_code_id' column of 'visitors'" },
          }),
        }),
      }),
    };
    await expect(visitorsHaveGymCodeColumn(sb)).resolves.toBe(false);
  });
});

describe('stripVisitorGymCodeColumn', () => {
  it('removes assigned_gym_code_id from row payload', () => {
    const out = stripVisitorGymCodeColumn({
      gym_id: 'g1',
      external_visitor_id: 'V-1',
      assigned_gym_code_id: 'code-uuid',
      full_name: 'Test',
    });
    expect(out.assigned_gym_code_id).toBeUndefined();
    expect(out.full_name).toBe('Test');
  });
});
