import { describe, expect, it, vi } from 'vitest';
import {
  buildPaidForMonthLedgerRows,
  mergeComputedLedgerWithExisting,
  paymentMonthsFromMember,
  syncMemberPaidForMonthLedger,
  upsertMembershipPayMonthRow,
} from './memberPaidForMonthSync.js';

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

describe('mergeComputedLedgerWithExisting', () => {
  it('preserves staff override when month has no payment history', () => {
    const computed = buildPaidForMonthLedgerRows({
      memberId: 'APG-003',
      status: 'Active',
      amount: 699,
      payMonth: '2026-05',
      paymentHistory: [],
    }, 'gym-1', 9);
    const existing = [{ paid_for_month: '2026-05', amount: 1000 }];
    const merged = mergeComputedLedgerWithExisting(computed, existing, paymentMonthsFromMember({
      paymentHistory: [],
    }));
    expect(merged[0].amount).toBe(1000);
  });

  it('uses payment sum when month is payment-driven', () => {
    const member = {
      memberId: 'APG-004',
      status: 'Active',
      amount: 699,
      paymentHistory: [{ id: 'p1', paidMonth: '2026-05', amount: 900, paidAt: '2026-07-02' }],
    };
    const computed = buildPaidForMonthLedgerRows(member, 'gym-1', 10);
    const existing = [{ paid_for_month: '2026-05', amount: 1000 }];
    const merged = mergeComputedLedgerWithExisting(
      computed,
      existing,
      paymentMonthsFromMember(member),
    );
    expect(merged[0].amount).toBe(900);
  });
});

describe('syncMemberPaidForMonthLedger', () => {
  it('upserts without deleting historical months', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockResolvedValue({ error: null });
    const sb = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({
              data: [{ paid_for_month: '2026-04', amount: 500 }],
              error: null,
            }),
          }),
        }),
        upsert: upsert,
        update: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => update(),
            }),
          }),
        }),
      }),
    };
    await syncMemberPaidForMonthLedger(sb, {
      gymId: 'gym-1',
      memberPk: 1,
      member: {
        memberId: 'APG-005',
        status: 'Active',
        payMonth: '2026-05',
        amount: 699,
        paymentHistory: [],
      },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    const rows = upsert.mock.calls[0][0];
    expect(rows.some((r) => r.paid_for_month === '2026-05')).toBe(true);
  });
});

describe('upsertMembershipPayMonthRow', () => {
  it('upserts current pay month only', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const sb = {
      from: (table) => {
        if (table === 'member_paid_for_month') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
            upsert,
          };
        }
        return {};
      },
    };
    await upsertMembershipPayMonthRow(sb, {
      gymId: 'gym-1',
      memberPk: 2,
      member: { memberId: 'APG-006', payMonth: '2026-06', amount: 800, status: 'Active' },
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].paid_for_month).toBe('2026-06');
    expect(upsert.mock.calls[0][0].amount).toBe(800);
  });
});
