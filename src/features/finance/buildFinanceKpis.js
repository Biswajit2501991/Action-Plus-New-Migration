import { parseFinanceMonthKey } from './financeMonthScope.js';
import {
  filterLedgerRowsByDateRange,
  sumCollectedIncomeForMonthKey,
  sumLedgerIncomeForMonthKey,
  sumLedgerRowAmounts,
  sumServiceRevenueForPaidMonthKey,
} from './financeLedgerTotals.js';

const ESTIMATE_RATE = 0.26;

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @param {string} monthKey YYYY-MM @param {number} deltaMonths */
export function shiftFinanceMonthKey(monthKey, deltaMonths) {
  const parsed = parseFinanceMonthKey(monthKey);
  if (!parsed) return '';
  let { year, month } = parsed;
  month += deltaMonths;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${pad2(month)}`;
}

export function revenueGrowthPercent(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return cur ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Sum collected income Jan..throughMonth (inclusive) for calendar year.
 * @param {object[]} transactions full ledger
 * @param {number} year
 * @param {number} throughMonth 1-12
 */
export function sumYtdCollectedIncome(transactions, year, throughMonth) {
  const y = Number(year);
  const endMonth = Math.min(12, Math.max(1, Number(throughMonth) || 12));
  let total = 0;
  for (let m = 1; m <= endMonth; m += 1) {
    total += sumCollectedIncomeForMonthKey(transactions, `${y}-${pad2(m)}`);
  }
  return total;
}

/**
 * @param {object[]} reportingMonthLedger rows in selected month
 * @param {number} collectedRevenue paid income total for month
 * @param {boolean} useEstimatedExpense settings flag
 */
export function resolveMonthExpenseAndProfit(reportingMonthLedger, collectedRevenue, useEstimatedExpense) {
  const expenseRows = (Array.isArray(reportingMonthLedger) ? reportingMonthLedger : [])
    .filter((t) => t && t.type === 'expense');
  const actualExpense = sumLedgerRowAmounts(expenseRows, { incomeOnly: false });
  const hasExpenseRows = actualExpense > 0;
  const estimatedExpense = Math.round(Number(collectedRevenue || 0) * ESTIMATE_RATE);
  const expense = hasExpenseRows
    ? actualExpense
    : estimatedExpense;
  const expenseSubtitle = hasExpenseRows
    ? 'Actual expense rows'
    : (useEstimatedExpense
      ? 'Estimated (26% of collected revenue)'
      : '26% estimate (no expense rows this month)');
  const profit = Number(collectedRevenue || 0) - expense;
  return {
    actualExpense,
    estimatedExpense,
    expense,
    hasExpenseRows,
    expenseSubtitle,
    profit,
    useEstimateFallback: !hasExpenseRows,
  };
}

/**
 * CFO KPIs from full ledger — Dashboard & Finance share this.
 * @param {object[]} transactions full ledger
 * @param {string} financeMonth YYYY-MM (reporting month; dashboard passes current month)
 * @param {object} settings app settings (financeUseEstimatedExpense, ptClientProfiles)
 * @param {object} [options]
 * @param {string} [options.todayMonthKey] override "current" month for YTD cap
 */
export function buildFinanceKpis(transactions, financeMonth, settings = {}, options = {}) {
  const monthKey = String(financeMonth || '').trim();
  const parsed = parseFinanceMonthKey(monthKey);
  const year = parsed?.year || new Date().getFullYear();
  const month = parsed?.month || (new Date().getMonth() + 1);
  const todayMonthKey = String(options.todayMonthKey || '').trim()
    || `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
  const todayParsed = parseFinanceMonthKey(todayMonthKey);
  const ytdThroughMonth = year === todayParsed?.year
    ? Math.min(month, todayParsed.month)
    : (year < (todayParsed?.year || year) ? 12 : month);

  const prevMonthKey = shiftFinanceMonthKey(monthKey, -1);
  const collectedRevenue = sumCollectedIncomeForMonthKey(transactions, monthKey);
  const serviceRevenue = sumServiceRevenueForPaidMonthKey(transactions, monthKey);
  const prevMonthCollected = sumCollectedIncomeForMonthKey(transactions, prevMonthKey);
  const prevMonthServiceRevenue = sumServiceRevenueForPaidMonthKey(transactions, prevMonthKey);
  const pendingBilled = sumLedgerIncomeForMonthKey(transactions, monthKey, { status: 'pending' });
  const revenueGrowthPct = revenueGrowthPercent(collectedRevenue, prevMonthCollected);
  const serviceRevenueGrowthPct = revenueGrowthPercent(serviceRevenue, prevMonthServiceRevenue);
  const ytdCollected = sumYtdCollectedIncome(transactions, year, ytdThroughMonth);
  const ytdServiceRevenue = (() => {
    let total = 0;
    for (let m = 1; m <= ytdThroughMonth; m += 1) {
      total += sumServiceRevenueForPaidMonthKey(transactions, `${year}-${pad2(m)}`);
    }
    return total;
  })();

  const boundsFrom = `${year}-${pad2(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const boundsTo = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  const reportingMonthLedger = filterLedgerRowsByDateRange(transactions, boundsFrom, boundsTo);
  const useEstimatedExpense = settings?.financeUseEstimatedExpense !== false;
  const expenseProfit = resolveMonthExpenseAndProfit(
    reportingMonthLedger,
    collectedRevenue,
    useEstimatedExpense,
  );

  const prevBoundsFrom = (() => {
    const p = parseFinanceMonthKey(prevMonthKey);
    if (!p) return '';
    return `${p.year}-${pad2(p.month)}-01`;
  })();
  const prevBoundsTo = (() => {
    const p = parseFinanceMonthKey(prevMonthKey);
    if (!p) return '';
    const ld = new Date(p.year, p.month, 0).getDate();
    return `${p.year}-${pad2(p.month)}-${pad2(ld)}`;
  })();
  const prevReportingLedger = prevBoundsFrom
    ? filterLedgerRowsByDateRange(transactions, prevBoundsFrom, prevBoundsTo)
    : [];
  const prevCollected = sumCollectedIncomeForMonthKey(transactions, prevMonthKey);
  const prevExpenseProfit = resolveMonthExpenseAndProfit(
    prevReportingLedger,
    prevCollected,
    useEstimatedExpense,
  );
  const profitGrowthPct = revenueGrowthPercent(expenseProfit.profit, prevExpenseProfit.profit);
  const ytdProfit = (() => {
    let total = 0;
    for (let m = 1; m <= ytdThroughMonth; m += 1) {
      const mk = `${year}-${pad2(m)}`;
      const collected = sumCollectedIncomeForMonthKey(transactions, mk);
      const from = `${year}-${pad2(m)}-01`;
      const ld = new Date(year, m, 0).getDate();
      const to = `${year}-${pad2(m)}-${pad2(ld)}`;
      const monthLedger = filterLedgerRowsByDateRange(transactions, from, to);
      total += resolveMonthExpenseAndProfit(monthLedger, collected, useEstimatedExpense).profit;
    }
    return total;
  })();

  return {
    financeMonth: monthKey,
    collectedRevenue,
    serviceRevenue,
    pendingBilled,
    prevMonthCollected,
    prevMonthServiceRevenue,
    revenueGrowthPct,
    serviceRevenueGrowthPct,
    ytdCollected,
    ytdServiceRevenue,
    ...expenseProfit,
    prevMonthProfit: prevExpenseProfit.profit,
    profitGrowthPct,
    ytdProfit,
    reportingMonthLedger,
    incomeRowsCollected: reportingMonthLedger.filter(
      (t) => t.type !== 'expense' && String(t.status || '').toLowerCase() !== 'pending',
    ),
    incomeRowsService: (Array.isArray(transactions) ? transactions : []).filter(
      (t) => t && t.type !== 'expense'
        && String(t.status || '').toLowerCase() !== 'pending'
        && String(t.paidMonth || t.date || '').trim().slice(0, 7) === monthKey,
    ),
  };
}
