import { describe, it, expect } from 'vitest';
import { buildExpenseRow, validateExpenseDraft } from '../src/features/finance/expenseRow.js';
import { financeRowsForBulkSync } from '../src/features/finance/expenseApi.js';

describe('expenseRow', () => {
  it('validateExpenseDraft rejects empty amount and note', () => {
    expect(validateExpenseDraft({ amount: 0, note: 'x' }).ok).toBe(false);
    expect(validateExpenseDraft({ amount: 100, note: '' }).ok).toBe(false);
    expect(validateExpenseDraft({ amount: 100, note: 'ok' }).ok).toBe(true);
  });

  it('buildExpenseRow adds Added by metadata', () => {
    const row = buildExpenseRow(
      { date: '2026-06-30', amount: 1000, category: 'Rent', note: 'Extra' },
      { actor: 'Owner', userId: 'owner' },
    );
    expect(row.type).toBe('expense');
    expect(row.amount).toBe(1000);
    expect(row.note).toContain('Added by: Owner');
    expect(row.addedBy).toBe('Owner');
  });
});

describe('financeRowsForBulkSync', () => {
  it('excludes expense rows from bulk payload', () => {
    const rows = financeRowsForBulkSync([
      { type: 'expense', amount: 100 },
      { type: 'income', amount: 200, memberId: 'APG001' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('income');
  });
});
