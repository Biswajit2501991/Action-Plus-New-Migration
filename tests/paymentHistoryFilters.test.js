import { describe, it, expect } from 'vitest';
import {
  filterPaymentRowsByMonth,
  paymentHistoryMonthOptions,
  paymentRowMonthKey,
  sumPaymentRowAmounts,
} from '../src/features/members/paymentHistoryFilters.js';

describe('paymentHistoryFilters', () => {
  const rows = [
    { id: '1', paidAt: '2026-05-10', amount: 1000 },
    { id: '2', paidAt: '2026-06-01', amount: 500 },
    { id: '3', paidAt: '2026-05-28', amount: 200 },
  ];

  it('filters by YYYY-MM on paidAt', () => {
    const may = filterPaymentRowsByMonth(rows, '2026-05');
    expect(may).toHaveLength(2);
    expect(sumPaymentRowAmounts(may)).toBe(1200);
  });

  it('returns all rows when filter empty', () => {
    expect(filterPaymentRowsByMonth(rows, '')).toHaveLength(3);
  });

  it('lists month options newest first', () => {
    expect(paymentHistoryMonthOptions(rows)).toEqual(['2026-06', '2026-05']);
  });

  it('paymentRowMonthKey prefers paidAt', () => {
    expect(paymentRowMonthKey({ paidAt: '2026-05-15', billingMonth: '2026-06' })).toBe('2026-05');
  });
});
