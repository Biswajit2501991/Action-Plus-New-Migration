import { describe, it, expect } from 'vitest';
import { mapDbPaymentsToRecords } from './financeSummaryService.js';

describe('mapDbPaymentsToRecords', () => {
  it('maps member_code from pk meta', () => {
    const meta = new Map([['pk1', { member_code: 'APG001', name: 'Raj' }]]);
    const rows = mapDbPaymentsToRecords([
      { member_id: 'pk1', paid_at: '2026-05-04T00:00:00.000Z', amount: 1000, external_payment_id: 'p1' },
    ], meta);
    expect(rows[0].memberId).toBe('APG001');
    expect(rows[0].memberName).toBe('Raj');
    expect(rows[0].amount).toBe(1000);
  });

  it('maps paid_month and billing fields from DB', () => {
    const meta = new Map([['pk1', { member_code: 'APG001', name: 'Raj' }]]);
    const rows = mapDbPaymentsToRecords([
      {
        member_id: 'pk1',
        paid_at: '2026-07-02T00:00:00.000Z',
        amount: 900,
        external_payment_id: 'p1',
        paid_month: '2026-05',
        billing_date: '2026-05-30',
        billing_month: '2026-05',
      },
    ], meta);
    expect(rows[0].paidMonth).toBe('2026-05');
    expect(rows[0].billingDate).toBe('2026-05-30');
  });
});
