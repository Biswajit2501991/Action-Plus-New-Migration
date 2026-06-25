import { test, expect } from '../fixtures/auth.fixture';
import { apiHealthOk, getSettings, putRoleTemplates, putSettingsBulk } from '../utils/api-client';

test.describe('@critical Role template anti-duplicate', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('GET /settings returns at most one Front Desk Manager role template', async ({ ownerToken }) => {
    const settings = (await getSettings(ownerToken)) as { roleTemplates?: Array<{ id?: string; title?: string }> };
    const roles = Array.isArray(settings.roleTemplates) ? settings.roleTemplates : [];
    const frontDesk = roles.filter((r) => String(r.title || '').trim() === 'Front Desk Manager');
    expect(frontDesk.length).toBeLessThanOrEqual(1);
  });

  test('PUT /settings/role-templates with duplicate rows collapses to one in GET', async ({ ownerToken }) => {
    const dupes = Array.from({ length: 5 }, () => ({
      id: crypto.randomUUID(),
      title: 'Front Desk Manager',
      subtitle: 'Member and Front Desk Ops',
      sections: ['Dashboard', 'Members'],
      color: 'bg-amber-50 border-amber-200',
    }));
    const saved = await putRoleTemplates(ownerToken, dupes);
    expect(saved.roleTemplates.length).toBe(1);
    const after = (await getSettings(ownerToken)) as { roleTemplates?: Array<{ title?: string }> };
    const frontDesk = (after.roleTemplates || []).filter((r) => r.title === 'Front Desk Manager');
    expect(frontDesk.length).toBe(1);
  });

  test('settings bulk without roleTemplates does not multiply role rows', async ({ ownerToken }) => {
    const before = (await getSettings(ownerToken)) as { roleTemplates?: unknown[]; fineSmsGraceDays?: number };
    const single = [{
      id: 'frontdesk',
      title: 'Front Desk Manager',
      subtitle: 'Member and Front Desk Ops',
      sections: ['Dashboard', 'Members'],
      color: 'bg-amber-50 border-amber-200',
    }];
    await putRoleTemplates(ownerToken, single);
    // Use minimal bulk payload: this scenario verifies role-template dedupe is
    // unaffected by unrelated settings writes, not full snapshot rewrite cost.
    await putSettingsBulk(ownerToken, { fineSmsGraceDays: Number(before.fineSmsGraceDays || 0) });
    const after = (await getSettings(ownerToken)) as { roleTemplates?: Array<{ title?: string }> };
    const frontDesk = (after.roleTemplates || []).filter((r) => r.title === 'Front Desk Manager');
    expect(frontDesk.length).toBe(1);
  });
});
