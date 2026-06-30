import { describe, it, expect } from 'vitest';
import {
  expenseRowsForMonth,
  sumExpenseRowsForMonth,
} from '../src/features/finance/financeExpenseTotals.js';
import {
  monthFinanceDisplayFromSummary,
  ytdProfitFromYearMonths,
} from '../src/features/finance/financeSummaryDisplay.js';

describe('financeExpenseTotals', () => {
  it('expenseRowsForMonth filters persisted expense rows', () => {
    const rows = expenseRowsForMonth([
      { type: 'expense', date: '2026-06-30', amount: 1000, category: 'Rent', id: 'a' },
      { type: 'expense', date: '2026-05-01', amount: 500, category: 'Misc', id: 'b' },
    ], '2026-06');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1000);
    expect(sumExpenseRowsForMonth([
      { type: 'expense', date: '2026-06-30', amount: 1000 },
    ], '2026-06')).toBe(1000);
  });
});

describe('financeSummaryDisplay', () => {
  it('monthFinanceDisplayFromSummary uses server fields as SSOT', () => {
    const display = monthFinanceDisplayFromSummary({
      collectedRevenue: 128446,
      expenses: 1000,
      actualExpenses: 1000,
      profit: 127446,
      expenseSubtitle: 'Actual expense rows',
      revenueGrowthPct: 5,
    });
    expect(display.profit).toBe(127446);
    expect(display.hasExpenseRows).toBe(true);
  });

  it('ytdProfitFromYearMonths sums through selected month', () => {
    const ytd = ytdProfitFromYearMonths([
      { monthKey: '2026-05', profit: 100 },
      { monthKey: '2026-06', profit: 200 },
      { monthKey: '2026-07', profit: 50 },
    ], '2026-06');
    expect(ytd).toBe(300);
  });
});
