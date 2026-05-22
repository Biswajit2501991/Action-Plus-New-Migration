import { test, expect } from '../fixtures/auth.fixture';
import {
  apiHealthOk,
  listFinance,
  type FinanceTransaction,
} from '../utils/api-client';

/**
 * Phase 4 Finance "Revenue Trend (Last 4 Months)" repair.
 *
 * The hand-rolled bar chart at `index.html` was rendering 16px stubs in
 * `bg-blue-500/80` against a charcoal Dark Luxury card, with NET (income +
 * expenses) totals — producing the invisible bars the screenshot showed.
 *
 * What this spec proves:
 *   1. Each rendered bar exposes `data-testid="finance-trend-bar"` plus
 *      `data-amount`, so the chart is machine-readable.
 *   2. With real income in the last 4 months the chart shows at least one
 *      positive bar AND no `[data-testid="finance-trend-empty"]` placeholder.
 *
 * We deliberately DO NOT seed/restore finance for this assertion. The gym
 * fixture already carries production-shaped income (the dashboard widgets
 * read it from /api/finance). Re-writing the entire finance collection
 * just to insert one probe row caused E2E timeouts on populated gyms;
 * instead we sanity-check that the gym has at least one positive income
 * row in the window and fail loudly if it doesn't — `test.skip` is banned
 * by the runbook.
 */

const fourMonthsAgoIso = (): string => {
  const now = new Date();
  now.setUTCMonth(now.getUTCMonth() - 3);
  now.setUTCDate(1);
  return now.toISOString().slice(0, 10);
};

test.describe('@critical Finance Revenue Trend chart', () => {
  // 90s headroom: page boot (~10s), Finance tab click + navigation retries
  // (~5s), card waitFor (~20s) → comfortably under budget on a populated gym
  // with no heavy /api/finance writes.
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('UI: chart renders 4 bars with at least one positive total', async ({ ownerToken, loginAsOwner: _login, page }) => {
    void _login;

    // Precondition: at least one positive income row in the last 4 months.
    const transactions = await listFinance(ownerToken);
    const cutoff = fourMonthsAgoIso();
    const recentIncome = transactions.filter(
      (t: FinanceTransaction) =>
        t?.type === 'income' &&
        t?.status !== 'pending' &&
        String(t?.date || '') >= cutoff &&
        Number(t?.amount || 0) > 0,
    );
    expect(
      recentIncome.length,
      `Expected at least 1 positive income row in the last 4 months (since ${cutoff}); seed the gym fixture and retry.`,
    ).toBeGreaterThan(0);

    // Wait for the React shell to settle BEFORE clicking — the post-login
    // useEffect at index.html:4849/4870 calls setActiveTab('Dashboard') AFTER
    // setUser() commits. Once the sidebar shows "Owner", that storm has
    // flushed and our click will stick.
    await page.locator('aside').getByText('Owner', { exact: true }).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    const financeHeading = page.getByRole('heading', { name: 'Finance', level: 1 });
    let navigated = false;
    for (let attempt = 0; attempt < 6 && !navigated; attempt += 1) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button')).filter(
          (btn) => (btn.textContent || '').trim() === 'Finance',
        );
        for (const btn of buttons) btn.click();
      });
      try {
        await financeHeading.waitFor({ timeout: 4_000 });
        navigated = true;
      } catch {
        await page.waitForTimeout(750);
      }
    }
    expect(navigated, 'Finance tab click never produced an <h1>Finance</h1> heading').toBe(true);

    const card = page.getByTestId('finance-trend-card');
    await card.waitFor({ timeout: 20_000 });

    const bars = page.getByTestId('finance-trend-bar');
    await expect(bars).toHaveCount(4);

    const amounts = await bars.evaluateAll((els: Element[]) =>
      els.map((el) => Number((el as HTMLElement).getAttribute('data-amount') || 0)),
    );
    expect(amounts.some((n) => n > 0), `bars showed only zeros: ${amounts.join(',')}`).toBe(true);
    await expect(page.getByTestId('finance-trend-empty')).toHaveCount(0);
  });
});
