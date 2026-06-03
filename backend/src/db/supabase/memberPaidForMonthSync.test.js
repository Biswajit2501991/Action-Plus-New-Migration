import { describe, expect, it } from 'vitest';
import { buildPaidForMonthLedgerRows } from './memberPaidForMonthSync.js';

describe('buildPaidForMonthLedgerRows', () => {
  it('creates one row per paid month from payment history', () => {
    const rows = buildPaidForMonthLedgerRows({
      memberId: 'APG-001',
      status: 'Active',
      amount: 900,
      paymentHistory: [
        { id: 'p1', paidMonth: '2026-05', amount: 900, paidAt: '2026-07-02' },
        { id: 'p2', paidMonth: '2026-06', amount: 900, paidAt: '2026-08-01' },
      ],
    }, 'gym-1', 42);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.paid_for_month).sort()).toEqual(['2026-05', '2026-06']);
    expect(rows[0].member_status).toBe('Active');
  });

  it('sums multiple payments in same paid for month', () => {
    const rows = buildPaidForMonthLedgerRows({
      memberId: 'APG-002',
      status: 'Active',
      paymentHistory: [
        { id: 'p1', paidMonth: '2026-05', amount: 500, paidAt: '2026-07-02' },
        { id: 'p2', paidMonth: '2026-05', amount: 400, paidAt: '2026-07-10' },
      ],
    }, 'gym-1', 7);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(900);
  });
});
