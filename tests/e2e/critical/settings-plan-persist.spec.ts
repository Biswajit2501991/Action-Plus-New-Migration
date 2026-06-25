import { test, expect } from '../fixtures/auth.fixture';
import { apiHealthOk, deleteSettingsLookup, getSettings } from '../utils/api-client';

/**
 * Settings lookup persistence: add Plan + Gender via UI, survive reload, teardown via API.
 */
test.describe('@critical Settings lookup persistence', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  async function addLookupInPanel(
    page: import('@playwright/test').Page,
    ownerToken: string,
    key: 'plans' | 'genders',
    label: RegExp,
    value: string,
  ) {
    const panel = page.getByTestId(`settings-panel-${key}`);
    const toggle = panel.getByRole('button', { name: label });
    const expanded = await toggle.getAttribute('aria-expanded');
    if (expanded !== 'true') {
      await toggle.click();
    }
    await panel.getByTestId(`settings-input-${key}`).fill(value);
    await panel.getByTestId(`settings-add-${key}`).click();
    await expect
      .poll(async () => {
        const settings = (await getSettings(ownerToken)) as Record<string, unknown>;
        const list = Array.isArray(settings[key]) ? settings[key] : [];
        return list.includes(value);
      }, { timeout: 20_000 })
      .toBe(true);
  }

  test('owner: add plan and gender in Settings persist after reload', async ({ page, loginAsOwner, ownerToken }) => {
    const stamp = Date.now();
    const planName = `e2e-plan-${stamp}`;
    const genderName = `e2e-gender-${stamp}`;
    try {
      await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: 15_000 });

      await addLookupInPanel(page, ownerToken, 'plans', /Plans/i, planName);
      await addLookupInPanel(page, ownerToken, 'genders', /Genders/i, genderName);

      await page.reload();
      await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: 30_000 });

      const settings = (await getSettings(ownerToken)) as { plans?: string[]; genders?: string[] };
      expect(settings.plans || []).toContain(planName);
      expect(settings.genders || []).toContain(genderName);
    } finally {
      await deleteSettingsLookup(ownerToken, 'plans', planName).catch(() => {});
      await deleteSettingsLookup(ownerToken, 'genders', genderName).catch(() => {});
      const cleaned = (await getSettings(ownerToken).catch(() => null)) as {
        plans?: string[];
        genders?: string[];
      } | null;
      if (cleaned) {
        expect(cleaned.plans || []).not.toContain(planName);
        expect(cleaned.genders || []).not.toContain(genderName);
      }
    }
  });
});
