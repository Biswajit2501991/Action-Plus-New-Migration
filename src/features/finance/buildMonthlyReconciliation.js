import { parseFinanceMonthKey } from './financeMonthScope.js';
import {
  filterLedgerRowsByDateRange,
  sumCollectedIncomeForMonthKey,
  sumLedgerRowAmounts,
  sumServiceRevenueForPaidMonthKey,
} from './financeLedgerTotals.js';
import { resolveMonthExpenseAndProfit } from './buildFinanceKpis.js';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 12-month reconciliation for a calendar year (collected income, expenses, profit).
 * @param {object[]} transactions full ledger
 * @param {number|string} year calendar year
 * @param {object} [options]
 * @param {string[]} [options.monthLabels] short month names
 * @param {boolean} [options.useEstimatedExpense]
 */
export function buildMonthlyReconciliation(transactions, year, options = {}) {
  const y = Number(year);
  if (!y) return [];
  const labels = Array.isArray(options.monthLabels) ? options.monthLabels : [];
  const useEstimatedExpense = options.useEstimatedExpense !== false;

  const rows = [];
  for (let m = 1; m <= 12; m += 1) {
    const monthKey = `${y}-${pad2(m)}`;
    const from = `${y}-${pad2(m)}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${pad2(m)}-${pad2(lastDay)}`;
    const monthLedger = filterLedgerRowsByDateRange(transactions, from, to);
    const incomeCollected = sumCollectedIncomeForMonthKey(transactions, monthKey);
    const serviceRevenue = sumServiceRevenueForPaidMonthKey(transactions, monthKey);
    const expenseRows = monthLedger.filter((t) => t && t.type === 'expense');
    const actualExpenses = sumLedgerRowAmounts(expenseRows, { incomeOnly: false });
    const { expense, profit } = resolveMonthExpenseAndProfit(
      monthLedger,
      incomeCollected,
      useEstimatedExpense,
    );
    rows.push({
      monthKey,
      label: labels[m - 1] ? `${labels[m - 1]} ${y}` : monthKey,
      incomeCollected,
      serviceRevenue,
      expenses: expense,
      actualExpenses,
      profit,
    });
  }
  return rows;
}

/**
 * Rolling 12 months ending at financeMonth (newest last).
 * @param {object[]} transactions
 * @param {string} financeMonth YYYY-MM
 * @param {object} options
 */
export function buildRollingMonthlyReconciliation(transactions, financeMonth, options = {}) {
  const parsed = parseFinanceMonthKey(financeMonth);
  if (!parsed) return buildMonthlyReconciliation(transactions, new Date().getFullYear(), options);
  const labels = Array.isArray(options.monthLabels) ? options.monthLabels : [];
  const useEstimatedExpense = options.useEstimatedExpense !== false;
  const rows = [];
  let { year, month } = parsed;
  const slots = [];
  for (let i = 11; i >= 0; i -= 1) {
    let m = month - i;
    let y = year;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    slots.push({ year: y, month: m });
  }
  for (const slot of slots) {
    const monthKey = `${slot.year}-${pad2(slot.month)}`;
    const from = `${slot.year}-${pad2(slot.month)}-01`;
    const lastDay = new Date(slot.year, slot.month, 0).getDate();
    const to = `${slot.year}-${pad2(slot.month)}-${pad2(lastDay)}`;
    const monthLedger = filterLedgerRowsByDateRange(transactions, from, to);
    const incomeCollected = sumCollectedIncomeForMonthKey(transactions, monthKey);
    const serviceRevenue = sumServiceRevenueForPaidMonthKey(transactions, monthKey);
    const { expense, profit } = resolveMonthExpenseAndProfit(
      monthLedger,
      incomeCollected,
      useEstimatedExpense,
    );
    rows.push({
      monthKey,
      label: labels[slot.month - 1] ? `${labels[slot.month - 1]} ${slot.year}` : monthKey,
      incomeCollected,
      serviceRevenue,
      expenses: expense,
      profit,
    });
  }
  return rows;
}
