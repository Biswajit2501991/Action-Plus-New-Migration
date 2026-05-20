import { test, expect } from '../fixtures/auth.fixture';
import { buildStaffUser } from '../factories/staff.factory';
import { listStaff, setStaffPassword, upsertStaff } from '../utils/api-client';
import { StaffManagementPage } from '../pages/StaffManagementPage';

test.describe('@critical @regression Owner staff management', () => {
  test('API: create staff then set password (order matches production)', async ({ ownerToken }) => {
    const staff = buildStaffUser({ sections: ['Dashboard', 'Members', 'Settings', 'Logs'] });
    const password = 'E2eTestPass1!';

    await upsertStaff(ownerToken, staff);
    await setStaffPassword(ownerToken, staff.id as string, password);

    const remote = await listStaff(ownerToken);
    const row = remote.find((u) => u.id === staff.id);
    expect(row, 'staff row must exist in Supabase after upsert').toBeTruthy();
  });

  test('UI: owner adds staff from Staff tab', async ({ page, loginAsOwner }) => {
    const staff = buildStaffUser();
    const staffPage = new StaffManagementPage(page);

    await staffPage.open();
    await staffPage.openAddModal();
    await staffPage.fillForm({
      username: staff.id as string,
      password: 'E2eUiPass1!',
      name: staff.name as string,
      email: staff.email as string,
      sections: ['Dashboard', 'Members'],
    });

    const bulkPromise = page.waitForResponse(
      (res) => res.url().includes('/api/users/bulk') && res.request().method() === 'PUT',
      { timeout: 30_000 },
    );
    const pwPromise = page.waitForResponse(
      (res) => res.url().includes('/api/auth/admin-set-password') && res.status() === 200,
      { timeout: 30_000 },
    );

    await staffPage.save();

    const bulkRes = await bulkPromise;
    expect(bulkRes.ok(), `users/bulk failed: ${bulkRes.status()}`).toBeTruthy();
    const pwRes = await pwPromise;
    expect(pwRes.ok()).toBeTruthy();

    await expect(staffPage.staffRow(staff.id as string)).toBeVisible({ timeout: 15_000 });
  });

  test('authorization: reception cannot call users bulk', async ({ ownerToken }) => {
    const receptionLogin = await fetch(
      `${process.env.E2E_API_URL || 'http://127.0.0.1:4000'}/api/auth/login`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: process.env.E2E_RECEPTION_ID || 'reception',
          password: process.env.E2E_RECEPTION_PASSWORD || 'reception',
        }),
      },
    );
    if (!receptionLogin.ok) {
      test.skip(true, 'reception test user not configured in Supabase');
    }
    const { token } = await receptionLogin.json();
    const res = await fetch(
      `${process.env.E2E_API_URL || 'http://127.0.0.1:4000'}/api/users/bulk`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ users: [] }),
      },
    );
    expect(res.status).toBe(403);
  });
});
