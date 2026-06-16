import { describe, it, expect } from 'vitest';
import {
  aggregateFinanceMonthSummary,
  financeSummaryDelta,
  sumCollectedFromPaymentRecords,
  sumServiceRevenueFromPaymentRecords,
} from '../src/features/finance/aggregateFinanceSummary.js';

describe('aggregateFinanceMonthSummary', () => {
  it('sums by payment transaction date only', () => {
    const payments = [
      { paidAt: '2026-05-04', amount: 1000, memberId: 'M1' },
      { paidAt: '2026-06-01', amount: 500, memberId: 'M2' },
    ];
    expect(sumCollectedFromPaymentRecords(payments, '2026-05')).toBe(1000);
    const summary = aggregateFinanceMonthSummary({
      paymentRecords: payments,
      financeTransactions: [],
      monthKey: '2026-05',
      settings: { financeUseEstimatedExpense: false },
    });
    expect(summary.collectedRevenue).toBe(1000);
    expect(summary.paymentCount).toBe(1);
  });

  it('billing date on member does not affect summary without payment row', () => {
    const summary = aggregateFinanceMonthSummary({
      paymentRecords: [],
      financeTransactions: [],
      monthKey: '2026-05',
      settings: {},
    });
    expect(summary.collectedRevenue).toBe(0);
  });

  it('splits collection date vs paid month for late payments', () => {
    const payments = [
      { paidAt: '2026-07-02', paidMonth: '2026-05', billingDate: '2026-05-30', amount: 900, memberId: 'M1' },
    ];
    expect(sumCollectedFromPaymentRecords(payments, '2026-07')).toBe(900);
    expect(sumCollectedFromPaymentRecords(payments, '2026-05')).toBe(0);
    expect(sumServiceRevenueFromPaymentRecords(payments, '2026-05')).toBe(900);
    expect(sumServiceRevenueFromPaymentRecords(payments, '2026-07')).toBe(0);
    const summary = aggregateFinanceMonthSummary({
      paymentRecords: payments,
      financeTransactions: [],
      monthKey: '2026-05',
      settings: {},
    });
    expect(summary.collectedRevenue).toBe(0);
    expect(summary.serviceRevenue).toBe(900);
  });

  it('excludes mirrored member billing rows from manual income (no double count)', () => {
    const payments = [
      { paidAt: '2026-06-10', amount: 1000, memberId: 'M1' },
    ];
    const financeTransactions = [
      {
        type: 'income',
        date: '2026-06-10',
        amount: 1000,
        note: 'Imported from member billing record',
        source: 'manual',
      },
      {
        type: 'income',
        date: '2026-06-12',
        amount: 200,
        note: 'PT sale',
        source: 'manual',
      },
    ];
    const summary = aggregateFinanceMonthSummary({
      paymentRecords: payments,
      financeTransactions,
      monthKey: '2026-06',
      settings: {},
    });
    expect(summary.collectedRevenue).toBe(1200);
    expect(summary.manualIncomeCollected).toBe(200);
  });
});

describe('financeSummaryDelta', () => {
  it('detects mismatch', () => {
    const d = financeSummaryDelta(5770, 95000);
    expect(d.matches).toBe(false);
    expect(d.delta).toBe(89230);
  });
});
