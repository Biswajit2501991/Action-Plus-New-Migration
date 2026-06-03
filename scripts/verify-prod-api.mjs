/**
 * Quick ops check: public health + finance summary route exists (401/403 = OK, 404 = old backend).
 * Usage: node scripts/verify-prod-api.mjs [baseUrl]
 */
const base = String(process.argv[2] || 'https://app.gymactionplus.com').replace(/\/+$/, '');
const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

async function get(path) {
  const res = await fetch(`${base}${path}`, { redirect: 'follow' });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

const health = await get('/api/health');
const version = await get('/api/version');
const finance = await get(`/api/finance/summary?month=${encodeURIComponent(month)}`);

const financeRouteOk = finance.status !== 404;
const featuresOk = health.body?.features?.financeSummary === true;

console.log('[verify-prod-api] base:', base);
console.log('[verify-prod-api] GET /api/health ->', health.status, {
  version: health.body?.version,
  buildSha: health.body?.buildSha,
  financeSummary: health.body?.features?.financeSummary,
});
console.log('[verify-prod-api] GET /api/version ->', version.status, {
  buildSha: version.body?.buildSha,
  financeSummary: version.body?.features?.financeSummary,
});
console.log('[verify-prod-api] GET /api/finance/summary ->', finance.status, financeRouteOk ? '(route registered)' : '(404 = old backend)');

if (!health.body?.ok) {
  console.error('[verify-prod-api] FAIL: health not ok');
  process.exit(1);
}
if (!featuresOk) {
  console.error('[verify-prod-api] FAIL: financeSummary feature flag missing on health');
  process.exit(1);
}
if (!financeRouteOk) {
  console.error('[verify-prod-api] FAIL: finance summary returns 404 — git pull and restart prod stack');
  process.exit(1);
}
console.log('[verify-prod-api] OK');
