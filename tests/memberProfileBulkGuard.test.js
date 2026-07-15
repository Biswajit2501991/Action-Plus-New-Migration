import { describe, expect, it } from 'vitest';
import {
  isValidMemberDob,
  preserveProfileFieldsOnBulkRow,
} from '../backend/src/db/supabase/memberProfileBulkGuard.js';

describe('memberProfileBulkGuard', () => {
  it('rejects placeholder DOB', () => {
    expect(isValidMemberDob('1970-01-01')).toBe(false);
    expect(isValidMemberDob('1990-05-15')).toBe(true);
  });

  it('keeps existing birthday when bulk sends placeholder', () => {
    const row = preserveProfileFieldsOnBulkRow(
      { member_code: 'APG-1', dob: '1970-01-01', updated_at: '2026-01-01T00:00:00.000Z' },
      { dob: '1990-05-15', updated_at: '2026-01-02T00:00:00.000Z' },
      { updatedAt: '2026-01-01T00:00:00.000Z' },
    );
    expect(row.dob).toBe('1990-05-15');
  });

  it('keeps newer DB birthday when bulk snapshot is stale', () => {
    const row = preserveProfileFieldsOnBulkRow(
      { member_code: 'APG-1', dob: '1985-03-10', updated_at: '2026-01-01T00:00:00.000Z' },
      { dob: '1990-05-15', updated_at: '2026-01-05T12:00:00.000Z' },
      { updatedAt: '2026-01-01T00:00:00.000Z' },
    );
    expect(row.dob).toBe('1990-05-15');
  });
});
