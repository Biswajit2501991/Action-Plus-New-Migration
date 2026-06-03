import { describe, it, expect } from 'vitest';
import {
  filterLedgerRowsByDateRange,
  sumCollectedIncomeForMonthKey,
  sumLedgerIncomeForMonthKey,
  sumLedgerRowAmounts,
  sumServiceRevenueForPaidMonthKey,
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
    expect(sumLedgerRowAmounts(income, { incomeOnly: true, excludeStatus: 'pending' })).toBe(1000);
  });

  it('sumCollectedIncomeForMonthKey excludes pending', () => {
    expect(sumCollectedIncomeForMonthKey(rows, '2026-05')).toBe(1000);
  });
});

describe('sumServiceRevenueForPaidMonthKey', () => {
  it('sums by paidMonth not collection date', () => {
    const rows = [
      { type: 'income', date: '2026-07-02', paidMonth: '2026-05', amount: 900, status: 'paid' },
      { type: 'income', date: '2026-05-10', paidMonth: '2026-05', amount: 100, status: 'paid' },
      { type: 'income', date: '2026-06-01', paidMonth: '2026-06', amount: 500, status: 'paid' },
    ];
    expect(sumServiceRevenueForPaidMonthKey(rows, '2026-05')).toBe(1000);
    expect(sumServiceRevenueForPaidMonthKey(rows, '2026-07')).toBe(0);
  });
});
