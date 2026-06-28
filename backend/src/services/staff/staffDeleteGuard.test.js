import { describe, expect, it } from 'vitest';
import {
  findStaffDeleteDependenciesBatch,
  isTestStaffUser,
} from './staffDeleteGuard.js';

describe('staffDeleteGuard', () => {
  it('returns empty map when no login ids provided', async () => {
    const out = await findStaffDeleteDependenciesBatch([]);
    expect(out.size).toBe(0);
  });

  describe('isTestStaffUser', () => {
    it('returns true when testProfile is true', () => {
      expect(isTestStaffUser('reception', { testProfile: true })).toBe(true);
    });

    it('returns true when id starts with e2e-staff- (case-insensitive)', () => {
      expect(isTestStaffUser('e2e-staff-abc', null)).toBe(true);
      expect(isTestStaffUser('E2E-STAFF-xyz', null)).toBe(true);
    });

    it('returns false for production staff', () => {
      expect(isTestStaffUser('reception', { testProfile: false })).toBe(false);
      expect(isTestStaffUser('trainer-1', null)).toBe(false);
    });
  });
});
