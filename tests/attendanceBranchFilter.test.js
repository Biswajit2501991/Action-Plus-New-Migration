import { describe, expect, it } from 'vitest';
import { filterAttendanceRecordsForBranchScope } from '../backend/src/auth/branchScope.js';

describe('filterAttendanceRecordsForBranchScope', () => {
  const rows = [
    { userId: 'staff-a', date: '2026-06-01' },
    { userId: 'staff-b', date: '2026-06-01' },
  ];

  it('returns all rows when branch scope is not limited (master owner)', () => {
    const out = filterAttendanceRecordsForBranchScope(rows, {
      limited: false,
      staffLogins: null,
    });
    expect(out).toHaveLength(2);
  });

  it('filters to staff logins in active branch', () => {
    const out = filterAttendanceRecordsForBranchScope(rows, {
      limited: true,
      staffLogins: new Set(['staff-a']),
    });
    expect(out).toHaveLength(1);
    expect(out[0].userId).toBe('staff-a');
  });

  it('does not drop all rows when staffLogins is null on limited scope', () => {
    const out = filterAttendanceRecordsForBranchScope(rows, { limited: true, staffLogins: null });
    expect(out).toHaveLength(2);
  });
});
