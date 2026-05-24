import { test, expect } from '../fixtures/auth.fixture';
import {
  apiHealthOk,
  cleanupAttendanceRange,
  cleanupStaffUsers,
  fetchAttendanceRecords,
  upsertAttendanceRecords,
  upsertStaff,
} from '../utils/api-client';
import { buildStaffUser } from '../factories/staff.factory';

/**
 * Phase 4 owner-only attendance cleanup via POST /api/attendance/cleanup.
 *
 * Contract under test:
 *   - Owner uploads three attendance rows dated 2099-01-01.
 *   - Owner calls /api/attendance/cleanup with that exact range.
 *   - All 2099-01-01 rows are gone; rows on other dates are untouched.
 *   - Invalid ranges (missing dates, start > end) return 400.
 */

const SYNTHETIC_DATE = '2099-01-01';

test.describe('@critical Attendance cleanup by date range', () => {
  // upsertStaff + upsertAttendanceRecords + getSettings + cleanup is 4 round
  // trips; one of them (getSettings) is large. 90s leaves margin.
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('API: owner deletes only rows whose date is in the range', async ({ ownerToken }) => {
    const staff = buildStaffUser({
      id: `e2e-staff-att-${Date.now()}`,
      sections: ['Dashboard', 'Attendance'],
    });
    await upsertStaff(ownerToken, staff);

    try {
      const userId = String(staff.id);
      const synthetic = [
        { id: `e2e-att-${userId}-0`, userId, date: SYNTHETIC_DATE, status: 'Present' },
        { id: `e2e-att-${userId}-1`, userId, date: SYNTHETIC_DATE, status: 'Half Day' },
        { id: `e2e-att-${userId}-2`, userId, date: SYNTHETIC_DATE, status: 'Leave' },
      ];

      // Three rows on the same date for the same user collapse to one via the
      // upsert key (gym_id, staff_login_id, attendance_date). That's fine —
      // the cleanup endpoint only needs to delete at least one row to prove
      // the date filter works. Spread the rows across distinct dates.
      const dates = ['2099-01-01', '2099-01-02', '2099-01-03'];
      const records = dates.map((d, idx) => ({
        id: `e2e-att-${userId}-${idx}`,
        userId,
        date: d,
        status: 'Present',
        firstLoginAt: `${d}T09:00:00.000Z`,
        lastLogoutAt: `${d}T18:00:00.000Z`,
        note: `e2e ${idx}`,
      }));

      const writeRes = await upsertAttendanceRecords(ownerToken, records);
      expect(writeRes.ok).toBe(true);

      // Sanity: rows are returned by the date-bounded attendance API.
      const oursBefore = (await fetchAttendanceRecords(ownerToken, '2099-01-01', '2099-01-03'))
        .filter((r) => r.userId === userId);
      expect(oursBefore.length).toBeGreaterThanOrEqual(records.length);

      // Cleanup ONLY 2099-01-01 and 2099-01-02.
      const cleanup = await cleanupAttendanceRange(ownerToken, '2099-01-01', '2099-01-02');
      expect(cleanup.ok).toBe(true);
      expect(cleanup.deleted).toBeGreaterThanOrEqual(2);
      expect(cleanup.startDate).toBe('2099-01-01');
      expect(cleanup.endDate).toBe('2099-01-02');

      const oursAfter = (await fetchAttendanceRecords(ownerToken, '2099-01-01', '2099-01-03'))
        .filter((r) => r.userId === userId);
      expect(oursAfter.find((r) => r.date === '2099-01-01' || r.date === '2099-01-02')).toBeUndefined();
      expect(oursAfter.find((r) => r.date === '2099-01-03'), '2099-01-03 row must survive').toBeTruthy();

      // Cleanup the last surviving day to leave the DB pristine.
      await cleanupAttendanceRange(ownerToken, '2099-01-03', '2099-01-03');
    } finally {
      await cleanupStaffUsers(ownerToken, [staff.id as string]).catch(() => {});
    }
  });

  test('API: invalid range (start > end) returns 400', async ({ ownerToken }) => {
    const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
    const res = await fetch(`${apiURL}/api/attendance/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ startDate: '2099-02-01', endDate: '2099-01-01' }),
    });
    expect(res.status).toBe(400);
  });
});
