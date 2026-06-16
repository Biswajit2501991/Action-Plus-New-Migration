import { describe, it, expect } from 'vitest';
import { resolveMonthExpenseAndProfit } from '../src/features/finance/buildFinanceKpis.js';

describe('resolveMonthExpenseAndProfit collected revenue basis', () => {
  it('uses authoritative collected amount for 26% estimate (ledgerFastPath parity)', () => {
    const result = resolveMonthExpenseAndProfit([], 87718, true);
    expect(result.expense).toBe(Math.round(87718 * 0.26));
    expect(result.profit).toBe(87718 - Math.round(87718 * 0.26));
  });

  it('subtracts actual expense rows when estimate mode off', () => {
    const rows = [{ type: 'expense', amount: 1500 }];
    const result = resolveMonthExpenseAndProfit(rows, 87718, false);
    expect(result.expense).toBe(1500);
    expect(result.profit).toBe(87718 - 1500);
  });
});
