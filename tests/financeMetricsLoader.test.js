import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCachedFinanceMonthSummaryWithLines,
  setCachedFinanceMonthSummaryWithLines,
  invalidateFinanceMetrics,
} from '../src/features/finance/financeMetricsCache.js';
import { loadFinanceMonthSummaryWithLinesCached } from '../src/features/finance/financeMetricsLoader.js';

describe('financeMetricsLoader lines cache', () => {
  beforeEach(() => {
    invalidateFinanceMetrics({ branchId: 'default', all: true, broadcast: false });
  });

  it('loadFinanceMonthSummaryWithLinesCached returns cache on second call', async () => {
    const backendJson = vi.fn().mockResolvedValue({
      collectedRevenue: 1000,
      paymentLines: [{ id: 'p1', amount: 1000 }],
    });
    const first = await loadFinanceMonthSummaryWithLinesCached(backendJson, 'default', '2026-06');
    expect(first.fromCache).toBe(false);
    expect(backendJson).toHaveBeenCalledTimes(1);

    const second = await loadFinanceMonthSummaryWithLinesCached(backendJson, 'default', '2026-06');
    expect(second.fromCache).toBe(true);
    expect(backendJson).toHaveBeenCalledTimes(1);
    expect(getCachedFinanceMonthSummaryWithLines('default', '2026-06')?.collectedRevenue).toBe(1000);
  });

  it('invalidateFinanceMetrics clears lines cache for month', async () => {
    setCachedFinanceMonthSummaryWithLines('default', '2026-06', { collectedRevenue: 500, paymentLines: [] });
    expect(getCachedFinanceMonthSummaryWithLines('default', '2026-06')).toBeTruthy();
    invalidateFinanceMetrics({ branchId: 'default', months: ['2026-06'], broadcast: false });
    expect(getCachedFinanceMonthSummaryWithLines('default', '2026-06')).toBeNull();
  });
});
