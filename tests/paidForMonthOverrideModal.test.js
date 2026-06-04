import { describe, expect, it } from 'vitest';
import { confirmPaidForMonthAmountOverride } from '../src/features/members/paidForMonthOverrideModal.js';

describe('confirmPaidForMonthAmountOverride', () => {
  it('returns not confirmed when document is unavailable', async () => {
    const result = await confirmPaidForMonthAmountOverride({
      paidForMonth: '2026-05',
      existingAmount: 699,
      newAmount: 1000,
    });
    expect(result).toEqual({ confirmed: false, reason: '' });
  });
});
