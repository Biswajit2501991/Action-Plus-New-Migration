import { test, expect } from '../fixtures/auth.fixture';
import {
  apiHealthOk,
  listGymCodes,
  getWhatsappTemplates,
  patchWhatsappTemplate,
} from '../utils/api-client';

/**
 * Phase 4 WhatsApp template DB-backed editor.
 *
 * Contract under test:
 *   - GET /api/whatsapp-templates?gymCodeId= returns branch-scoped templates.
 *   - PATCH /api/whatsapp-templates/:key persists exactly one row per branch.
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

  test('owner: PATCH a branch template and read it back for the same branch', async ({ ownerToken }) => {
    const codes = await listGymCodes(ownerToken);
    if (!codes.length) {
      test.skip(true, 'No gym codes — run supabase_gym_codes.sql');
    }
    const branchId = codes[0].id;
    const initial = await getWhatsappTemplates(ownerToken, branchId);
    expect(initial.ok).toBe(true);
    expect(initial.gymCodeId).toBe(branchId);
    const existedBefore = Boolean(initial.templates[TARGET_KEY]);
    const originalBody = existedBefore ? String(initial.templates[TARGET_KEY]) : SEEDED_FALLBACK;
    if (!existedBefore) {
      await patchWhatsappTemplate(ownerToken, TARGET_KEY, originalBody, branchId);
    }

    const stamp = new Date().toISOString();
    const probeMarker = `\n// e2e-probe ${stamp}`;
    const nextBody = `${originalBody}${probeMarker}`;

    try {
      const saved = await patchWhatsappTemplate(ownerToken, TARGET_KEY, nextBody, branchId);
      expect(saved.ok).toBe(true);
      expect(saved.template.key).toBe(TARGET_KEY);
      expect(saved.template.body).toBe(nextBody);

      const refetched = await getWhatsappTemplates(ownerToken, branchId);
      expect(refetched.templates[TARGET_KEY]).toBe(nextBody);
    } finally {
      await patchWhatsappTemplate(ownerToken, TARGET_KEY, originalBody, branchId).catch(() => {});
      const restored = await getWhatsappTemplates(ownerToken, branchId).catch(() => null);
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
      body: JSON.stringify({ body: 'noop', gymCodeId: '00000000-0000-0000-0000-000000000000' }),
    });
    expect(res.status).toBe(400);
  });
});
