import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearFinanceMetricsCache,
  getCachedFinanceMonthSummary,
  invalidateFinanceMetrics,
  setCachedFinanceMonthSummary,
} from '../src/features/finance/financeMetricsCache.js';

describe('financeMetricsCache', () => {
  beforeEach(() => {
    clearFinanceMetricsCache();
  });

  it('stores and retrieves month summary by branch and month', () => {
    setCachedFinanceMonthSummary('branch-a', '2026-06', { collectedRevenue: 5000 });
    expect(getCachedFinanceMonthSummary('branch-a', '2026-06')?.collectedRevenue).toBe(5000);
    expect(getCachedFinanceMonthSummary('branch-b', '2026-06')).toBeNull();
  });

  it('invalidates specific month and its year bucket', () => {
    setCachedFinanceMonthSummary('branch-a', '2026-06', { collectedRevenue: 100 });
    invalidateFinanceMetrics({ branchId: 'branch-a', months: ['2026-06'], broadcast: false });
    expect(getCachedFinanceMonthSummary('branch-a', '2026-06')).toBeNull();
  });

  it('clears all entries for a branch', () => {
    setCachedFinanceMonthSummary('branch-a', '2026-05', { collectedRevenue: 1 });
    setCachedFinanceMonthSummary('branch-a', '2026-06', { collectedRevenue: 2 });
    invalidateFinanceMetrics({ branchId: 'branch-a', all: true, broadcast: false });
    expect(getCachedFinanceMonthSummary('branch-a', '2026-06')).toBeNull();
  });
});
