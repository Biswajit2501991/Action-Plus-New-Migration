import { describe, it, expect } from 'vitest';
import {
  filterLedgerRowsByDateRange,
  sumLedgerIncomeForMonthKey,
  sumLedgerRowAmounts,
} from '../src/features/finance/financeLedgerTotals.js';

describe('financeLedgerTotals', () => {
  const rows = [
    { type: 'income', date: '2026-05-10', amount: 1000, status: 'paid' },
    { type: 'income', date: '2026-05-15', amount: 2500, status: 'pending' },
    { type: 'income', date: '2026-06-01', amount: 500, status: 'paid' },
    { type: 'expense', date: '2026-05-20', amount: 200, status: 'posted' },
  ];

  it('sums all income in month by transaction date', () => {
    expect(sumLedgerIncomeForMonthKey(rows, '2026-05')).toBe(3500);
  });

  it('sums income in date range', () => {
    const may = filterLedgerRowsByDateRange(rows, '2026-05-01', '2026-05-31');
    expect(sumLedgerRowAmounts(may, { incomeOnly: true })).toBe(3500);
  });

  it('splits pending vs total income', () => {
    const may = filterLedgerRowsByDateRange(rows, '2026-05-01', '2026-05-31');
    const income = may.filter((t) => t.type !== 'expense');
    expect(sumLedgerRowAmounts(income, { incomeOnly: true })).toBe(3500);
    expect(sumLedgerRowAmounts(income, { incomeOnly: true, status: 'pending' })).toBe(2500);
  });
});
