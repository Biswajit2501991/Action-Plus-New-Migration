import {
  fetchFinanceMonthSummaryWithRetry,
  fetchFinanceYearSummaryWithRetry,
} from './fetchFinanceSummary.js';
import {
  getCachedFinanceMonthSummary,
  getCachedFinanceYearSummary,
  setCachedFinanceMonthSummary,
  setCachedFinanceYearSummary,
} from './financeMetricsCache.js';

/**
 * Cache-first month summary. Network only on miss or force.
 * @param {(path: string) => Promise<unknown>} backendJson
 * @param {string} branchId
 * @param {string} monthKey
 * @param {{ force?: boolean }} [options]
 */
export async function loadFinanceMonthSummaryCached(backendJson, branchId, monthKey, options = {}) {
  const force = Boolean(options.force);
  if (!force) {
    const cached = getCachedFinanceMonthSummary(branchId, monthKey);
    if (cached) return { data: cached, fromCache: true };
  }
  const data = await fetchFinanceMonthSummaryWithRetry(backendJson, monthKey);
  setCachedFinanceMonthSummary(branchId, monthKey, data);
  return { data, fromCache: false };
}

/**
 * Cache-first year summary for dashboard trends.
 */
export async function loadFinanceYearSummaryCached(backendJson, branchId, year, options = {}) {
  const force = Boolean(options.force);
  const y = Number(year);
  if (!force) {
    const cached = getCachedFinanceYearSummary(branchId, y);
    if (cached) return { data: cached, fromCache: true };
  }
  const data = await fetchFinanceYearSummaryWithRetry(backendJson, y);
  setCachedFinanceYearSummary(branchId, y, data);
  return { data, fromCache: false };
}
