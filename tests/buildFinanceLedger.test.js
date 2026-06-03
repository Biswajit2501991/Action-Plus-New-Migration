import { describe, it, expect } from 'vitest';
import { buildFinanceLedgerRows } from '../src/features/finance/buildFinanceLedger.js';

const deps = {
  normalizeMemberPaymentHistory: (m) => (Array.isArray(m.paymentHistory) ? m.paymentHistory : []),
  calendarDateKey: (v) => String(v || '').slice(0, 10),
  retentionPaymentDeadline: () => new Date('2020-01-01'),
  today: new Date('2026-06-15'),
};

describe('buildFinanceLedgerRows', () => {
  const members = [{
    memberId: 'M1',
    name: 'Raj',
    status: 'Active',
    billingDate: '2026-05-03',
    amount: 5000,
    paymentHistory: [{ paidAt: '2026-05-04', amount: 1000, id: 'p1' }],
  }];

  it('excludes billing-pending rows by default', () => {
    const rows = buildFinanceLedgerRows(members, [], deps);
    expect(rows.some((r) => r.status === 'pending')).toBe(false);
    expect(rows.filter((r) => r.source === 'payment')).toHaveLength(1);
  });

  it('sets paidMonth from payment history billing date', () => {
    const lateMembers = [{
      memberId: 'M2',
      name: 'Late',
      paymentHistory: [{
        paidAt: '2026-07-02',
        billingDate: '2026-05-30',
        paidMonth: '2026-05',
        amount: 900,
        id: 'p2',
      }],
    }];
    const rows = buildFinanceLedgerRows(lateMembers, [], deps);
    const pay = rows.find((r) => r.source === 'payment');
    expect(pay.date).toBe('2026-07-02');
    expect(pay.paidMonth).toBe('2026-05');
  });

  it('includes billing-pending when includePendingBilling is true', () => {
    const rows = buildFinanceLedgerRows(members, [], { ...deps, includePendingBilling: true });
    expect(rows.some((r) => r.status === 'pending')).toBe(true);
  });
});
