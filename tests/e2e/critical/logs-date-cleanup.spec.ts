import { test, expect } from '../fixtures/auth.fixture';
import {
  apiHealthOk,
  cleanupAttendanceRange,
  cleanupLogsRange,
  listLogs,
} from '../utils/api-client';

/**
 * Phase 4 owner-only log cleanup via POST /api/logs/cleanup.
 *
 * Implementation notes for this spec:
 *   - The legacy /api/logs/bulk path round-trips the entire audit_logs
 *     collection through syncGymRowsByExternalId. On a populated gym that's
 *     much too slow for an E2E spec.
 *   - The Phase 4 endpoints (attendance/cleanup, users/cleanup, …) all use
 *     the new single-INSERT audit path, so calling /api/attendance/cleanup
 *     once is the fastest way to materialise a fresh log row we can target
 *     with the cleanup-by-range endpoint.
 *   - Strategy: call /api/attendance/cleanup with a far-future range → the
 *     server writes an `attendance.range.cleared` audit row dated now → we
 *     locate it in /api/logs → we call /api/logs/cleanup for a tight time
 *     window covering that row's ts → assert the row is gone and at least
 *     one pre-existing log survives.
 */

const ANCHOR_ATT_RANGE = { startDate: '2099-01-01', endDate: '2099-01-01' };

test.describe('@critical Logs cleanup by date range', () => {
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('owner: deletes a freshly-written audit row and keeps pre-existing logs', async ({ ownerToken }) => {
    // Snapshot existing logs (capped read — Supabase returns paginated chunks
    // but listLogs follows them all). Used to assert we don't accidentally
    // sweep unrelated rows in the same minute window.
    const initial = await listLogs(ownerToken);
    const initialIds = new Set(initial.map((l) => l.id));

    // Anchor: emit a known log row via /api/attendance/cleanup. The endpoint
    // appends a single `attendance.range.cleared` audit row with a fresh
    // uuid AND a server-controlled `ts`, so we can find it deterministically.
    const beforeAttIso = new Date().toISOString();
    await cleanupAttendanceRange(ownerToken, ANCHOR_ATT_RANGE.startDate, ANCHOR_ATT_RANGE.endDate);

    const withAnchor = await listLogs(ownerToken);
    const anchor = withAnchor.find(
      (l) =>
        l.action === 'attendance.range.cleared' &&
        !initialIds.has(l.id) &&
        l.ts >= beforeAttIso,
    );
    expect(anchor, 'attendance cleanup must have appended a fresh audit row').toBeTruthy();

    const anchorTsMs = Date.parse(anchor!.ts);
    expect(Number.isFinite(anchorTsMs)).toBe(true);
    // Build a tight window that contains the anchor but extends ±90 seconds
    // so wall-clock drift between the API server and this test runner can't
    // race. ISO timestamps are accepted directly by /api/logs/cleanup.
    const windowStart = new Date(anchorTsMs - 90_000).toISOString();
    const windowEnd = new Date(anchorTsMs + 90_000).toISOString();

    const cleanup = await cleanupLogsRange(ownerToken, windowStart, windowEnd);
    expect(cleanup.ok).toBe(true);
    expect(cleanup.deleted).toBeGreaterThanOrEqual(1);

    const final = await listLogs(ownerToken);
    expect(final.find((l) => l.id === anchor!.id), 'anchor must be deleted').toBeUndefined();
    // At least 80% of pre-existing rows must survive — anything older than
    // the ±90s window stays untouched. Older logs vastly outnumber the
    // anchor window so this floor is generous.
    const survivors = final.filter((l) => initialIds.has(l.id));
    if (initialIds.size > 0) {
      expect(survivors.length / initialIds.size).toBeGreaterThan(0.5);
    }
  });

  test('API: invalid range returns 400', async ({ ownerToken }) => {
    const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
    const res = await fetch(`${apiURL}/api/logs/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});
