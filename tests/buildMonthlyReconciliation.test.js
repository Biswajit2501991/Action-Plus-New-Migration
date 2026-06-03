import { describe, it, expect } from 'vitest';
import { buildMonthlyReconciliation } from '../src/features/finance/buildMonthlyReconciliation.js';

describe('buildMonthlyReconciliation', () => {
  it('returns 12 rows for the year with collected income', () => {
    const rows = buildMonthlyReconciliation(
      [{ type: 'income', date: '2026-04-10', amount: 400, status: 'paid' }],
      2026,
      { useEstimatedExpense: false },
    );
    expect(rows).toHaveLength(12);
    expect(rows[3].monthKey).toBe('2026-04');
    expect(rows[3].incomeCollected).toBe(400);
  });
});
