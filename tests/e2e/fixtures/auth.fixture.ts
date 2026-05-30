import { test as base, expect } from '@playwright/test';
import { apiHealthOk, loginOwner } from '../utils/api-client';
import { LoginPage } from '../pages/LoginPage';

type AuthFixtures = {
  ownerToken: string;
  loginAsOwner: void;
};

export const test = base.extend<AuthFixtures>({
  ownerToken: async ({}, use) => {
    const ok = await apiHealthOk();
    if (!ok && process.env.E2E_REQUIRE_BACKEND !== '0') {
      test.skip(true, 'Supabase backend not available at E2E_API_URL');
    }
    const session = await loginOwner();
    await use(session.token);
  },

  loginAsOwner: async ({ page, ownerToken }, use) => {
    await page.goto('/index.html');
    await page.evaluate(
      ({ token }) => {
        const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
        localStorage.setItem(
          'apg.auth.session',
          JSON.stringify({ userId: 'owner', token, expiresAt }),
        );
      },
      { token: ownerToken },
    );
    await page.reload();
    await page.getByRole('button', { name: 'Dashboard' }).or(
      page.getByRole('heading', { name: 'Staff Management' }),
    ).first().waitFor({ timeout: 30_000 });
    await use();
  },
});

export { expect };
