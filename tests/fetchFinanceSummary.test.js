import { describe, expect, it, vi } from 'vitest';
import {
  collectedTrendFromYearSummary,
  fetchFinanceMonthSummaryWithRetry,
} from '../src/features/finance/fetchFinanceSummary.js';

describe('fetchFinanceMonthSummaryWithRetry', () => {
  it('retries until success', async () => {
    const backendJson = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ collectedRevenue: 1200, serviceRevenue: 1100 });
    const body = await fetchFinanceMonthSummaryWithRetry(backendJson, '2026-06', {
      maxAttempts: 3,
      baseDelayMs: 1,
    });
    expect(body.collectedRevenue).toBe(1200);
    expect(backendJson).toHaveBeenCalledTimes(2);
  });

  it('rejects invalid month keys', async () => {
    await expect(
      fetchFinanceMonthSummaryWithRetry(async () => ({}), 'bad'),
    ).rejects.toThrow('invalid_month');
  });
});

describe('collectedTrendFromYearSummary', () => {
  it('maps year reconciliation months to trend slots', () => {
    const trend = collectedTrendFromYearSummary({
      months: [
        { monthKey: '2026-04', incomeCollected: 100 },
        { monthKey: '2026-05', incomeCollected: 200 },
        { monthKey: '2026-06', incomeCollected: 300 },
      ],
    }, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], 2);
    expect(trend).toHaveLength(2);
    expect(trend[0].total).toBe(200);
    expect(trend[1].total).toBe(300);
    expect(trend[1].label).toBe('Jun-26');
  });

  it('drops future calendar months when throughMonthKey is set', () => {
    const yearBody = {
      months: [
        { monthKey: '2026-01', incomeCollected: 10 },
        { monthKey: '2026-06', incomeCollected: 82915 },
        { monthKey: '2026-07', incomeCollected: 699 },
        { monthKey: '2026-12', incomeCollected: 0 },
      ],
    };
    const withoutCap = collectedTrendFromYearSummary(yearBody, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 12);
    expect(withoutCap.map((x) => x.monthKey)).toEqual(['2026-01', '2026-06', '2026-07', '2026-12']);

    const throughJune = collectedTrendFromYearSummary(yearBody, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 12, '2026-06');
    expect(throughJune.map((x) => x.monthKey)).toEqual(['2026-01', '2026-06']);

    const lastSix = collectedTrendFromYearSummary(yearBody, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 6, '2026-06');
    expect(lastSix.map((x) => x.label)).toEqual(['Jan-26', 'Jun-26']);
  });
});
