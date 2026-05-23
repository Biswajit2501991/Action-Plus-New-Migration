import { test, expect } from '../fixtures/auth.fixture';
import {
  addSettingsLookup,
  apiHealthOk,
  deleteSettingsLookup,
  getSettings,
  putSettingsBulk,
} from '../utils/api-client';

/**
 * Master Data must not be wiped by empty bulk payloads or poisoned config reads.
 */
test.describe('@critical Settings lookup anti-wipe', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('bulk PUT with empty lookup arrays does not remove existing plans', async ({ ownerToken }) => {
    const stamp = Date.now();
    const planName = `e2e-anti-wipe-${stamp}`;
    try {
      await addSettingsLookup(ownerToken, 'plans', planName);
      const before = (await getSettings(ownerToken)) as { plans?: string[] };
      expect(before.plans || []).toContain(planName);

      const poisoned = {
        ...before,
        plans: [],
        statuses: [],
        paymentMethods: [],
        holdDurations: [],
        genders: [],
        expenseCategories: [],
        exerciseTypes: [],
      };
      await putSettingsBulk(ownerToken, poisoned);

      const after = (await getSettings(ownerToken)) as { plans?: string[] };
      expect(after.plans || []).toContain(planName);
    } finally {
      await deleteSettingsLookup(ownerToken, 'plans', planName).catch(() => {});
    }
  });
});
