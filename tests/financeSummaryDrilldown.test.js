import { describe, it, expect } from 'vitest';
import {
  buildCollectedPaymentLines,
  buildDrilldownRowsFromFinanceSummary,
  sumDrilldownRowAmounts,
} from '../src/features/finance/financeSummaryDrilldown.js';

describe('financeSummaryDrilldown', () => {
  it('buildCollectedPaymentLines filters by payment date month only', () => {
    const lines = buildCollectedPaymentLines([
      { id: 'a', paidAt: '2026-06-10', amount: 1000, memberId: 'M1' },
      { id: 'b', paidAt: '2026-07-02', amount: 500, memberId: 'M2', paidMonth: '2026-06' },
    ], '2026-06');
    expect(lines).toHaveLength(1);
    expect(lines[0].amount).toBe(1000);
  });

  it('buildDrilldownRowsFromFinanceSummary sums payment + manual with running total', () => {
    const rows = buildDrilldownRowsFromFinanceSummary({
      collectedRevenue: 1200,
      paymentLines: [
        { id: 'p1', paidAt: '2026-06-05', amount: 1000, memberId: 'M1', memberName: 'A', method: 'Cash' },
      ],
      manualIncomeLines: [
        { id: 'm1', date: '2026-06-12', amount: 200, memberName: 'Manual', method: 'Cash' },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1].runningTotal).toBe(1200);
    expect(sumDrilldownRowAmounts(rows)).toBe(1200);
  });
});
