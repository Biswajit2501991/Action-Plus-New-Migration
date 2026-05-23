import { describe, expect, it } from 'vitest';
import {
  calendarDateKey,
  paymentHistoryCanonicalDedupeKey,
  paymentRowMatchesId,
  stablePaymentHistoryRowId,
} from './paymentIds.js';

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

  it('matches via canonical key when sig day/amount align', () => {
    const sig = stablePaymentHistoryRowId({ ...row, id: '' }, memberId);
    expect(paymentRowMatchesId({ ...row, id: 'other-uuid' }, memberId, sig)).toBe(true);
  });

  it('does not match unrelated id', () => {
    expect(paymentRowMatchesId(row, memberId, 'other-id')).toBe(false);
  });
});

describe('calendarDateKey', () => {
  it('uses UTC date slice for ISO timestamps', () => {
    expect(calendarDateKey('2026-03-15T22:30:00.000Z')).toBe('2026-03-15');
  });
});

describe('paymentHistoryCanonicalDedupeKey', () => {
  it('collapses rows with same logical payment', () => {
    const a = { paidAt: '2026-03-15T10:00:00.000Z', amount: 500, method: 'UPI', source: 'manual' };
    const b = { paidAt: '2026-03-15', amount: 500, method: 'UPI', source: 'manual' };
    expect(paymentHistoryCanonicalDedupeKey(a)).toBe(paymentHistoryCanonicalDedupeKey(b));
  });
});
