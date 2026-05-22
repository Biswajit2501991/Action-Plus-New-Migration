import { test, expect } from '../fixtures/auth.fixture';
import {
  apiHealthOk,
  cleanupStaffUsers,
  listStaff,
  upsertStaff,
} from '../utils/api-client';
import { buildStaffUser } from '../factories/staff.factory';

/**
 * Phase 4 owner-only bulk staff delete via POST /api/users/cleanup.
 *
 * Contract under test:
 *   - Owner can remove any non-seed, non-self user in one request.
 *   - Protected ids (Bis, Raja, the owner themselves, anyone with role='owner')
 *     are skipped server-side and listed in `skipped[]`.
 *   - The endpoint is owner-only — a staff JWT receives 403.
 */

test.describe('@critical Staff bulk delete', () => {
  // upsertStaff fans out into ~6 queries per user (fetchAll existing staff +
  // upsert + sections delete/insert + access delete/insert), and the gym
  // accumulates test users across runs. 90s comfortably absorbs that.
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('API: owner removes three test staff in one call', async ({ ownerToken }) => {
    // Create 3 throw-away staff users. The factory tags them with
    // `testProfile: true` AND an `e2e-staff-bulk-*` id so the global teardown
    // can mop up any leftovers if this spec fails before reaching cleanup.
    const created = [0, 1, 2].map((idx) =>
      buildStaffUser({
        id: `e2e-staff-bulk-${Date.now()}-${idx}`,
        name: `Bulk Delete Sample ${idx}`,
      }),
    );
    for (const u of created) await upsertStaff(ownerToken, u);

    const ids = created.map((u) => String(u.id));
    const before = await listStaff(ownerToken);
    for (const id of ids) {
      expect(before.find((u) => u.id === id), `created ${id} missing`).toBeTruthy();
    }

    const out = await cleanupStaffUsers(ownerToken, ids);
    expect(out.ok).toBe(true);
    expect(out.deleted.sort()).toEqual([...ids].sort());
    expect(out.skipped).toEqual([]);

    const after = await listStaff(ownerToken);
    for (const id of ids) {
      expect(after.find((u) => u.id === id), `${id} still present`).toBeUndefined();
    }
  });

  test('API: protected ids are skipped (owner + Bis + Raja)', async ({ ownerToken }) => {
    const before = await listStaff(ownerToken);
    // Only target ids that actually exist so the skip arrays are meaningful.
    const candidates = before
      .map((u) => String(u.id))
      .filter((id) => ['owner', 'Bis', 'Raja'].includes(id));
    test.skip(candidates.length === 0, 'no protected seed users present in this gym');

    const out = await cleanupStaffUsers(ownerToken, candidates);
    expect(out.ok).toBe(true);
    expect(out.deleted).toEqual([]);
    expect(out.skipped.length).toBe(candidates.length);
    const skippedIds = out.skipped.map((s) => s.id).sort();
    expect(skippedIds).toEqual([...candidates].sort());

    // None of them must have actually been removed.
    const after = await listStaff(ownerToken);
    for (const id of candidates) {
      expect(after.find((u) => u.id === id), `protected ${id} accidentally removed`).toBeTruthy();
    }
  });

  test('API: staff JWT receives 403 from /api/users/cleanup', async ({ ownerToken }) => {
    const staff = buildStaffUser({ id: `e2e-staff-rbac-${Date.now()}`, sections: ['Dashboard'] });
    await upsertStaff(ownerToken, staff);
    try {
      const { login, setStaffPassword } = await import('../utils/api-client');
      const pw = 'E2eRbac1!';
      await setStaffPassword(ownerToken, staff.id as string, pw);
      const session = await login(staff.id as string, pw);

      const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
      const res = await fetch(`${apiURL}/api/users/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ userIds: ['Bis'] }),
      });
      expect(res.status).toBe(403);
    } finally {
      await cleanupStaffUsers(ownerToken, [staff.id as string]).catch(() => {});
    }
  });
});
