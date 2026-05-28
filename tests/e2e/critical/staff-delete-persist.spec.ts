import { test, expect } from '../fixtures/auth.fixture';
import {
  apiHealthOk,
  cleanupStaffUsers,
  listStaff,
  upsertStaff,
} from '../utils/api-client';
import { buildStaffUser } from '../factories/staff.factory';
import { StaffManagementPage } from '../pages/StaffManagementPage';

test.describe('@critical Staff delete persistence', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('API: cleanup matches username case-insensitively', async ({ ownerToken }) => {
    const mixedCaseId = `E2eDelCase-${Date.now()}`;
    const staff = buildStaffUser({ id: mixedCaseId, name: 'Delete Case Match' });
    await upsertStaff(ownerToken, staff);

    try {
      const out = await cleanupStaffUsers(ownerToken, [mixedCaseId.toLowerCase()]);
      expect(out.ok).toBe(true);
      expect(out.deleted.map((x) => String(x).toLowerCase())).toContain(mixedCaseId.toLowerCase());

      const after = await listStaff(ownerToken);
      expect(after.find((u) => String(u.id || '').toLowerCase() === mixedCaseId.toLowerCase())).toBeUndefined();
    } finally {
      await cleanupStaffUsers(ownerToken, [mixedCaseId]).catch(() => {});
    }
  });

  test('UI: owner delete removes staff and stays removed after refresh', async ({ page, ownerToken, loginAsOwner }) => {
    const id = `e2e-delete-ui-${Date.now()}`;
    const staff = buildStaffUser({ id, name: 'Delete Persist UI' });
    await upsertStaff(ownerToken, staff);

    try {
      const staffPage = new StaffManagementPage(page);
      await staffPage.open();
      await expect(staffPage.staffRow(id)).toBeVisible({ timeout: 20_000 });

      page.once('dialog', (dialog) => dialog.accept());
      const cleanupPromise = page.waitForResponse(
        (res) => res.url().includes('/api/users/cleanup') && res.request().method() === 'POST',
        { timeout: 30_000 },
      );

      await staffPage.staffRow(id).first().getByRole('button', { name: 'Delete' }).first().click();
      const cleanupRes = await cleanupPromise;
      expect(cleanupRes.ok()).toBeTruthy();

      const body = await cleanupRes.json();
      const deleted = Array.isArray(body?.deleted) ? body.deleted.map((x: unknown) => String(x)) : [];
      expect(deleted).toContain(id);

      await expect(staffPage.staffRow(id)).toHaveCount(0, { timeout: 15_000 });
      await page.reload();
      await staffPage.open();
      await expect(staffPage.staffRow(id)).toHaveCount(0, { timeout: 20_000 });
    } finally {
      await cleanupStaffUsers(ownerToken, [id]).catch(() => {});
    }
  });
});
