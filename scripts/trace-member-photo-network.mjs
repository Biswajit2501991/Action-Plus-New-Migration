#!/usr/bin/env node
/**
 * Live network trace for member photo batch sync.
 * Usage:
 *   E2E_OWNER_ID=your-id E2E_OWNER_PASSWORD=your-pw node scripts/trace-member-photo-network.mjs
 * Or omit credentials — browser opens for manual login (90s timeout).
 */
import { chromium } from 'playwright';

const BASE = process.env.TRACE_BASE_URL || 'http://127.0.0.1:5501';
const ID = process.env.E2E_OWNER_ID || '';
const PW = process.env.E2E_OWNER_PASSWORD || '';
const TIMEOUT_MS = Number(process.env.TRACE_LOGIN_TIMEOUT_MS || 90_000);

const hits = [];

function track(req) {
  const url = req.url();
  if (!/\/api\/(members\/photo-urls|members(\?|$)|auth\/(me|login))/i.test(url)) return;
  hits.push({ method: req.method(), url, at: new Date().toISOString() });
}

function trackResponse(res) {
  const url = res.url();
  if (!url.includes('/api/members/photo-urls')) return;
  hits.push({
    kind: 'photo-urls-response',
    status: res.status(),
    url,
    at: new Date().toISOString(),
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('request', track);
page.on('response', trackResponse);

console.log(`[trace] Opening ${BASE}`);
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });

if (ID && PW) {
  console.log(`[trace] Logging in as ${ID}…`);
  await page.getByPlaceholder('Enter your username').fill(ID);
  await page.locator('input[placeholder="••••"]').fill(PW);
  await page.getByRole('button', { name: 'LOGIN' }).click();
} else {
  console.log('[trace] No E2E_OWNER_ID/PASSWORD — waiting for manual login in headed mode not available in headless.');
  console.log('[trace] Set E2E_OWNER_ID and E2E_OWNER_PASSWORD env vars.');
  await browser.close();
  process.exit(2);
}

try {
  await page.getByRole('button', { name: 'Dashboard' }).first().waitFor({ timeout: TIMEOUT_MS });
  console.log('[trace] Dashboard visible — hydrate should have run.');
} catch {
  console.error('[trace] Login failed or timed out.');
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(3000);

await page.getByRole('button', { name: 'Members' }).first().click();
await page.waitForTimeout(2000);

const diag = await page.evaluate(() => ({
  envPhoto: Boolean(window.__APG_ENV__?.MEMBER_PHOTO_STORAGE_ENABLED),
  storageOn: window.__APG_MODULES?.memberPhotoStorageEnabled?.(),
  syncAll: typeof window.__APG_MODULES?.syncAllMemberPhotoUrls,
  globalSync: typeof window.__APG_SYNC_MEMBER_PHOTOS__,
  sampleNeed: window.__APG_MODULES?.memberIdsNeedingPhotoUrlsAll?.(
    (window.__APG_SYNC_CONTEXT__?.members || []).slice?.(0, 5) || [],
  ),
  perfPhoto: performance.getEntriesByType('resource')
    .filter((e) => /photo-urls|\/members/i.test(e.name))
    .map((e) => ({ name: e.name, duration: Math.round(e.duration) })),
  consolePhoto: (window.__APG_MODULE_TELEMETRY || [])
    .filter((x) => String(x?.code || '').includes('photo'))
    .slice(0, 5),
}));

console.log('\n=== Network hits (auth + members + photo-urls) ===');
for (const h of hits) console.log(JSON.stringify(h));

console.log('\n=== Browser diagnostics ===');
console.log(JSON.stringify(diag, null, 2));

const photoCalls = hits.filter((h) => h.url?.includes('photo-urls') || h.kind === 'photo-urls-response');
if (photoCalls.length) {
  console.log('\n✅ POST /api/members/photo-urls was triggered automatically.');
} else {
  console.log('\n❌ POST /api/members/photo-urls was NOT seen after login.');
  console.log('   Check: members with hasPhoto in list, backendHydrated, prod bundle age.');
}

await browser.close();
