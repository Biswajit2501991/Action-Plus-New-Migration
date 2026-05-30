import { test, expect } from '@playwright/test';
import { apiHealthOk, login } from '../utils/api-client';
import { LoginPage } from '../pages/LoginPage';

/**
 * Session management regression for IST staff (e.g. Deep).
 *
 * Verifies the monolithic app keeps a staff session alive across:
 *   - login with production credentials
 *   - simulated near-expiry localStorage (sliding renewal on activity)
 *   - manual logout
 *
 * Credentials: set E2E_DEEP_ID and E2E_DEEP_PASSWORD in the environment.
 * Identifier is case-insensitive server-side; we default to "Deep".
 */

const DEEP_ID = process.env.E2E_DEEP_ID || 'Deep';
const DEEP_PASSWORD = process.env.E2E_DEEP_PASSWORD || '';

test.describe('@critical Staff session (Deep)', () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
    test.skip(!DEEP_PASSWORD, 'Set E2E_DEEP_PASSWORD to run the Deep staff session test');
  });

  test('Deep: login, session survives near-expiry + activity, logout', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(DEEP_ID, DEEP_PASSWORD);

    await expect(page.getByRole('button', { name: 'Dashboard' }).first()).toBeVisible({ timeout: 30_000 });

    const sessionAfterLogin = await page.evaluate(() => {
      const raw = localStorage.getItem('apg.auth.session');
      if (!raw) return null;
      return JSON.parse(raw) as { userId: string; token: string; expiresAt: number; lastActivityAt?: number };
    });
    expect(sessionAfterLogin?.token, 'missing JWT after login').toBeTruthy();
    expect(sessionAfterLogin?.userId?.toLowerCase()).toBe(DEEP_ID.toLowerCase());

    const msUntilExpiry = Number(sessionAfterLogin?.expiresAt || 0) - Date.now();
    // Sliding TTL is 2h (aligned with JWT_EXPIRES_IN), not the old 15m cap.
    expect(msUntilExpiry, 'session should be valid for hours, not minutes').toBeGreaterThan(60 * 60 * 1000);

    // Simulate the old failure mode: session blob about to expire, then user activity.
    await page.evaluate(() => {
      const key = 'apg.auth.session';
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      if (!parsed) return;
      const now = Date.now();
      parsed.expiresAt = now + 20_000;
      parsed.lastActivityAt = now - 1000;
      localStorage.setItem(key, JSON.stringify(parsed));
    });

    // Login fires many pointer events; wait out the 4s debounce unless urgent
    // renewal applies (session within 10m of expiry).
    await page.getByRole('button', { name: 'Members' }).first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Dashboard' }).first().click();
    await page.waitForTimeout(300);

    const sessionAfterActivity = await page.evaluate(() => {
      const raw = localStorage.getItem('apg.auth.session');
      if (!raw) return null;
      return JSON.parse(raw) as { expiresAt: number; lastActivityAt?: number };
    });
    const renewedMs = Number(sessionAfterActivity?.expiresAt || 0) - Date.now();
    expect(renewedMs, 'activity should extend the sliding session window').toBeGreaterThan(60 * 60 * 1000);

    await expect(page.getByRole('button', { name: 'Dashboard' }).first()).toBeVisible();

    // API still accepts the same token after the near-expiry scare.
    const apiSession = await login(DEEP_ID, DEEP_PASSWORD);
    expect(apiSession.token).toBeTruthy();

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('button', { name: 'LOGIN' })).toBeVisible({ timeout: 15_000 });

    const cleared = await page.evaluate(() => localStorage.getItem('apg.auth.session'));
    expect(cleared).toBeNull();
  });
});
