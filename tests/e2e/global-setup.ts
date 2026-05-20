/**
 * Verifies backend is reachable before E2E. Skips are handled per-test when E2E_REQUIRE_BACKEND=0.
 */
import type { FullConfig } from '@playwright/test';

async function globalSetup(_config: FullConfig) {
  const api = process.env.E2E_API_URL || 'http://127.0.0.1:4000';
  try {
    const res = await fetch(`${api}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`[e2e setup] API health returned ${res.status} — tests may skip if backend unavailable`);
    }
  } catch (err) {
    console.warn('[e2e setup] API not reachable:', (err as Error).message);
  }
}

export default globalSetup;
