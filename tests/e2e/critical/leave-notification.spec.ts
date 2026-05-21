import { test, expect } from '../fixtures/auth.fixture';
import {
  apiHealthOk,
  createLeaveRequest,
  getSettings,
  cleanupLeaveRequestsForUsers,
  setStaffPassword,
  upsertStaff,
  login,
} from '../utils/api-client';
import { buildStaffUser } from '../factories/staff.factory';

/**
 * Phase 4 leave-request + owner-notification E2E.
 *
 * The old behavior:
 *   - Staff submitted a leave via the LeaveTracker UI.
 *   - Local React state was updated.
 *   - The /api/settings/bulk sync route was OWNER-only, so non-owner writes were
 *     dropped silently.
 *   - Owner never received a notification because nothing reached Supabase.
 *
 * The new behavior tested here:
 *   - Staff POST /api/leave-requests directly.
 *   - The backend writes to apg.settings.leaveRequests with notifyCollectionChange.
 *   - Owner refetches /api/settings (or receives the SSE 'settings' broadcast)
 *     and the new request is visible.
 *
 * We also assert the cleanup endpoint actually removes test rows, which the
 * global teardown depends on.
 */

test.describe('@critical Leave request notification flow', () => {
  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('API: staff submits leave, owner sees it in /api/settings.leaveRequests', async ({ ownerToken }) => {
    // 1. Spin up a brand-new staff account with leave-tracker access.
    const staff = buildStaffUser({
      sections: ['Dashboard', 'Members', 'Settings', 'Leave Tracker'],
    });
    const password = 'E2eLeavePass1!';
    await upsertStaff(ownerToken, staff);
    await setStaffPassword(ownerToken, staff.id as string, password);

    const staffSession = await login(staff.id as string, password);
    expect(staffSession.token).toBeTruthy();

    // 2. Submit a leave request as the staff member.
    const startDate = '2026-06-01';
    const endDate = '2026-06-03';
    const reason = 'E2E test leave';
    const created = await createLeaveRequest(staffSession.token, {
      type: 'Sick',
      startDate,
      endDate,
      reason,
    });
    expect(created.ok).toBe(true);
    expect(created.request).toMatchObject({
      userId: staff.id,
      type: 'Sick',
      startDate,
      endDate,
      reason,
      status: 'Pending',
      days: 3,
    });
    expect(typeof created.request.id).toBe('string');
    expect(created.request.id.length).toBeGreaterThan(8);

    // 3. Owner pulls /api/settings — the new request must be visible.
    const settings = (await getSettings(ownerToken)) as { leaveRequests?: unknown[] };
    const leaveRequests = Array.isArray(settings.leaveRequests) ? settings.leaveRequests : [];
    const match = leaveRequests.find(
      (r) => (r as { id?: string }).id === created.request.id,
    );
    expect(match, 'owner must see the staff-submitted leave request').toBeTruthy();

    // 4. Clean up: delete the leave request + the staff account (idempotent).
    const cleanup = await cleanupLeaveRequestsForUsers(ownerToken, [staff.id as string]);
    expect(cleanup.ok).toBe(true);
    expect(cleanup.removed).toBeGreaterThanOrEqual(1);
  });

  test('API: staff cannot submit on behalf of another user', async ({ ownerToken }) => {
    // Staff A submitting for staff B should silently fall back to themselves
    // (the backend overrides userId for non-owners).
    const staff = buildStaffUser({
      sections: ['Dashboard', 'Members', 'Leave Tracker'],
    });
    const password = 'E2eLeavePass1!';
    await upsertStaff(ownerToken, staff);
    await setStaffPassword(ownerToken, staff.id as string, password);
    const session = await login(staff.id as string, password);

    const created = await createLeaveRequest(session.token, {
      userId: 'someone-else',
      type: 'Casual',
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      reason: 'spoof attempt',
    });
    expect(created.request.userId).toBe(staff.id);
    await cleanupLeaveRequestsForUsers(ownerToken, [staff.id as string]);
  });

  test('API: missing date range fails with 400', async ({ ownerToken }) => {
    const staff = buildStaffUser({
      sections: ['Dashboard', 'Leave Tracker'],
    });
    const password = 'E2eLeavePass1!';
    await upsertStaff(ownerToken, staff);
    await setStaffPassword(ownerToken, staff.id as string, password);
    const session = await login(staff.id as string, password);

    const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
    const res = await fetch(`${apiURL}/api/leave-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ type: 'Casual' }),
    });
    expect(res.status).toBe(400);
    await cleanupLeaveRequestsForUsers(ownerToken, [staff.id as string]);
  });
});
