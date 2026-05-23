import { describe, expect, it } from 'vitest';
import { paymentRowMatchesId, stablePaymentHistoryRowId } from './paymentIds.js';

describe('paymentRowMatchesId', () => {
  const memberId = 'M001';
  const row = {
    id: 'uuid-legacy-1',
    paidAt: '2026-03-15T10:00:00.000Z',
    amount: 1500,
    method: 'Cash',
    recordedBy: 'owner',
    source: 'manual',
    note: '',
    billingMonth: '2026-03',
  };

  it('matches raw database id', () => {
    expect(paymentRowMatchesId(row, memberId, 'uuid-legacy-1')).toBe(true);
  });

  it('matches stable sig id shown in UI when row still has a UUID', () => {
    const sig = stablePaymentHistoryRowId({ ...row, id: '' }, memberId);
    expect(sig.startsWith('sig:')).toBe(true);
    expect(paymentRowMatchesId(row, memberId, sig)).toBe(true);
  });

  it('does not match unrelated id', () => {
    expect(paymentRowMatchesId(row, memberId, 'other-id')).toBe(false);
  });
});
