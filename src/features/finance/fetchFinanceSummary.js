/**
 * Fetch finance summary from the API with bounded retries (dashboard + finance cards).
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 800;

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * @param {(path: string) => Promise<unknown>} backendJson
 * @param {string} monthKey YYYY-MM
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [options]
 */
export async function fetchFinanceMonthSummaryWithRetry(backendJson, monthKey, options = {}) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) {
    throw new Error('invalid_month');
  }
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(100, Number(options.baseDelayMs) || DEFAULT_BASE_DELAY_MS);
  const includeLines = Boolean(options.includeLines);
  const linesQuery = includeLines ? '&includeLines=1' : '';
  const path = `/finance/summary?month=${encodeURIComponent(key)}${linesQuery}`;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const body = await backendJson(path);
      if (!body || typeof body !== 'object') {
        throw new Error('invalid_finance_summary_response');
      }
      return body;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await delay(baseDelayMs * (attempt + 1));
      }
    }
  }
  throw lastErr || new Error('finance_summary_failed');
}

/**
 * @param {(path: string) => Promise<unknown>} backendJson
 * @param {number|string} year
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [options]
 */
export async function fetchFinanceYearSummaryWithRetry(backendJson, year, options = {}) {
  const y = Number(year);
  if (!y) throw new Error('invalid_year');
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = Math.max(100, Number(options.baseDelayMs) || DEFAULT_BASE_DELAY_MS);
  const path = `/finance/summary?year=${encodeURIComponent(String(y))}`;
  let lastErr;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const body = await backendJson(path);
      if (!body || typeof body !== 'object') {
        throw new Error('invalid_finance_year_summary_response');
      }
      return body;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        await delay(baseDelayMs * (attempt + 1));
      }
    }
  }
  throw lastErr || new Error('finance_year_summary_failed');
}

/**
 * Build dashboard trend slots from GET /finance/summary?year=YYYY (collected / payment-date basis).
 * @param {object} yearBody API response
 * @param {string[]} monthLabels e.g. ['Jan','Feb',...]
 * @param {number} [maxMonths]
 * @param {string} [throughMonthKey] YYYY-MM — exclude future calendar months (e.g. Jul–Dec when today is Jun)
 */
export function collectedTrendFromYearSummary(yearBody, monthLabels = [], maxMonths = 6, throughMonthKey = '') {
  const months = Array.isArray(yearBody?.months) ? yearBody.months : [];
  const through = String(throughMonthKey || '').trim();
  let slots = months.map((row) => {
    const monthKey = String(row?.monthKey || '').trim();
    const monthNum = Number(monthKey.slice(5, 7));
    const labelMonth = monthLabels[monthNum - 1] || monthKey.slice(5, 7);
    const yearSuffix = monthKey.slice(2, 4);
    return {
      monthKey,
      label: yearSuffix ? `${labelMonth}-${yearSuffix}` : labelMonth,
      total: Number(row?.incomeCollected ?? row?.collectedRevenue ?? 0),
    };
  });
  if (/^\d{4}-\d{2}$/.test(through)) {
    slots = slots.filter((slot) => String(slot.monthKey || '') <= through);
  }
  const cap = Math.max(1, Number(maxMonths) || 6);
  return slots.slice(-cap);
}
