/**
 * Phase 4 E2E global teardown.
 *
 * The factory in `tests/e2e/factories/staff.factory.ts` marks every test user
 * with `testProfile: true` and assigns a unique sandboxId. Without a teardown
 * each `npm run test:e2e` run accumulates dummy staff in Supabase, polluting
 * the Logs view and counting against staff caps. This teardown:
 *
 *   1. Logs in as owner.
 *   2. Reads /api/users.
 *   3. Filters down to rows with testProfile === true OR id starting with
 *      `e2e-staff-` (defense-in-depth in case `testProfile` was lost during
 *      mapper round-trips).
 *   4. Calls POST /api/users/cleanup with all test user ids (hard-delete with
 *      dependency purge for E2E staff).
 *   5. Wipes any leave-requests submitted by those users via
 *      /api/leave-requests/cleanup.
 *
 * The teardown is intentionally TOLERANT — if Supabase is unreachable or the
 * owner login fails, we log a warning rather than failing the entire run.
 */
import type { FullConfig } from '@playwright/test';

async function globalTeardown(_config: FullConfig) {
  const apiURL = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
  const ownerId = process.env.E2E_OWNER_ID || 'owner';
  const ownerPw = process.env.E2E_OWNER_PASSWORD || 'owner';

  const log = (msg: string) => console.log(`[e2e teardown] ${msg}`);
  const warn = (msg: string) => console.warn(`[e2e teardown] ${msg}`);

  try {
    const health = await fetch(`${apiURL}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!health.ok) {
      warn(`API health returned ${health.status} — skipping cleanup`);
      return;
    }
  } catch (err) {
    warn(`API not reachable, skipping cleanup: ${(err as Error).message}`);
    return;
  }

  let token = '';
  try {
    const loginRes = await fetch(`${apiURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: ownerId, password: ownerPw }),
    });
    if (!loginRes.ok) {
      warn(`owner login returned ${loginRes.status} — skipping cleanup`);
      return;
    }
    const data = await loginRes.json();
    token = data?.token;
    if (!token) {
      warn('owner login returned no token — skipping cleanup');
      return;
    }
  } catch (err) {
    warn(`owner login failed: ${(err as Error).message}`);
    return;
  }

  // ---- Identify test users ------------------------------------------------
  let users: Array<Record<string, unknown>> = [];
  try {
    const res = await fetch(`${apiURL}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      warn(`/api/users returned ${res.status} — skipping`);
      return;
    }
    users = (await res.json()) as Array<Record<string, unknown>>;
  } catch (err) {
    warn(`listing users failed: ${(err as Error).message}`);
    return;
  }

  const isTestUser = (u: Record<string, unknown>) => {
    if (u?.testProfile === true) return true;
    const id = String(u?.id || '');
    return id.startsWith('e2e-staff-');
  };
  const testIds = users.filter(isTestUser).map((u) => String(u.id || '')).filter(Boolean);
  if (!testIds.length) {
    log('no e2e test users to remove');
  } else {
    log(`removing ${testIds.length} e2e test user(s): ${testIds.join(', ')}`);
    try {
      const res = await fetch(`${apiURL}/api/users/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds: testIds }),
      });
      if (!res.ok) {
        warn(`/api/users/cleanup returned ${res.status}`);
      } else {
        const data = await res.json();
        const deleted = Array.isArray(data?.deleted) ? data.deleted.length : 0;
        const deactivated = Array.isArray(data?.deactivated) ? data.deactivated.length : 0;
        log(`cleanup: ${deleted} deleted, ${deactivated} deactivated`);
      }
    } catch (err) {
      warn(`users cleanup failed: ${(err as Error).message}`);
    }
  }

  // ---- Clean up leave requests authored by removed users -----------------
  if (testIds.length) {
    try {
      const res = await fetch(`${apiURL}/api/leave-requests/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userIds: testIds }),
      });
      if (!res.ok) {
        warn(`/api/leave-requests/cleanup returned ${res.status}`);
      } else {
        const data = await res.json();
        log(`removed ${data?.removed ?? 0} leave request(s); ${data?.remaining ?? '?'} remain`);
      }
    } catch (err) {
      warn(`leave-requests cleanup failed: ${(err as Error).message}`);
    }
  }

  // ---- Phase 4 mop-up: synthetic 2099-01-01..05 attendance/logs ----------
  // The attendance/logs cleanup specs use 2099-01-* as a "no-real-data" zone.
  // If a spec failed before its own afterAll, the rows leak. Sweep them now.
  const SYNTHETIC_RANGE = { startDate: '2099-01-01', endDate: '2099-01-31' };
  try {
    const res = await fetch(`${apiURL}/api/attendance/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(SYNTHETIC_RANGE),
    });
    if (!res.ok) {
      warn(`/api/attendance/cleanup returned ${res.status}`);
    } else {
      const data = await res.json();
      if ((data?.deleted ?? 0) > 0) log(`swept ${data.deleted} synthetic attendance row(s)`);
    }
  } catch (err) {
    warn(`attendance synthetic cleanup failed: ${(err as Error).message}`);
  }
  try {
    const res = await fetch(`${apiURL}/api/logs/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(SYNTHETIC_RANGE),
    });
    if (!res.ok) {
      warn(`/api/logs/cleanup returned ${res.status}`);
    } else {
      const data = await res.json();
      if ((data?.deleted ?? 0) > 0) log(`swept ${data.deleted} synthetic log row(s)`);
    }
  } catch (err) {
    warn(`logs synthetic cleanup failed: ${(err as Error).message}`);
  }

  log('done');
}

export default globalTeardown;
