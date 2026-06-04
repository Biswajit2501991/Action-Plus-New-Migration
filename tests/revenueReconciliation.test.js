import { describe, expect, it } from 'vitest';
import { buildRevenueReconciliation } from '../src/features/finance/revenueReconciliation.js';

describe('buildRevenueReconciliation', () => {
  it('flags months where displayed revenue differs from ledger expected', () => {
    const result = buildRevenueReconciliation([
      { monthKey: '2026-05', expected: 699, actual: 699 },
      { monthKey: '2026-06', expected: 900, actual: 800 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.mismatchCount).toBe(1);
    expect(result.rows[1].delta).toBe(-100);
  });
});
