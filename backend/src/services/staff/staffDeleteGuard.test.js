import { describe, expect, it } from 'vitest';
import { findStaffDeleteDependenciesBatch } from './staffDeleteGuard.js';

describe('staffDeleteGuard', () => {
  it('returns empty map when no login ids provided', async () => {
    const out = await findStaffDeleteDependenciesBatch([]);
    expect(out.size).toBe(0);
  });
});
