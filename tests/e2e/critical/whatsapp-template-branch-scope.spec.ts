import { test, expect } from '../fixtures/auth.fixture';
import { LoginPage } from '../pages/LoginPage';
import { buildStaffUser } from '../factories/staff.factory';
import {
  apiHealthOk,
  listGymCodes,
  upsertStaff,
  setStaffPassword,
  login,
  getWhatsappTemplates,
} from '../utils/api-client';

test.describe('@critical WhatsApp template branch scope + support picker', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('API: staff token cannot read another branch template scope', async ({ ownerToken }) => {
    const codes = await listGymCodes(ownerToken);
    if (codes.length < 2) {
      test.skip(true, 'Need at least 2 gym codes for branch scope test');
    }
    const ownBranch = codes[0].id;
    const otherBranch = codes[1].id;

    const staffPassword = `Pw-${Date.now()}-Aa1!`;
    const staff = buildStaffUser({
      sections: ['Dashboard', 'Members', 'WhatsApp SMS', 'Support', 'Logs'],
      access: {
        whatsapp: {
          viewReminder: true,
          viewMonthReminder: true,
          viewSuccess: true,
          viewFine: true,
          viewDeactivate: true,
          viewHold: true,
          viewWelcome: true,
          viewTemplates: true,
        },
        support: {
          viewSupportTemplates: true,
          editSupportTemplates: true,
        },
      },
      gymCodeId: ownBranch,
      staffRole: 'staff',
      blocked: false,
    });

    await upsertStaff(ownerToken, staff);
    await setStaffPassword(ownerToken, String(staff.id), staffPassword);

    const staffSession = await login(String(staff.id), staffPassword);
    const scoped = await getWhatsappTemplates(staffSession.token, otherBranch);
    expect(scoped.ok).toBe(true);
    expect(String(scoped.gymCodeId || '')).toBe(String(ownBranch));
    expect(String(scoped.gymCodeId || '')).not.toBe(String(otherBranch));
  });

  test('UI: owner support page shows branch switcher + template picker', async ({ page, loginAsOwner }) => {
    await loginAsOwner;

    await page.getByRole('button', { name: 'Support' }).click();
    await expect(page.getByRole('heading', { name: 'Support Templates' })).toBeVisible();

    const branchSelect = page.getByTestId('support-template-branch-select');
    const templateSelect = page.getByTestId('support-template-key-select');
    const preview = page.getByTestId('support-template-preview');

    await expect(branchSelect).toBeVisible();
    await expect(templateSelect).toBeVisible();
    await expect(preview).toBeVisible();

    await templateSelect.selectOption('fine');
    await expect(preview).not.toHaveValue('');
  });

  test('UI: staff support page hides branch switcher, keeps scoped template picker', async ({ page, ownerToken }) => {
    const codes = await listGymCodes(ownerToken);
    if (codes.length < 1) {
      test.skip(true, 'No gym code found for staff scoped UI test');
    }
    const ownBranch = codes[0].id;

    const staffPassword = `Pw-${Date.now()}-Bb2!`;
    const staff = buildStaffUser({
      sections: ['Dashboard', 'Members', 'WhatsApp SMS', 'Support', 'Logs'],
      access: {
        whatsapp: {
          viewReminder: true,
          viewMonthReminder: true,
          viewSuccess: true,
          viewFine: true,
          viewDeactivate: true,
          viewHold: true,
          viewWelcome: true,
          viewTemplates: true,
        },
        support: {
          viewSupportTemplates: true,
          editSupportTemplates: true,
        },
      },
      gymCodeId: ownBranch,
      staffRole: 'staff',
      blocked: false,
    });
    await upsertStaff(ownerToken, staff);
    await setStaffPassword(ownerToken, String(staff.id), staffPassword);

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(String(staff.id), staffPassword);

    await page.getByRole('button', { name: 'Support' }).click();
    await expect(page.getByRole('heading', { name: 'Support Templates' })).toBeVisible();
    await expect(page.getByTestId('support-template-branch-select')).toHaveCount(0);
    await expect(page.getByTestId('support-template-key-select')).toBeVisible();
    await expect(page.getByTestId('support-template-preview')).toBeVisible();
  });
});
