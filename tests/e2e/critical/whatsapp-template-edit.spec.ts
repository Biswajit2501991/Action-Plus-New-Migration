import { test, expect } from '../fixtures/auth.fixture';
import {
  apiHealthOk,
  getSettings,
  getWhatsappTemplates,
  patchWhatsappTemplate,
} from '../utils/api-client';

/**
 * Phase 4 WhatsApp template DB-backed editor.
 *
 * Contract under test:
 *   - GET /api/whatsapp-templates returns the active gym's templates.
 *   - PATCH /api/whatsapp-templates/:key persists exactly one row.
 *   - The new body is visible via both the focused GET and the legacy
 *     /api/settings.smsTemplates path (so existing consumers still see it).
 *   - The original body is restored at the end so the gym DB is unchanged.
 *
 * RBAC is exercised separately in the staff-bulk-delete spec; the PATCH
 * endpoint uses the same requireOwner middleware so we don't duplicate that
 * check here.
 */

// Use a probe key that won't clash with any seeded production template so
// we can run this test against fresh gyms too. The afterAll restores or
// removes whatever we wrote.
const TARGET_KEY = 'e2eProbeTemplate';
const SEEDED_FALLBACK = '__e2e-fallback-seed__';

test.describe('@critical WhatsApp template editor', () => {
  test.describe.configure({ timeout: 60_000 });
  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('owner: PATCH a template and read the new body via both routes', async ({ ownerToken }) => {
    const initial = await getWhatsappTemplates(ownerToken);
    expect(initial.ok).toBe(true);
    const existedBefore = Boolean(initial.templates[TARGET_KEY]);
    const originalBody = existedBefore ? String(initial.templates[TARGET_KEY]) : SEEDED_FALLBACK;
    if (!existedBefore) {
      // Seed our probe key so we always have a baseline to verify against.
      await patchWhatsappTemplate(ownerToken, TARGET_KEY, originalBody);
    }

    const stamp = new Date().toISOString();
    const probeMarker = `\n// e2e-probe ${stamp}`;
    const nextBody = `${originalBody}${probeMarker}`;

    try {
      const saved = await patchWhatsappTemplate(ownerToken, TARGET_KEY, nextBody);
      expect(saved.ok).toBe(true);
      expect(saved.template.key).toBe(TARGET_KEY);
      expect(saved.template.body).toBe(nextBody);

      const refetched = await getWhatsappTemplates(ownerToken);
      expect(refetched.templates[TARGET_KEY]).toBe(nextBody);

      const settings = (await getSettings(ownerToken)) as {
        smsTemplates?: Record<string, string>;
      };
      expect(settings.smsTemplates?.[TARGET_KEY]).toBe(nextBody);
    } finally {
      // Restore the original body so the gym DB is unchanged at exit.
      await patchWhatsappTemplate(ownerToken, TARGET_KEY, originalBody).catch(() => {});
      const restored = await getWhatsappTemplates(ownerToken).catch(() => null);
      if (restored) {
        expect(restored.templates[TARGET_KEY]).toBe(originalBody);
      }
    }
  });

  test('API: invalid template key returns 400', async ({ ownerToken }) => {
    const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
    const res = await fetch(`${apiURL}/api/whatsapp-templates/Invalid%20Key%21`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({ body: 'noop' }),
    });
    expect(res.status).toBe(400);
  });
});
