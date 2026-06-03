import { describe, it, expect } from 'vitest';
import {
  buildAllFinanceRevenueEntries,
  buildCollectedRevenueEntries,
  collectMemberRevenueEntries,
} from '../src/features/finance/collectedRevenue.js';
import { sumMonthlyCollectedRevenue } from '../src/features/finance/monthlyRevenue.js';

const calendar = (v) => {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
};

function normalizeHistory(member) {
  const list = Array.isArray(member.paymentHistory) ? member.paymentHistory : [];
  return list.filter((h) => h && h.paidAt);
}

describe('buildCollectedRevenueEntries', () => {
  const deps = {
    todayKey: '2026-06-01',
    normalizeMemberPaymentHistory: normalizeHistory,
    retentionPaymentDeadline: () => null,
    localCalendarDateKey: calendar,
    isoDate: (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)),
  };

  it('sums payment paidAt in target month only', () => {
    const members = [{
      memberId: 'M1',
      amount: 5000,
      paymentHistory: [
        { id: 'p1', paidAt: '2026-05-15', amount: 1000 },
        { id: 'p2', paidAt: '2026-06-01', amount: 2000 },
      ],
    }];
    const entries = buildCollectedRevenueEntries(members, deps);
    expect(sumMonthlyCollectedRevenue(entries, '2026-05')).toBe(1000);
    expect(sumMonthlyCollectedRevenue(entries, '2026-06')).toBe(2000);
  });

  it('excludes billingDate fallback when paymentHistoryOnly', () => {
    const members = [{
      memberId: 'M2',
      amount: 9000,
      billingDate: '2026-05-10',
      paymentHistory: [],
    }];
    const entries = buildCollectedRevenueEntries(members, deps);
    expect(entries).toHaveLength(0);
  });
});

describe('buildAllFinanceRevenueEntries', () => {
  const deps = {
    todayKey: '2026-06-01',
    normalizeMemberPaymentHistory: normalizeHistory,
    retentionPaymentDeadline: () => null,
    localCalendarDateKey: calendar,
  };

  it('includes manual finance income by transaction date', () => {
    const members = [];
    const finance = [{ type: 'income', date: '2026-05-20', amount: 500 }];
    const entries = buildAllFinanceRevenueEntries(members, finance, deps);
    expect(sumMonthlyCollectedRevenue(entries, '2026-05')).toBe(500);
  });
});

describe('collectMemberRevenueEntries paymentHistoryOnly', () => {
  it('returns rows from history when present', () => {
    const rows = collectMemberRevenueEntries(
      {
        memberId: 'M3',
        paymentHistory: [{ paidAt: '2026-05-01', amount: 300 }],
      },
      {
        paymentHistoryOnly: true,
        normalizeMemberPaymentHistory: normalizeHistory,
        localCalendarDateKey: calendar,
      },
    );
    expect(rows).toEqual([{ receivedAt: '2026-05-01', amount: 300 }]);
  });
});
