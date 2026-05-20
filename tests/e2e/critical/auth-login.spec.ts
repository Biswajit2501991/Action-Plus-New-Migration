import { test, expect } from '@playwright/test';
import { apiHealthOk } from '../utils/api-client';
import { LoginPage } from '../pages/LoginPage';

test.describe('@critical @smoke Authentication', () => {
  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('owner can log in and sees primary navigation', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(
      process.env.E2E_OWNER_ID || 'owner',
      process.env.E2E_OWNER_PASSWORD || 'owner',
    );

    await expect(page.getByRole('button', { name: 'Dashboard' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Members' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Staff' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Settings' }).first()).toBeVisible();
  });

  test('invalid credentials show error', async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.usernameInput.fill('not-a-real-user');
    await login.passwordInput.fill('wrong-password');
    await login.submitButton.click();
    await expect(page.getByText('Invalid credential')).toBeVisible();
  });
});
