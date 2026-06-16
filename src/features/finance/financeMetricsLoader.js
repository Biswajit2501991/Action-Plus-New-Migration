import {
  fetchFinanceMonthSummaryWithRetry,
  fetchFinanceYearSummaryWithRetry,
} from './fetchFinanceSummary.js';
import {
  getCachedFinanceMonthSummary,
  getCachedFinanceMonthSummaryWithLines,
  getCachedFinanceYearSummary,
  setCachedFinanceMonthSummary,
  setCachedFinanceMonthSummaryWithLines,
  setCachedFinanceYearSummary,
} from './financeMetricsCache.js';

/** Default TTL for income-lines cache (5 minutes). */
export const FINANCE_LINES_CACHE_TTL_MS = 5 * 60 * 1000;

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
 * Cache-first month summary with paymentLines (View Income drilldown).
 * @param {(path: string) => Promise<unknown>} backendJson
 * @param {string} branchId
 * @param {string} monthKey
 * @param {{ force?: boolean }} [options]
 */
export async function loadFinanceMonthSummaryWithLinesCached(backendJson, branchId, monthKey, options = {}) {
  const force = Boolean(options.force);
  if (!force) {
    const cached = getCachedFinanceMonthSummaryWithLines(branchId, monthKey);
    if (cached) return { data: cached, fromCache: true };
  }
  const data = await fetchFinanceMonthSummaryWithRetry(backendJson, monthKey, { includeLines: true });
  setCachedFinanceMonthSummaryWithLines(branchId, monthKey, data);
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
