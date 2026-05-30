import { describe, it, expect } from 'vitest';
import { sumMonthlyCollectedRevenue } from '../src/features/finance/monthlyRevenue.js';

describe('sumMonthlyCollectedRevenue', () => {
  it('sums entries in the target month only', () => {
    const entries = [
      { receivedAt: '2026-05-10', amount: 1000 },
      { receivedAt: '2026-05-28', amount: 500 },
      { receivedAt: '2026-04-30', amount: 200 },
    ];
    expect(sumMonthlyCollectedRevenue(entries, '2026-05')).toBe(1500);
    expect(sumMonthlyCollectedRevenue(entries, '2026-04')).toBe(200);
  });

  it('returns 0 for invalid month keys', () => {
    expect(sumMonthlyCollectedRevenue([{ receivedAt: '2026-05-01', amount: 1 }], '')).toBe(0);
    expect(sumMonthlyCollectedRevenue([{ receivedAt: '2026-05-01', amount: 1 }], 'bad')).toBe(0);
  });

  it('ignores zero or missing amounts', () => {
    const entries = [
      { receivedAt: '2026-05-01', amount: 0 },
      { receivedAt: '2026-05-02' },
      { receivedAt: '2026-05-03', amount: 300 },
    ];
    expect(sumMonthlyCollectedRevenue(entries, '2026-05')).toBe(300);
  });
});
